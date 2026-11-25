import 'server-only';

// Thin server-side client for the Inception (Mercury) API.
// The API key never leaves this module: it is read from the environment at
// call time and only ever placed in the outbound Authorization header.

const DEFAULT_BASE_URL = 'https://api.inceptionlabs.ai/v1';

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string = 'upstream_error',
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

function apiKey(): string {
  // INCEPTION_API_KEY is the name the Inception docs use; DLLM_API_KEY is
  // this project's historical name. Either works.
  const key = process.env.INCEPTION_API_KEY || process.env.DLLM_API_KEY;
  if (!key) {
    throw new UpstreamError(
      'Server is missing its API key. Set INCEPTION_API_KEY (or DLLM_API_KEY).',
      500,
      'missing_api_key',
    );
  }
  return key;
}

function baseUrl(): string {
  const raw = process.env.INCEPTION_BASE_URL || DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, '');
}

/**
 * Inception returns `error.message` either as a string or as an array of
 * pydantic validation objects ({ msg, loc, ... }). Collapse both to text.
 */
export function extractUpstreamMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const b = body as Record<string, unknown>;
  const err = (b.error ?? b) as Record<string, unknown>;
  const msg = err.message ?? err.detail;
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (Array.isArray(msg)) {
    const parts = msg
      .map((m) => (m && typeof m === 'object' ? String((m as { msg?: unknown }).msg ?? '') : String(m)))
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  return fallback;
}

function friendlyStatusMessage(status: number): string {
  switch (status) {
    case 400:
      return 'The request was rejected by the model API.';
    case 401:
      return 'The server API key was rejected by Inception.';
    case 402:
      return 'The Inception account is out of credits.';
    case 413:
      return 'The conversation is too long for this model.';
    case 429:
      return 'Rate limit reached. Please wait a moment and try again.';
    default:
      return status >= 500
        ? 'The model API is temporarily unavailable. Please try again.'
        : `Model API error (${status}).`;
  }
}

/** POST a JSON body to an Inception endpoint. Throws UpstreamError on non-2xx. */
export async function inceptionFetch(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  /** Abort if response headers have not arrived within this many ms. */
  headersTimeoutMs = 30_000,
): Promise<Response> {
  // Combine the caller's signal (client disconnect) with a headers timeout.
  // The timer is cleared once headers arrive so long streams are not cut off.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, headersTimeoutMs);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (timedOut) throw new UpstreamError('The model API took too long to respond. Please try again.', 504, 'upstream_timeout');
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new UpstreamError('Could not reach the model API.', 502, 'network_error');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let parsed: unknown = null;
    const text = await res.text().catch(() => '');
    try {
      parsed = JSON.parse(text);
    } catch {
      /* non-JSON error body */
    }
    // Do not echo 401 details: they can describe the key.
    const message =
      res.status === 401
        ? friendlyStatusMessage(401)
        : extractUpstreamMessage(parsed, friendlyStatusMessage(res.status));
    // Map upstream auth failures to 502 so the browser does not think *it* is unauthenticated.
    const status = res.status === 401 ? 502 : res.status;
    throw new UpstreamError(message, status, `upstream_${res.status}`);
  }
  return res;
}
