'use client';

// Client controller for the coding agent. Mirrors lib/chat/use-chat-controller:
// appends the user + assistant messages to the active code conversation, calls
// /api/code with the recent messages and the current project files, streams the
// reply text, records tool calls, applies `file` events to the project live and
// snapshots a version when the turn changed files.
import { useCallback } from 'react';
import { toast } from 'sonner';
import { createNdjsonDecoder } from '@/lib/chat/protocol';
import { maybeGenerateTitle } from '@/lib/chat/title';
import { useChatStore } from '@/lib/store/chat-store';
import { useKeysStore } from '@/lib/store/keys-store';
import { flushPersist } from '@/lib/store/persist-storage';
import type { ApiErrorBody, ChatMessage, CodeRequestBody, MessageUsage, SourceRef, ToolCallRecord, ToolRequestConfig } from '@/lib/types';
import { useVersionsStore } from './versions';

const MAX_CONTEXT_MESSAGES = 24;
const MAX_CONTEXT_CHARS = 120_000;

export interface CodeTurnResult {
  content: string;
  filesChanged: string[];
  error?: string;
  aborted?: boolean;
}

/** Web tools for the coding agent, from the user's tool settings. */
function codeToolConfig(): ToolRequestConfig | undefined {
  const { tools } = useChatStore.getState().settings;
  if (!tools.enabled || (!tools.webSearch && !tools.utilities)) return undefined;
  const keys = useKeysStore.getState().keys;
  return {
    webSearch: tools.webSearch,
    utilities: tools.utilities,
    keys: keys.tavily ? { tavily: keys.tavily } : undefined,
  };
}

/** Recent turns. Assistant turns mention which files they changed. */
export function buildCodeContext(messages: ChatMessage[]): CodeRequestBody['messages'] {
  const usable = messages.filter((m) => !m.pending && (m.content.trim() || m.filesChanged?.length) && !(m.error && !m.filesChanged?.length));
  const out: CodeRequestBody['messages'] = [];
  let total = 0;
  for (let i = usable.length - 1; i >= 0 && out.length < MAX_CONTEXT_MESSAGES; i--) {
    const m = usable[i];
    let content = m.content.trim();
    if (m.role === 'assistant' && m.filesChanged?.length) {
      content = `${content}\n\n[Files changed in this turn: ${m.filesChanged.join(', ')}]`.trim();
    }
    total += content.length;
    if (total > MAX_CONTEXT_CHARS && out.length > 0) break;
    out.unshift({ role: m.role, content: content.slice(0, 100_000) });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** File contents live in the project; keep only the path in the tool record (localStorage budget). */
export function compactArgs(name: string, args: string): string {
  if (name === 'write_file' || name === 'edit_file') {
    try {
      const a = JSON.parse(args) as { path?: unknown };
      return JSON.stringify({ path: typeof a.path === 'string' ? a.path : undefined });
    } catch {
      return '{}';
    }
  }
  return args.length > 2000 ? args.slice(0, 2000) : args;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body?.error?.message) return body.error.message;
  } catch {
    /* fall through */
  }
  if (res.status === 429) return 'Rate limit reached. Please wait a moment and try again.';
  return `Request failed (${res.status}).`;
}

const abortRef: { current: AbortController | null } = { current: null };

/** Make sure a code conversation is active; returns its id. */
export function ensureCodeConversation(): string {
  const s = useChatStore.getState();
  const active = s.activeId ? s.conversations[s.activeId] : undefined;
  if (active && active.kind === 'code') return active.id;
  return s.createConversation('code');
}

