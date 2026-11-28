import 'server-only';
// Network-level SSRF enforcement: an undici Agent whose DNS lookup rejects
// any non-public answer, so the check and the connect use the same IP (no
// DNS-rebinding gap). Redirects are never followed automatically.
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { SsrfError, isPublicIp } from './ssrf';

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = addrs as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicIp(a.address))) {
      const e = Object.assign(new SsrfError(`Blocked: ${hostname} resolves to a private or local address.`), {
        code: 'EBLOCKED',
      });
      return cb(e as NodeJS.ErrnoException);
    }
    if (options?.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

let agent: Agent | null = null;
function getAgent() {
  agent ??= new Agent({
    connect: { lookup: guardedLookup as never, timeout: 8_000 },
    headersTimeout: 20_000,
    bodyTimeout: 30_000,
  });
  return agent;
}

/** Walk the cause chain for our SSRF error (undici wraps connect errors). */
export function findSsrfError(err: unknown): SsrfError | null {
  let e: unknown = err;
  for (let i = 0; i < 6 && e; i++) {
    if (e instanceof SsrfError || (e as { code?: string })?.code === 'EBLOCKED') return e as SsrfError;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * fetch() for user-controlled URLs: guarded DNS, manual redirects. Same shape
 * as the global fetch so it can be handed to the MCP transport.
 */
export const safeFetch = ((input: string | URL | Request, init: RequestInit = {}) =>
  undiciFetch(input as never, { ...(init as object), dispatcher: getAgent(), redirect: 'manual' } as never).catch(
    (err: unknown) => {
      const ssrf = findSsrfError(err);
      throw ssrf ?? err;
    },
  )) as unknown as typeof fetch;

/** Read a response body as text with a hard byte cap (aborts beyond it). */
export async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        text += decoder.decode(value.subarray(0, Math.max(0, value.byteLength - (bytes - maxBytes))));
        truncated = true;
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return { text, truncated };
}
