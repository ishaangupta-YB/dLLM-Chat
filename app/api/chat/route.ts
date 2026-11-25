import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CHAT_MODEL_IDS, getModel } from '@/lib/models';
import { encodeEvent, type ChatStreamEvent } from '@/lib/chat/protocol';
import { createSseParser } from '@/lib/sse';
import { guard, jsonError, readJson } from '@/lib/server/guard';
import { inceptionFetch, UpstreamError } from '@/lib/server/inception';
import type { MessageUsage } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BODY_BYTES = 2_000_000;
const MAX_MESSAGES = 200;
const MAX_CONTENT_CHARS = 200_000;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(MAX_CONTENT_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
  model: z.enum(CHAT_MODEL_IDS as [string, ...string[]]),
  mode: z.enum(['streaming', 'diffusing']),
  reasoningEffort: z.enum(['instant', 'low', 'medium', 'high']),
  voice: z.boolean().optional(),
});

const SYSTEM_PROMPT = `You are Mercury, a fast and helpful assistant inside dLLM Chat.
Format answers in GitHub-flavored Markdown. Always put code in fenced code blocks with a language tag (for example \`\`\`python). When asked for a coding problem or program, give one complete, runnable code block per file rather than many fragments.`;

const VOICE_PROMPT = `You are Mercury, a friendly voice assistant. Your reply will be read aloud.
NEVER use markdown, bullet points, code blocks, tables, emojis or URLs. Speak in short, natural sentences. Keep every response as short as possible while still being helpful, and ask for one thing at a time.`;

export async function POST(req: NextRequest) {
  const blocked = guard(req, 'chat', 40);
  if (blocked) return blocked;

  const raw = await readJson(req, MAX_BODY_BYTES);
  if (raw === null) return jsonError('Invalid or oversized JSON body.', 400, 'bad_request');
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid request.', 400, 'bad_request');
  }
  const { messages, mode, voice } = parsed.data;
  if (messages[messages.length - 1].role !== 'user') {
    return jsonError('The last message must come from the user.', 400, 'bad_request');
  }

  // Voice turns: Mercury Voice is enterprise-only. When an id is configured we
  // use it; otherwise the documented self-serve path is mercury-3 + realtime.
  const voiceModel = process.env.MERCURY_VOICE_MODEL?.trim();
  let model: string = parsed.data.model;
  let reasoningEffort: string = parsed.data.reasoningEffort;
  if (voice) {
    model = voiceModel || 'mercury-3';
    // Mercury Voice rejects "instant"; low is the documented lowest-TTFT setting.
    reasoningEffort = 'low';
  }
  const info = getModel(model);

  const upstreamBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: voice ? VOICE_PROMPT : SYSTEM_PROMPT },
      ...messages.filter((m) => m.content.trim() !== ''),
    ],
    stream: true,
    stream_options: { include_usage: true },
    reasoning_effort: reasoningEffort,
    // Reasoning tokens count against this budget; small budgets can yield an
    // empty answer with finish_reason "length".
    max_completion_tokens: voice ? 4096 : (info?.defaultMaxTokens ?? 16_384),
  };
  if (mode === 'diffusing' && !voice) upstreamBody.diffusing = true;
  if (voice) {
    upstreamBody.realtime = true;
    upstreamBody.temperature = 0.75;
  }

  let upstream: Response;
  try {
    upstream = await inceptionFetch('/chat/completions', upstreamBody, req.signal);
  } catch (err) {
    if (err instanceof UpstreamError) return jsonError(err.message, err.status, err.code);
    if ((err as Error)?.name === 'AbortError') return new Response(null, { status: 499 });
    console.error('[api/chat] unexpected error', err);
    return jsonError('Unexpected server error.', 500, 'internal');
  }

  const diffusing = upstreamBody.diffusing === true;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(encodeEvent(e)));
      let finished = false;

      const parser = createSseParser((data) => {
        if (data === '[DONE]') {
          finished = true;
          return;
        }
        let chunk: UpstreamChunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          return;
        }
        if (chunk.error) {
          send({ t: 'error', message: errorText(chunk.error) });
          return;
        }
        if (typeof chunk.warning === 'string' && chunk.warning) {
          send({ t: 'warning', message: chunk.warning });
        }
        for (const choice of chunk.choices ?? []) {
          const content = choice.delta?.content;
          if (typeof content === 'string' && content !== '') {
            if (diffusing) {
              const p = Number(chunk.diffusion_meta?.diffusion_progress ?? choice.diffusion_meta?.diffusion_progress ?? 0);
              send({ t: 'frame', v: content, p: Number.isFinite(p) ? p : 0 });
            } else {
              send({ t: 'text', v: content });
            }
          }
          if (choice.finish_reason) send({ t: 'finish', reason: choice.finish_reason });
        }
        if (chunk.usage) send({ t: 'usage', usage: mapUsage(chunk) });
      });

      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());
        parser.end();
        if (!finished) send({ t: 'finish', reason: null });
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          console.error('[api/chat] stream error', err);
          try {
            send({ t: 'error', message: 'The response stream was interrupted.' });
          } catch {
            /* controller already closed */
          }
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      upstream.body?.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

interface UpstreamChunk {
  choices?: {
    delta?: { content?: string | null };
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

function mapUsage(chunk: UpstreamChunk): MessageUsage {
  const u = chunk.usage ?? {};
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
    cachedTokens: u.prompt_tokens_details?.cached_tokens,
    serverLatencyMs: chunk.server_timing?.server_latency_ms,
  };
}

function errorText(err: unknown): string {
  if (typeof err === 'string') return err;
  const m = (err as { message?: unknown })?.message;
  if (typeof m === 'string') return m;
  return 'The model returned an error.';
}
