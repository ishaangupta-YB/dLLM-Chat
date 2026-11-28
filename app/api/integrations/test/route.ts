import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, jsonError, readJson } from '@/lib/server/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const BodySchema = z.object({
  provider: z.literal('tavily'),
  key: z.string().min(8).max(400),
});

/**
 * POST {provider:'tavily', key} -> {ok, message}. Validates a BYOK key with
 * Tavily's usage endpoint (no search credits spent). The key is used once in
 * memory and never logged or stored.
 */
export async function POST(req: NextRequest) {
  const blocked = guard(req, 'integrations-test', 10);
  if (blocked) return blocked;
  const parsed = BodySchema.safeParse(await readJson(req, 4_000));
  if (!parsed.success) return jsonError('Send {provider: "tavily", key}.', 400, 'bad_request');
  const key = parsed.data.key.trim();
  if (/\s/.test(key)) return NextResponse.json({ ok: false, message: 'The key contains spaces.' });

  try {
    const res = await fetch('https://api.tavily.com/usage', {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(10_000)]),
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ ok: false, message: 'Tavily rejected this key.' });
    }
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: `Tavily answered HTTP ${res.status}. Try again later.` });
    }
    const json = (await res.json().catch(() => null)) as {
      key?: { usage?: number; limit?: number | null };
      account?: { plan_usage?: number; plan_limit?: number | null; current_plan?: string };
    } | null;
    const used = json?.key?.usage ?? json?.account?.plan_usage;
    const limit = json?.key?.limit ?? json?.account?.plan_limit;
    const plan = json?.account?.current_plan;
    const usage = typeof used === 'number' ? ` ${used}${typeof limit === 'number' ? ` / ${limit}` : ''} credits used` : '';
    return NextResponse.json({ ok: true, message: `Key works${plan ? ` (${plan} plan` : ''}${plan ? `,${usage})` : usage ? ` (${usage.trim()})` : ''}.` });
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not reach Tavily. Check your connection and try again.' });
  }
}
