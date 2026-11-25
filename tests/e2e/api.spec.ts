import { expect, test } from '@playwright/test';

// API-level regression tests. These hit the real Inception API through the
// app's routes, so they need INCEPTION_API_KEY / DLLM_API_KEY on the server.

const origin = (baseURL?: string) => ({ Origin: baseURL ?? 'http://localhost:3000' });

function parseNdjson(text: string) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { t: string; v?: string; p?: number; reason?: string; message?: string });
}

test.describe('api/chat', () => {
  test('streams appended text with usage', async ({ request, baseURL }) => {
    const res = await request.post('/api/chat', {
      headers: origin(baseURL),
      data: {
        messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
        model: 'mercury-3',
        mode: 'streaming',
        reasoningEffort: 'instant',
      },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/x-ndjson');
    const events = parseNdjson(await res.text());
    const text = events.filter((e) => e.t === 'text').map((e) => e.v).join('');
    expect(text.toLowerCase()).toContain('pong');
    expect(events.some((e) => e.t === 'finish')).toBe(true);
    expect(events.some((e) => e.t === 'usage')).toBe(true);
  });

  test('diffusing mode sends replacement frames ending clean', async ({ request, baseURL }) => {
    const res = await request.post('/api/chat', {
      headers: origin(baseURL),
      data: {
        messages: [{ role: 'user', content: 'Write two sentences about rivers.' }],
        model: 'mercury-3',
        mode: 'diffusing',
        reasoningEffort: 'instant',
      },
    });
    expect(res.status()).toBe(200);
    const frames = parseNdjson(await res.text()).filter((e) => e.t === 'frame');
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.some((f) => f.t === 'text')).toBe(false);
    const last = frames[frames.length - 1];
    expect(last.p).toBe(1);
    expect(last.v!.length).toBeGreaterThan(20);
  });

  test('keeps multi-turn context', async ({ request, baseURL }) => {
    const res = await request.post('/api/chat', {
      headers: origin(baseURL),
      data: {
        messages: [
          { role: 'user', content: 'My favourite colour is teal. Remember it.' },
          { role: 'assistant', content: 'Got it, teal.' },
          { role: 'user', content: 'What is my favourite colour? One word.' },
        ],
        model: 'mercury-3',
        mode: 'streaming',
        reasoningEffort: 'instant',
      },
    });
    const text = parseNdjson(await res.text())
      .filter((e) => e.t === 'text')
      .map((e) => e.v)
      .join('');
    expect(text.toLowerCase()).toContain('teal');
  });

  test('voice turn answers without markdown', async ({ request, baseURL }) => {
    const res = await request.post('/api/chat', {
      headers: origin(baseURL),
      data: {
        messages: [{ role: 'user', content: 'Name three primary colours.' }],
        model: 'mercury-3',
        mode: 'diffusing',
        reasoningEffort: 'high',
        voice: true,
      },
    });
    const events = parseNdjson(await res.text());
    // voice forces append streaming even if diffusing was requested
    expect(events.some((e) => e.t === 'frame')).toBe(false);
    const text = events.filter((e) => e.t === 'text').map((e) => e.v).join('');
    expect(text.length).toBeGreaterThan(5);
    expect(text).not.toMatch(/```|^\s*[-*] /m);
  });

  test('works with previous-generation models', async ({ request, baseURL }) => {
    for (const model of ['mercury-2.5', 'mercury-2']) {
      const res = await request.post('/api/chat', {
        headers: origin(baseURL),
        data: { messages: [{ role: 'user', content: 'Say ok' }], model, mode: 'streaming', reasoningEffort: 'low' },
      });
      expect(res.status(), model).toBe(200);
    }
  });

  test('rejects invalid input', async ({ request, baseURL }) => {
    const cases: [unknown, number][] = [
      [{ messages: [{ role: 'user', content: 'x' }], model: 'gpt-4', mode: 'streaming', reasoningEffort: 'low' }, 400],
      [{ messages: [], model: 'mercury-3', mode: 'streaming', reasoningEffort: 'low' }, 400],
      [{ messages: [{ role: 'assistant', content: 'x' }], model: 'mercury-3', mode: 'streaming', reasoningEffort: 'low' }, 400],
      [{ messages: [{ role: 'system', content: 'x' }], model: 'mercury-3', mode: 'streaming', reasoningEffort: 'low' }, 400],
      [{ messages: [{ role: 'user', content: 'x' }], model: 'mercury-3', mode: 'streaming', reasoningEffort: 'minimal' }, 400],
    ];
    for (const [data, status] of cases) {
      const res = await request.post('/api/chat', { headers: origin(baseURL), data: data as object });
      expect(res.status()).toBe(status);
      const body = await res.json();
      expect(body.error.message).toBeTruthy();
    }
  });

  test('rejects cross-origin and header-less requests', async ({ request }) => {
    const body = { messages: [{ role: 'user', content: 'x' }], model: 'mercury-3', mode: 'streaming', reasoningEffort: 'low' };
    const evil = await request.post('/api/chat', { headers: { Origin: 'https://evil.example' }, data: body });
    expect(evil.status()).toBe(403);
    const none = await request.post('/api/chat', { headers: { Origin: '' }, data: body });
    expect(none.status()).toBe(403);
  });

  test('never leaks the API key', async ({ request, baseURL }) => {
    const key = process.env.INCEPTION_API_KEY || process.env.DLLM_API_KEY;
    test.skip(!key, 'no key in test env');
    const page = await request.get('/', { headers: origin(baseURL) });
    expect(await page.text()).not.toContain(key!);
    const res = await request.post('/api/chat', {
      headers: origin(baseURL),
      data: { messages: [{ role: 'user', content: 'hi' }], model: 'mercury-3', mode: 'streaming', reasoningEffort: 'instant' },
    });
    expect(await res.text()).not.toContain(key!);
  });
});

test.describe('api/fim', () => {
  test('returns a completion for the gap', async ({ request, baseURL }) => {
    const res = await request.post('/api/fim', {
      headers: origin(baseURL),
      data: {
        prompt: 'def add(a, b):\n    ',
        suffix: '\n\nprint(add(1, 2))\n',
        language: 'python',
        maxTokens: 32,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.text).toContain('return');
    expect(typeof body.latencyMs).toBe('number');
  });

  test('validates input', async ({ request, baseURL }) => {
    const res = await request.post('/api/fim', { headers: origin(baseURL), data: { prompt: 1 } });
    expect(res.status()).toBe(400);
    const big = await request.post('/api/fim', {
      headers: origin(baseURL),
      data: { prompt: 'x', suffix: '', maxTokens: 100000 },
    });
    expect(big.status()).toBe(400);
  });
});

test.describe('security headers', () => {
  test('page sends CSP, HSTS and anti-framing headers', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    const csp = h['content-security-policy'] ?? '';
    for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "connect-src 'self'"]) {
      expect(csp).toContain(directive);
    }
    expect(h['strict-transport-security']).toContain('max-age=');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['permissions-policy']).toContain('microphone=(self)');
    expect(h['x-powered-by']).toBeUndefined();
  });
});
