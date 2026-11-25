// localStorage adapter with debounced writes. Streaming updates the store many
// times per second; serialising the whole history on every token would jank
// the UI. Writes are coalesced and flushed on idle, on page hide and when a
// message completes (flushPersist()).
import type { StateStorage } from 'zustand/middleware';

const DELAY_MS = 400;
const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

export type PersistErrorHandler = (err: unknown) => void;
let onError: PersistErrorHandler = (err) => console.warn('[persist] write failed', err);
export function setPersistErrorHandler(fn: PersistErrorHandler) {
  onError = fn;
}

function writeAll() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  for (const [k, v] of pending) {
    try {
      window.localStorage.setItem(k, v);
    } catch (err) {
      onError(err);
    }
  }
  pending.clear();
}

function attach() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  window.addEventListener('pagehide', writeAll);
  window.addEventListener('beforeunload', writeAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeAll();
  });
}

export function flushPersist() {
  if (typeof window !== 'undefined') writeAll();
}

export const debouncedLocalStorage: StateStorage = {
  getItem(name) {
    if (typeof window === 'undefined') return null;
    if (pending.has(name)) return pending.get(name)!;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    if (typeof window === 'undefined') return;
    attach();
    pending.set(name, value);
    if (!timer) timer = setTimeout(writeAll, DELAY_MS);
  },
  removeItem(name) {
    if (typeof window === 'undefined') return;
    pending.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};
