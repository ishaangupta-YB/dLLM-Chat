import { expect, test as base, type Page } from '@playwright/test';

// Shared fixtures and helpers for the UI suites.
//
// - Every page's console errors and uncaught exceptions are collected and the
//   test fails if any occurred (hydration warnings included). Tests that
//   provoke an expected browser error (e.g. a stubbed HTTP 500 makes Chrome log
//   "Failed to load resource") whitelist it with `allowConsole(/regex/)`.
// - `seed()` writes localStorage before the app boots, only on the first load
//   of the tab, so reloads keep whatever the app persisted.
// - `installStreamStub()` replaces fetch('/api/chat') with a scripted, timed
//   NDJSON stream (page.route cannot stream progressively), honouring aborts.

export const STORAGE_KEY = 'dllm-chat:v2';

export const BASE_SETTINGS = {
  model: 'mercury-3',
  mode: 'streaming',
  reasoningEffort: 'instant',
  fimEnabled: true,
  voiceAutoSpeak: true,
} as const;

export type StubEvent =
  | { t: 'text'; v: string }
  | { t: 'frame'; v: string; p: number }
  | { t: 'finish'; reason: string | null }
  | { t: 'usage'; usage: { promptTokens: number; completionTokens: number; serverLatencyMs?: number } }
  | { t: 'warning'; message: string }
  | { t: 'error'; message: string };

export interface StubStep {
  /** ms to wait before emitting this event */
  delay?: number;
  event: StubEvent;
}

export interface StubResponse {
  steps?: StubStep[];
  /** HTTP status; non-2xx sends `errorBody` as JSON. */
  status?: number;
  errorBody?: unknown;
  /** keep the stream open after the last step (until aborted) */
  hang?: boolean;
}

type Fixtures = {
  allowConsole: (re: RegExp) => void;
  consoleGuard: void;
};

