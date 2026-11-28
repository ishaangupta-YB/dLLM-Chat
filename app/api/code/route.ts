import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CHAT_MODEL_IDS, getModel } from '@/lib/models';
import { encodeEvent, type ChatStreamEvent } from '@/lib/chat/protocol';
import { runAgent } from '@/lib/agent/runtime';
import { ToolConfigSchema } from '@/lib/agent/schema';
import { resolveTools } from '@/lib/agent/tools';
import type { AgentTool } from '@/lib/agent/types';
import { guard, jsonError, readJson } from '@/lib/server/guard';
import { UpstreamError } from '@/lib/server/inception';
import { CODE_LIMITS, validateContent, validatePath } from '@/lib/code-agent/files';
import { CODE_SYSTEM_PROMPT, filesContext } from '@/lib/code-agent/prompt';
import { createFileTools, type FileToolsState } from '@/lib/code-agent/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BODY_BYTES = 12_000_000;
const MAX_MESSAGES = 60;
const MAX_CONTENT_CHARS = 100_000;
const MAX_STEPS = 8;

const FilesSchema = z
  .record(z.string(), z.string())
  .superRefine((files, ctx) => {
    const keys = Object.keys(files);
    if (keys.length > CODE_LIMITS.maxFiles) {
      ctx.addIssue({ code: 'custom', message: `At most ${CODE_LIMITS.maxFiles} files.` });
      return;
    }
    for (const k of keys) {
      const p = validatePath(k);
      if (!p.ok || p.path !== k) {
        ctx.addIssue({ code: 'custom', message: `Invalid file path "${k.slice(0, 80)}": ${p.ok ? 'not normalised' : p.error}` });
        return;
      }
      const c = validateContent(files[k]);
      if (!c.ok) {
        ctx.addIssue({ code: 'custom', message: `${k}: ${c.error}` });
        return;
      }
    }
  });

const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(MAX_CONTENT_CHARS) }))
    .min(1)
    .max(MAX_MESSAGES),
  model: z.enum(CHAT_MODEL_IDS as [string, ...string[]]),
  reasoningEffort: z.enum(['instant', 'low', 'medium', 'high']),
  files: FilesSchema,
  tools: ToolConfigSchema,
});

export async function POST(req: NextRequest) {
  const blocked = guard(req, 'code', 30);
  if (blocked) return blocked;

  const raw = await readJson(req, MAX_BODY_BYTES);
  if (raw === null) return jsonError('Invalid or oversized JSON body.', 400, 'bad_request');
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid request.', 400, 'bad_request');
  const { messages, model, reasoningEffort, files, tools: toolConfig } = parsed.data;
  if (messages[messages.length - 1].role !== 'user') {
    return jsonError('The last message must come from the user.', 400, 'bad_request');
  }

  const info = getModel(model);
  const request: Record<string, unknown> = {
    model,
    reasoning_effort: reasoningEffort,
    // Whole files are written through tool arguments, so allow a large budget.
    max_completion_tokens: Math.min(info?.maxOutputTokens ?? 32_768, 32_768),
  };

  // Only web search and utilities (fetch page, time, calculator) make sense here.
  const extraConfig = toolConfig
    ? { webSearch: toolConfig.webSearch, utilities: toolConfig.utilities, keys: toolConfig.keys }
    : undefined;

  const state: FileToolsState = { files: { ...files }, changed: [] };
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

      const fileTools = createFileTools(state);
      const names = new Set(fileTools.map((t) => t.name));
      const resolved = extraConfig && (extraConfig.webSearch || extraConfig.utilities)
        ? await resolveTools(extraConfig, req.signal).catch((err) => {
            console.error('[api/code] tool resolution failed', err);
            return { tools: [] as AgentTool[], close: async () => {}, warnings: ['Web tools are unavailable right now.'], systemHint: undefined };
          })
        : { tools: [] as AgentTool[], close: async () => {}, warnings: [] as string[], systemHint: undefined };
      for (const w of resolved.warnings) emit({ t: 'warning', message: w });
      const extra = resolved.tools.filter((t) => !names.has(t.name));

      const system = [
        CODE_SYSTEM_PROMPT,
        extra.length && resolved.systemHint ? resolved.systemHint : undefined,
        filesContext(state.files),
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        await runAgent({
          request,
          messages: [{ role: 'system', content: system }, ...messages.filter((m) => m.content.trim() !== '')],
          tools: [...fileTools, ...extra],
          maxSteps: MAX_STEPS,
          emit,
          signal: req.signal,
        });
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError' && !req.signal.aborted) {
          if (!(err instanceof UpstreamError)) console.error('[api/code] agent error', err);
          emit({ t: 'error', message: err instanceof UpstreamError ? err.message : 'The response stream was interrupted.' });
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
