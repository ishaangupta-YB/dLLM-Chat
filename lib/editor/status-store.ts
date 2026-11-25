// Tiny per-canvas external store for high-frequency UI state (cursor position,
// FIM status, ghost visibility). Components read it with useSyncExternalStore
// so cursor moves re-render only the footer, never the whole canvas.
import type { FimStatus } from './fim-logic';

export interface CanvasStatus {
  fim: FimStatus;
  ghost: boolean;
  line: number;
  col: number;
}

export interface CanvasStatusStore {
  get(): CanvasStatus;
  set(patch: Partial<CanvasStatus>): void;
  subscribe(fn: () => void): () => void;
}

export function createStatusStore(initial?: Partial<CanvasStatus>): CanvasStatusStore {
  let state: CanvasStatus = { fim: { kind: 'idle' }, ghost: false, line: 1, col: 1, ...initial };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      let changed = false;
      for (const k of Object.keys(patch) as (keyof CanvasStatus)[]) {
        if (patch[k] !== state[k]) changed = true;
      }
      if (!changed) return;
      state = { ...state, ...patch };
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
