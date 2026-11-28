import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CHAT_MODEL_IDS, getModel } from '@/lib/models';
import { encodeEvent, type ChatStreamEvent } from '@/lib/chat/protocol';
import { runAgent } from '@/lib/agent/runtime';
import { ToolConfigSchema } from '@/lib/agent/schema';
import { resolveTools } from '@/lib/agent/tools';
import { guard, jsonError, readJson } from '@/lib/server/guard';
import { UpstreamError } from '@/lib/server/inception';

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
  tools: ToolConfigSchema,
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

  const request: Record<string, unknown> = {
    model,
    reasoning_effort: reasoningEffort,
    // Reasoning tokens count against this budget; small budgets can yield an
    // empty answer with finish_reason "length".
    max_completion_tokens: voice ? 4096 : (info?.defaultMaxTokens ?? 16_384),
  };
  if (voice) {
    request.realtime = true;
    request.temperature = 0.75;
  }
  const diffusing = mode === 'diffusing' && !voice;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(e)));
        } catch {
          closed = true;
        }
      };
      const resolved = await resolveTools(parsed.data.tools, req.signal).catch((err) => {
        console.error('[api/chat] tool resolution failed', err);
        return { tools: [], close: async () => {}, warnings: ['Tools are unavailable right now.'] as string[], systemHint: undefined };
      });
      for (const w of resolved.warnings) emit({ t: 'warning', message: w });
      const system = [voice ? VOICE_PROMPT : SYSTEM_PROMPT, resolved.tools.length ? resolved.systemHint : undefined]
        .filter(Boolean)
        .join('\n\n');
      try {
        await runAgent({
          request,
          messages: [{ role: 'system', content: system }, ...messages.filter((m) => m.content.trim() !== '')],
          tools: resolved.tools,
          diffusing,
          emit,
          signal: req.signal,
        });
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError' && !req.signal.aborted) {
          if (!(err instanceof UpstreamError)) console.error('[api/chat] agent error', err);
          emit({
            t: 'error',
            message: err instanceof UpstreamError ? err.message : 'The response stream was interrupted.',
          });
        }
      } finally {
        await resolved.close().catch(() => {});
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
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