export const test = base.extend<Fixtures>({
  allowConsole: async ({}, provide, testInfo) => {
    const list: RegExp[] = [];
    (testInfo as unknown as { _allow: RegExp[] })._allow = list;
    await provide((re) => list.push(re));
  },
  consoleGuard: [
    async ({ context, allowConsole }, provide, testInfo) => {
      void allowConsole;
      const allow = (testInfo as unknown as { _allow: RegExp[] })._allow ?? [];
      const problems: string[] = [];
      const watch = (page: Page) => {
        page.on('console', (msg) => {
          if (msg.type() !== 'error' && !/hydrat/i.test(msg.text())) return;
          const text = msg.text();
          if (allow.some((re) => re.test(text))) return;
          problems.push(`console.${msg.type()}: ${text}`);
        });
        page.on('pageerror', (err) => {
          const text = `${err.name}: ${err.message}`;
          if (allow.some((re) => re.test(text))) return;
          problems.push(`pageerror: ${text}`);
        });
      };
      context.pages().forEach(watch);
      context.on('page', watch);
      await provide();
      expect(problems, 'console errors / page errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/* ------------------------------------------------------------------ state */

export interface SeedMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
  pending?: boolean;
  error?: string;
  model?: string;
  mode?: string;
  durationMs?: number;
}

export interface SeedConversation {
  id: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
  pinned?: boolean;
  messages: SeedMessage[];
}

export function buildState(opts: {
  conversations?: SeedConversation[];
  activeId?: string | null;
  settings?: Partial<Record<keyof typeof BASE_SETTINGS, unknown>>;
}) {
  const t = Date.now();
  const conversations: Record<string, unknown> = {};
  (opts.conversations ?? []).forEach((c, ci) => {
    conversations[c.id] = {
      createdAt: t - 1000 * (ci + 1),
      updatedAt: t - 1000 * (ci + 1),
      ...c,
      messages: c.messages.map((m, i) => ({ id: `${c.id}-m${i}`, createdAt: t - 1000 + i, ...m })),
    };
  });
  return {
    state: {
      conversations,
      activeId: opts.activeId ?? null,
      settings: { ...BASE_SETTINGS, ...(opts.settings ?? {}) },
    },
    version: 1,
  };
}

/** Seed localStorage before the first load of this page (not on reloads). */
export async function seed(page: Page, state: unknown = buildState({})) {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (!sessionStorage.getItem('__e2e_seeded')) {
          localStorage.setItem(key, value);
          sessionStorage.setItem('__e2e_seeded', '1');
        }
      } catch {
        /* ignore */
      }
    },
    { key: STORAGE_KEY, value: JSON.stringify(state) },
  );
}

export interface PersistedState {
  state: {
    conversations: Record<
      string,
      {
        id: string;
        title: string;
        pinned?: boolean;
        createdAt: number;
        updatedAt: number;
        messages: {
          id: string;
          role: string;
          content: string;
          pending?: boolean;
          error?: string;
          model?: string;
          mode?: string;
          finishReason?: string | null;
          durationMs?: number;
        }[];
      }
    >;
    activeId: string | null;
    settings: typeof BASE_SETTINGS & Record<string, unknown>;
  };
  version: number;
}

export async function readStore(page: Page): Promise<PersistedState | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

export async function activeConversation(page: Page) {
  const s = await readStore(page);
  if (!s?.state.activeId) return null;
  return s.state.conversations[s.state.activeId] ?? null;
}

/* ------------------------------------------------------------------- app */

export async function openApp(page: Page, state?: unknown) {
  await seed(page, state ?? buildState({}));
  await page.goto('/');
  await waitForApp(page);
}

export async function waitForApp(page: Page) {
  await expect(page.locator('#composer-input')).toBeVisible();
  // The thread renders a skeleton until the store has hydrated from localStorage.
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
}

export async function sendMessage(page: Page, text: string) {
  const input = page.locator('#composer-input');
  await input.fill(text);
  await input.press('Enter');
}

export const assistantMessages = (page: Page) => page.locator('.is-assistant');
export const userMessages = (page: Page) => page.locator('.is-user');
export const lastAssistant = (page: Page) => page.locator('.is-assistant').last();

export async function waitForIdle(page: Page, timeout = 60_000) {
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible({ timeout });
}

/* ----------------------------------------------------------- chat stubbing */

/**
 * Replace window.fetch for /api/chat with a scripted response queue. Call
 * `queueChat(page, ...responses)` after load to enqueue responses (FIFO). When
 * the queue is empty the real network is used.
 */
export async function installStreamStub(page: Page) {
  await page.addInitScript(() => {
    type Step = { delay?: number; event: unknown };
    type Resp = { steps?: Step[]; status?: number; errorBody?: unknown; hang?: boolean };
    const w = window as unknown as { __chatQueue: Resp[]; __chatRequests: unknown[] };
    w.__chatQueue = [];
    w.__chatRequests = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/api/chat') || w.__chatQueue.length === 0) return realFetch(input, init);
      const resp = w.__chatQueue.shift()!;
      try {
        w.__chatRequests.push(JSON.parse(String(init?.body ?? 'null')));
      } catch {
        w.__chatRequests.push(null);
      }
      const signal = init?.signal;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (resp.status && (resp.status < 200 || resp.status >= 300)) {
        return new Response(JSON.stringify(resp.errorBody ?? {}), {
          status: resp.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const enc = new TextEncoder();
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const abort = () => {
            if (cancelled) return;
            cancelled = true;
            try {
              controller.error(new DOMException('Aborted', 'AbortError'));
            } catch {
              /* already closed */
            }
          };
          signal?.addEventListener('abort', abort);
          for (const step of resp.steps ?? []) {
            if (step.delay) await new Promise((r) => setTimeout(r, step.delay));
            if (cancelled) return;
            controller.enqueue(enc.encode(JSON.stringify(step.event) + '\n'));
          }
          if (resp.hang) return;
          if (!cancelled) controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
    };
  });
}

export async function queueChat(page: Page, ...responses: StubResponse[]) {
  await page.evaluate((list) => {
    (window as unknown as { __chatQueue: unknown[] }).__chatQueue.push(...list);
  }, responses);
}

export async function chatRequests(page: Page) {
  return page.evaluate(() => (window as unknown as { __chatRequests: unknown[] }).__chatRequests);
}

/** A simple text reply split into word chunks. */
export function textReply(text: string, opts: { delay?: number; chunk?: number; usage?: boolean } = {}): StubResponse {
  const parts: string[] = [];
  const size = opts.chunk ?? 12;
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  const steps: StubStep[] = parts.map((v) => ({ delay: opts.delay ?? 0, event: { t: 'text', v } }));
  steps.push({ event: { t: 'finish', reason: 'stop' } });
  if (opts.usage !== false) {
    steps.push({
      event: { t: 'usage', usage: { promptTokens: 10, completionTokens: Math.ceil(text.length / 4), serverLatencyMs: 200 } },
    });
  }
  return { steps };
}

/* ------------------------------------------------------------- pacing */

// The server allows 40 chat requests/min per IP. Real-API tests call this
// before each request so the whole suite stays under the limit.
const realCalls: number[] = [];
export async function paceRealRequest(page: Page, perMinute = 25) {
  const now = Date.now();
  while (realCalls.length && now - realCalls[0] > 60_000) realCalls.shift();
  if (realCalls.length >= perMinute) {
    const wait = 60_000 - (now - realCalls[0]) + 250;
    await page.waitForTimeout(wait);
  }
  realCalls.push(Date.now());
}
