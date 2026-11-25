'use client';

// Orchestrates a chat turn: writes the user message, calls /api/chat, renders
// streamed text (rAF-throttled) or paced diffusion frames into the assistant
// message, and persists the final result. UI components only call these
// functions; they never talk to the network directly.
import { useCallback } from 'react';
import { toast } from 'sonner';
import { createNdjsonDecoder } from './protocol';
import { createFramePlayer } from './frame-player';
import { useChatStore } from '@/lib/store/chat-store';
import { flushPersist } from '@/lib/store/persist-storage';
import type { ApiErrorBody, ChatMessage, ChatRequestBody, MessageUsage } from '@/lib/types';

const MAX_CONTEXT_CHARS = 400_000;

export interface SendOptions {
  /** Voice turn: spoken-style answer, low latency, no diffusion. */
  voice?: boolean;
  /** Called with the full text so far whenever it changes. */
  onText?: (fullText: string) => void;
}

export interface TurnResult {
  content: string;
  error?: string;
  aborted?: boolean;
}

function buildContext(messages: ChatMessage[]): ChatRequestBody['messages'] {
  const usable = messages.filter((m) => !m.pending && !m.error && m.content.trim() !== '');
  const out: ChatRequestBody['messages'] = [];
  let total = 0;
  for (let i = usable.length - 1; i >= 0; i--) {
    const m = usable[i];
    total += m.content.length;
    if (total > MAX_CONTEXT_CHARS && out.length > 0) break;
    out.unshift({ role: m.role, content: m.content });
  }
  // The API expects the history to start with a user turn.
  while (out.length && out[0].role !== 'user') out.shift();
  return out.slice(-200);
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

/** Clears the streaming marker for this message and flushes persistence. */
function finalize(conversationId: string, messageId: string) {
  const s = useChatStore.getState();
  if (s.streaming?.conversationId === conversationId && s.streaming.messageId === messageId) {
    s.setStreaming(null);
  }
  flushPersist();
}

// Module-level so every component using the hook (chat input, voice overlay)
// controls the same in-flight request.
const abortRef: { current: AbortController | null } = { current: null };

export function useChatController() {

  /** Stream an assistant reply into a fresh message after the current history. */
  const runTurn = useCallback(async (conversationId: string, opts: SendOptions = {}): Promise<TurnResult> => {
    const store = useChatStore.getState();
    const conv = store.conversations[conversationId];
    if (!conv) return { content: '', error: 'Conversation not found.' };
    const { settings } = store;
    const mode = opts.voice ? 'streaming' : settings.mode;

    const context = buildContext(conv.messages);
    if (!context.length) return { content: '', error: 'Nothing to send.' };

    const assistantId = store.appendMessage(conversationId, {
      role: 'assistant',
      content: '',
      pending: true,
      model: settings.model,
      mode,
      voice: opts.voice || undefined,
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

    // rAF-throttled writes for append streaming.
    let rafId: number | null = null;
    const scheduleWrite = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        useChatStore.getState().patchMessage(conversationId, assistantId, { content });
      });
    };

    const player =
      mode === 'diffusing'
        ? createFramePlayer({
            onFrame: (text) => {
              content = text;
              useChatStore.getState().patchMessage(conversationId, assistantId, { content: text });
              opts.onText?.(text);
            },
          })
        : null;
    let lastFrame = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: context,
          model: settings.model,
          mode,
          reasoningEffort: settings.reasoningEffort,
          voice: opts.voice || undefined,
        } satisfies ChatRequestBody),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(await readError(res));

      const decoder = createNdjsonDecoder((e) => {
        switch (e.t) {
          case 'text':
            content += e.v;
            scheduleWrite();
            opts.onText?.(content);
            break;
          case 'frame':
            lastFrame = e.v;
            player?.push(e.v, e.p);
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

      if (player) {
        player.end(lastFrame || undefined);
        await player.done;
      }
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      if (player) player.flush();
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (aborted) {
        useChatStore.getState().patchMessage(conversationId, assistantId, {
          content,
          pending: false,
          finishReason: 'stopped',
          durationMs: Math.round(performance.now() - started),
          ...(content ? {} : { error: 'Stopped before any output.' }),
        });
        finalize(conversationId, assistantId);
        return { content, aborted: true };
      }
      streamError = (err as Error)?.message || 'Something went wrong.';
    }

    if (rafId !== null) cancelAnimationFrame(rafId);

    if (!streamError && !content.trim()) {
      streamError =
        finishReason === 'length'
          ? 'The model used its whole token budget on reasoning. Try a lower reasoning effort.'
          : 'The model returned an empty response.';
    }

    useChatStore.getState().patchMessage(conversationId, assistantId, {
      content,
      pending: false,
      finishReason,
      usage,
      durationMs: Math.round(performance.now() - started),
      error: streamError,
    });
    finalize(conversationId, assistantId);
    // Voice mode shows its own error state; text turns also get a toast so a
    // failure is noticed even when the thread is scrolled away.
    if (streamError && !opts.voice) toast.error(streamError);
    return { content, error: streamError };
  }, []);



  /** Send a user message in the active conversation (creating one if needed). */
  const send = useCallback(
    async (text: string, opts: SendOptions = {}): Promise<TurnResult> => {
      const trimmed = text.trim();
      if (!trimmed) return { content: '', error: 'Empty message.' };
      const store = useChatStore.getState();
      if (store.streaming) return { content: '', error: 'A response is already in progress.' };
      const conversationId =
        store.activeId && store.conversations[store.activeId] ? store.activeId : store.createConversation();
      store.appendMessage(conversationId, { role: 'user', content: trimmed, voice: opts.voice || undefined });
      flushPersist();
      return runTurn(conversationId, opts);
    },
    [runTurn],
  );

  /** Re-run the assistant reply for the given assistant message. */
  const regenerate = useCallback(
    async (messageId: string) => {
      const store = useChatStore.getState();
      const conversationId = store.activeId;
      if (!conversationId || store.streaming) return;
      store.truncateFrom(conversationId, messageId);
      return runTurn(conversationId);
    },
    [runTurn],
  );

  /** Replace a user message's text and re-run from there. */
  const editAndResend = useCallback(
    async (messageId: string, text: string) => {
      const store = useChatStore.getState();
      const conversationId = store.activeId;
      const trimmed = text.trim();
      if (!conversationId || store.streaming || !trimmed) return;
      store.truncateFrom(conversationId, messageId);
      store.appendMessage(conversationId, { role: 'user', content: trimmed });
      return runTurn(conversationId);
    },
    [runTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { send, regenerate, editAndResend, stop };
}
