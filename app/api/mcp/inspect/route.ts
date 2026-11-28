import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { describeMcpError, inspectServer } from '@/lib/agent/mcp/client';
import { checkUrl, SsrfError } from '@/lib/agent/net/ssrf';
import { guard, jsonError, readJson } from '@/lib/server/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BodySchema = z.object({
  url: z.string().min(1).max(2048),
  authHeader: z.string().max(2000).optional(),
});

/** POST {url, authHeader?} -> {serverName, serverVersion, protocolVersion, tools[]} for a custom MCP server. */
export async function POST(req: NextRequest) {
  const blocked = guard(req, 'mcp-inspect', 12);
  if (blocked) return blocked;
  const raw = await readJson(req, 10_000);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('Send {url, authHeader?}.', 400, 'bad_request');
  const { url, authHeader } = parsed.data;

  try {
    checkUrl(url);
  } catch (err) {
    return jsonError((err as SsrfError).message, 400, 'blocked_url');
  }
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(20_000)]);
  try {
    const result = await inspectServer(url, authHeader, signal);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = describeMcpError(err);
    const code = /private|local|Blocked/i.test(message) ? 'blocked_url' : 'connect_failed';
    return jsonError(message, code === 'blocked_url' ? 400 : 502, code);
  }
}
