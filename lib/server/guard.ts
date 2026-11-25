import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { ApiErrorBody } from '@/lib/types';

export function jsonError(message: string, status: number, code = 'error') {
  const body: ApiErrorBody = { error: { message, code, status } };
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Same-origin check. Browsers always send Origin on cross-origin POSTs, so we
 * accept a request only when Origin (or Referer) matches the host serving the
 * app, or one of ALLOWED_ORIGINS (comma separated). Requests with neither
 * header (curl, server-to-server) are rejected so the API key cannot be
 * proxied by third parties.
 */
export function isAllowedOrigin(req: NextRequest): boolean {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const matches = (value: string | null): boolean => {
    if (!value) return false;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (host && url.host === host) return true;
    return extra.includes(url.origin);
  };

  const origin = req.headers.get('origin');
  if (origin) return matches(origin);
  return matches(req.headers.get('referer'));
}

// Fixed-window in-memory limiter. Per server instance, which is enough to stop
// a single client from hammering the key; use a shared store for multi-region.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs = 60_000,
): { ok: true } | { ok: false; retryAfter: number } {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local';
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}

/** Read a JSON body with a hard size cap. Returns null on any failure. */
export async function readJson(req: NextRequest, maxBytes: number): Promise<unknown | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Run the common checks. Returns an error response, or null to continue. */
export function guard(req: NextRequest, scope: string, limitPerMinute: number) {
  if (!isAllowedOrigin(req)) return jsonError('Forbidden origin.', 403, 'forbidden_origin');
  const rl = rateLimit(req, scope, limitPerMinute);
  if (!rl.ok) {
    const res = jsonError(
      `Too many requests. Try again in ${rl.retryAfter}s.`,
      429,
      'rate_limited',
    );
    res.headers.set('Retry-After', String(rl.retryAfter));
    return res;
  }
  return null;
}
