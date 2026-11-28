import 'server-only';

// Server-side agent loop for Mercury (OpenAI-compatible tool calling).
//
//   step 1..maxSteps:
//     stream /chat/completions with tools  ->  text / diffusion frames to the client
//     if the model asked for tools: run them (in parallel), append results, repeat
//     else: done
//
// Without tools this is a single streamed call, so /api/chat always uses it.
import type { ChatStreamEvent } from '@/lib/chat/protocol';
import { createSseParser } from '@/lib/sse';
import { inceptionFetch } from '@/lib/server/inception';
import type { MessageUsage, SourceRef } from '@/lib/types';
import type { AgentMessage, AgentTool } from './types';

export const MAX_TOOL_RESULT_CHARS = 12_000;
const DISPLAY_CHARS = 1_200;
const DEFAULT_TOOL_TIMEOUT_MS = 25_000;

export interface RunAgentOptions {
  /** Upstream request fields except messages/tools/stream (model, reasoning_effort, ...). */
  request: Record<string, unknown>;
  messages: AgentMessage[];
  tools?: AgentTool[];
  /** Max model calls. The last one is forced to answer without tools. */
  maxSteps?: number;
  diffusing?: boolean;
  emit: (e: ChatStreamEvent) => void;
  signal: AbortSignal;
}

interface StreamedCall {
  id: string;
  name: string;
  args: string;
}

interface UpstreamChunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index?: number; id?: string | null; function?: { name?: string | null; arguments?: string | null } }[];
    };
    finish_reason?: string | null;
    diffusion_meta?: { diffusion_progress?: number };
  }[];
  diffusion_meta?: { diffusion_progress?: number };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  server_timing?: { server_latency_ms?: number };
  warning?: string | null;
  error?: unknown;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
}

function errorText(err: unknown): string {
  if (typeof err === 'string') return err;
  const m = (err as { message?: unknown })?.message;
  return typeof m === 'string' ? m : 'The model returned an error.';
}

/** Run the agent loop, emitting protocol events. Resolves when finished. */
export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const { emit, signal, diffusing = false } = opts;
  const tools = opts.tools ?? [];
  const maxSteps = tools.length ? Math.max(1, opts.maxSteps ?? 6) : 1;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const messages: AgentMessage[] = [...opts.messages];
  const usage: MessageUsage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cachedTokens: 0, serverLatencyMs: 0 };
  const allSources: SourceRef[] = [];
  let finishReason: string | null = null;

  for (let step = 1; step <= maxSteps; step++) {
    if (signal.aborted) return;
    if (tools.length) emit({ t: 'step', step });
    const lastStep = step === maxSteps;

    const body: Record<string, unknown> = {
      ...opts.request,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (diffusing) body.diffusing = true;
    if (tools.length) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = lastStep ? 'none' : 'auto';
    }

    const res = await inceptionFetch('/chat/completions', body, signal);
    const calls: StreamedCall[] = [];
    const byIndex = new Map<number, StreamedCall>();
    let stepText = '';
    let stepFinish: string | null = null;

    const parser = createSseParser((data) => {
      if (data === '[DONE]') return;
      let chunk: UpstreamChunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        return;
      }
      if (chunk.error) {
        emit({ t: 'error', message: errorText(chunk.error) });
        return;
      }
      if (typeof chunk.warning === 'string' && chunk.warning) emit({ t: 'warning', message: chunk.warning });
      for (const choice of chunk.choices ?? []) {
        const delta = choice.delta;
        const content = delta?.content;
        if (typeof content === 'string' && content !== '') {
          if (diffusing) {
            stepText = content;
            const p = Number(chunk.diffusion_meta?.diffusion_progress ?? choice.diffusion_meta?.diffusion_progress ?? 0);
            emit({ t: 'frame', v: content, p: Number.isFinite(p) ? p : 0 });
          } else {
            stepText += content;
            emit({ t: 'text', v: content });
          }
        }
        for (const tc of delta?.tool_calls ?? []) {
          const idx = tc.index ?? calls.length;
          let call = byIndex.get(idx);
          // A new id at a known index means a new call (defensive: some
          // non-streamed responses reuse index 0).
          if (!call || (tc.id && call.id && tc.id !== call.id)) {
            call = { id: tc.id || `call_${step}_${calls.length}`, name: '', args: '' };
            byIndex.set(idx, call);
            calls.push(call);
          }
          if (tc.function?.name) call.name += tc.function.name;
          if (tc.function?.arguments) call.args += tc.function.arguments;
        }
        if (choice.finish_reason) stepFinish = choice.finish_reason;
      }
      if (chunk.usage) {
        const u = chunk.usage;
        usage.promptTokens += u.prompt_tokens ?? 0;
        usage.completionTokens += u.completion_tokens ?? 0;
        usage.reasoningTokens! += u.completion_tokens_details?.reasoning_tokens ?? 0;
        usage.cachedTokens! += u.prompt_tokens_details?.cached_tokens ?? 0;
        usage.serverLatencyMs! += chunk.server_timing?.server_latency_ms ?? 0;
      }
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.end();
    } finally {
      reader.releaseLock();
    }
    finishReason = stepFinish;

    // Tool calls are detected by presence, not finish_reason (Mercury can
    // report "stop" for forced tool calls).
    const runnable = calls.filter((c) => c.name);
    if (!runnable.length || lastStep) break;

    messages.push({
      role: 'assistant',
      content: stepText || null,
      tool_calls: runnable.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.args || '{}' },
      })),
    });

    const results = await Promise.all(runnable.map((c) => runTool(c, byName, emit, signal)));
    for (const r of results) {
      messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
      for (const s of r.sources) {
        if (!allSources.some((x) => x.url === s.url)) allSources.push(s);
      }
    }
    const fresh = results.flatMap((r) => r.sources);
    if (fresh.length) emit({ t: 'sources', sources: fresh });
  }

  emit({ t: 'finish', reason: finishReason });
  emit({ t: 'usage', usage });
}

async function runTool(
  call: StreamedCall,
  byName: Map<string, AgentTool>,
  emit: (e: ChatStreamEvent) => void,
  signal: AbortSignal,
): Promise<{ id: string; content: string; sources: SourceRef[] }> {
  const tool = byName.get(call.name);
  let args: Record<string, unknown> = {};
  try {
    const parsed = call.args.trim() ? JSON.parse(call.args) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed;
  } catch {
    /* handled below */
  }
  let label: string | undefined;
  try {
    label = tool?.label?.(args);
  } catch {
    label = undefined;
  }
  emit({ t: 'tool_start', id: call.id, name: call.name, label, source: tool?.source, args: call.args || '{}' });

  if (!tool) {
    const error = `Unknown tool "${call.name}".`;
    emit({ t: 'tool_end', id: call.id, ok: false, error });
    return { id: call.id, content: `Error: ${error}`, sources: [] };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS);
  try {
    const result = await tool.execute(args, { signal: controller.signal, emit });
    const content = truncate(result.content || '(empty result)', MAX_TOOL_RESULT_CHARS);
    emit({
      t: 'tool_end',
      id: call.id,
      ok: true,
      result: truncate(result.display ?? result.content ?? '', DISPLAY_CHARS),
    });
    return { id: call.id, content, sources: result.sources ?? [] };
  } catch (err) {
    const timedOut = controller.signal.aborted && !signal.aborted;
    const error = timedOut ? 'Tool timed out.' : (err as Error)?.message || 'Tool failed.';
    emit({ t: 'tool_end', id: call.id, ok: false, error });
    return { id: call.id, content: `Error: ${error}`, sources: [] };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
