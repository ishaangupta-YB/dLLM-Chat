// Browser client for POST /api/fim.
import type { ApiErrorBody, FimRequestBody, FimResponseBody } from '@/lib/types';
import type { FimErrorInfo } from './fim-logic';

export class FimRequestError extends Error implements FimErrorInfo {
  status: number;
  code?: string;
  retryAfterMs?: number;
  constructor(message: string, info: FimErrorInfo) {
    super(message);
    this.name = 'FimRequestError';
    this.status = info.status;
    this.code = info.code;
    this.retryAfterMs = info.retryAfterMs;
  }
}

export type FimFetcher = (body: FimRequestBody, signal: AbortSignal) => Promise<FimResponseBody>;

export const fetchFimCompletion: FimFetcher = async (body, signal) => {
  let res: Response;
  try {
    res = await fetch('/api/fim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new FimRequestError('Network error', { status: 0, code: 'network' });
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as Partial<ApiErrorBody>;
      if (data?.error?.message) message = data.error.message;
      code = data?.error?.code;
    } catch {
      // non-JSON error body
    }
    const ra = Number(res.headers.get('retry-after'));
    throw new FimRequestError(message, {
      status: res.status,
      code,
      retryAfterMs: Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined,
    });
  }
  const data = (await res.json()) as Partial<FimResponseBody>;
  return { text: typeof data.text === 'string' ? data.text : '', latencyMs: data.latencyMs };
};
