import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FIM_MODEL } from '@/lib/models';
import { guard, jsonError, readJson } from '@/lib/server/guard';
import { inceptionFetch, UpstreamError } from '@/lib/server/inception';
import type { FimResponseBody } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Context sent around the cursor. FIM prefix caching is automatic upstream,
// so a generous prefix is cheap; this keeps payloads and latency bounded.
const MAX_PREFIX_CHARS = 12_000;
const MAX_SUFFIX_CHARS = 4_000;

const BodySchema = z.object({
  prompt: z.string().max(500_000),
  suffix: z.string().max(500_000),
  language: z.string().max(40).optional(),
  maxTokens: z.number().int().min(1).max(512).optional(),
  stop: z.array(z.string().min(1).max(16)).max(4).optional(),
});

export async function POST(req: NextRequest) {
  // Autocomplete fires often; allow a higher rate than chat.
  const blocked = guard(req, 'fim', 300);
  if (blocked) return blocked;

  const raw = await readJson(req, 1_200_000);
  if (raw === null) return jsonError('Invalid or oversized JSON body.', 400, 'bad_request');
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid request.', 400, 'bad_request');
  }

  const { prompt, suffix, maxTokens, stop } = parsed.data;
  const started = Date.now();
  try {
    const res = await inceptionFetch(
      '/fim/completions',
      {
        model: FIM_MODEL,
        prompt: prompt.slice(-MAX_PREFIX_CHARS),
        suffix: suffix.slice(0, MAX_SUFFIX_CHARS),
        max_tokens: maxTokens ?? 128,
        stream: false,
        ...(stop ? { stop } : {}),
      },
      req.signal,
      10_000,
    );
    const data = (await res.json()) as { choices?: { text?: string }[] };
    const body: FimResponseBody = {
      text: data.choices?.[0]?.text ?? '',
      latencyMs: Date.now() - started,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof UpstreamError) return jsonError(err.message, err.status, err.code);
    if ((err as Error)?.name === 'AbortError') return new Response(null, { status: 499 });
    console.error('[api/fim] unexpected error', err);
    return jsonError('Unexpected server error.', 500, 'internal');
  }
}