export function useCodeAgent() {
  const runTurn = useCallback(async (conversationId: string): Promise<CodeTurnResult> => {
    const store = useChatStore.getState();
    const conv = store.conversations[conversationId];
    if (!conv) return { content: '', filesChanged: [], error: 'Conversation not found.' };
    const { settings } = store;
    const context = buildCodeContext(conv.messages);
    if (!context.length) return { content: '', filesChanged: [], error: 'Nothing to send.' };
    const files = { ...(conv.project?.files ?? {}) };

    const assistantId = store.appendMessage(conversationId, {
      role: 'assistant',
      content: '',
      pending: true,
      model: settings.model,
      mode: 'streaming',
    });
    store.setStreaming({ conversationId, messageId: assistantId });

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const started = performance.now();
    let content = '';
    let usage: MessageUsage | undefined;
    let finishReason: string | null = null;
    let streamError: string | undefined;
    let toolCalls: ToolCallRecord[] = [];
    let sources: SourceRef[] = [];
    const filesChanged: string[] = [];
    let needsSeparator = false;

    const patch = (p: Partial<ChatMessage>) => useChatStore.getState().patchMessage(conversationId, assistantId, p);
    let rafId: number | null = null;
    const scheduleWrite = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        patch({ content });
      });
    };
    const writeAgent = () =>
      patch({
        toolCalls: toolCalls.length ? toolCalls : undefined,
        sources: sources.length ? sources : undefined,
        filesChanged: filesChanged.length ? [...filesChanged] : undefined,
      });

    try {
      const res = await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: context,
          model: settings.model,
          reasoningEffort: settings.reasoningEffort,
          files,
          tools: codeToolConfig(),
        } satisfies CodeRequestBody),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(await readError(res));

      const decoder = createNdjsonDecoder((e) => {
        switch (e.t) {
          case 'text':
            if (needsSeparator && content.trim()) content += '\n\n';
            needsSeparator = false;
            content += e.v;
            scheduleWrite();
            break;
          case 'frame':
            content = e.v;
            scheduleWrite();
            break;
          case 'step':
            if (e.step > 1) needsSeparator = true;
            break;
          case 'tool_start':
            toolCalls = [
              ...toolCalls,
              { id: e.id, name: e.name, label: e.label, source: e.source, args: compactArgs(e.name, e.args), status: 'running', startedAt: Date.now() },
            ];
            writeAgent();
            break;
          case 'tool_end':
            toolCalls = toolCalls.map((tc) =>
              tc.id === e.id ? { ...tc, status: e.ok ? 'done' : 'error', result: e.result, error: e.error, endedAt: Date.now() } : tc,
            );
            writeAgent();
            break;
          case 'sources': {
            const seen = new Set(sources.map((s) => s.url));
            sources = [...sources, ...e.sources.filter((s) => !seen.has(s.url))];
            writeAgent();
            break;
          }
          case 'file':
            useChatStore.getState().applyFileChange(conversationId, e.path, e.deleted ? null : (e.content ?? ''));
            if (!e.deleted) useChatStore.getState().setActiveFile(conversationId, e.path);
            if (!filesChanged.includes(e.path)) filesChanged.push(e.path);
            writeAgent();
            break;
          case 'finish':
            finishReason = e.reason;
            break;
          case 'usage':
            usage = e.usage;
            break;
          case 'error':
            streamError = e.message;
            break;
          case 'warning':
            toast.warning(e.message);
            break;
        }
      });

      const reader = res.body.getReader();
      const td = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        decoder.push(td.decode(value, { stream: true }));
      }
      decoder.push(td.decode());
      decoder.end();
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (toolCalls.some((t) => t.status === 'running')) {
        toolCalls = toolCalls.map((t) =>
          t.status === 'running' ? { ...t, status: 'error', error: aborted ? 'Stopped' : 'Interrupted', endedAt: Date.now() } : t,
        );
        writeAgent();
      }
      if (aborted) {
        patch({
          content,
          pending: false,
          finishReason: 'stopped',
          durationMs: Math.round(performance.now() - started),
          ...(content || filesChanged.length ? {} : { error: 'Stopped before any output.' }),
        });
        finish(conversationId, assistantId, filesChanged);
        return { content, filesChanged, aborted: true };
      }
      streamError = (err as Error)?.message || 'Something went wrong.';
    }

    if (rafId !== null) cancelAnimationFrame(rafId);
    if (!streamError && !content.trim() && !filesChanged.length) {
      streamError =
        finishReason === 'length'
          ? 'The model used its whole token budget. Try a lower reasoning effort or a smaller change.'
          : 'The model returned an empty response.';
    }
    if (!content.trim() && filesChanged.length && !streamError) {
      content = `Updated ${filesChanged.join(', ')}.`;
    }

    patch({
      content,
      pending: false,
      finishReason,
      usage,
      durationMs: Math.round(performance.now() - started),
      error: streamError,
    });
    finish(conversationId, assistantId, filesChanged);
    if (streamError) toast.error(streamError);
    else void maybeGenerateTitle(conversationId);
    return { content, filesChanged, error: streamError };
  }, []);

  const send = useCallback(
    async (text: string): Promise<CodeTurnResult> => {
      const trimmed = text.trim();
      if (!trimmed) return { content: '', filesChanged: [], error: 'Empty message.' };
      if (useChatStore.getState().streaming) return { content: '', filesChanged: [], error: 'A response is already in progress.' };
      const conversationId = ensureCodeConversation();
      useChatStore.getState().appendMessage(conversationId, { role: 'user', content: trimmed });
      flushPersist();
      return runTurn(conversationId);
    },
    [runTurn],
  );

  /** Re-run the reply for an assistant message, restoring the files from before it. */
  const regenerate = useCallback(
    async (messageId: string) => {
      const store = useChatStore.getState();
      const conversationId = store.activeId;
      if (!conversationId || store.streaming) return;
      const conv = store.conversations[conversationId];
      const idx = conv?.messages.findIndex((m) => m.id === messageId) ?? -1;
      if (!conv || idx === -1) return;
      rollbackFrom(conversationId, idx);
      store.truncateFrom(conversationId, messageId);
      return runTurn(conversationId);
    },
    [runTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { send, regenerate, stop };
}

/** After a turn: snapshot a version when files changed, clear the streaming marker. */
function finish(conversationId: string, messageId: string, filesChanged: string[]) {
  const s = useChatStore.getState();
  if (filesChanged.length) {
    const files = s.conversations[conversationId]?.project?.files ?? {};
    useVersionsStore.getState().addVersion(conversationId, { messageId, files });
  }
  if (s.streaming?.conversationId === conversationId && s.streaming.messageId === messageId) s.setStreaming(null);
  flushPersist();
}

/**
 * Before removing messages from index `idx` on: if any of them changed files,
 * restore the project to the version before them and drop their versions.
 */
function rollbackFrom(conversationId: string, idx: number) {
  const conv = useChatStore.getState().conversations[conversationId];
  if (!conv) return;
  const removed = conv.messages.slice(idx);
  if (!removed.some((m) => m.filesChanged?.length)) return;
  const removedIds = new Set(removed.map((m) => m.id));
  const versions = useVersionsStore.getState().byConversation[conversationId] ?? [];
  const keptIds = new Set(conv.messages.slice(0, idx).map((m) => m.id));
  const previous = [...versions].reverse().find((v) => keptIds.has(v.messageId));
  useChatStore.getState().setProject(conversationId, {
    files: previous ? { ...previous.files } : {},
    activeFile: undefined,
    version: 0,
  });
  useVersionsStore.getState().removeForMessages(conversationId, [...removedIds]);
}
