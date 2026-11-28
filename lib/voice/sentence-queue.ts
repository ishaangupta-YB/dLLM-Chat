// Ordered "load ahead, play in order" queue for sentence-by-sentence TTS.
//
// Each pushed sentence is loaded (e.g. synthesized by ElevenLabs) while the
// previous one plays, with a small prefetch window, and played strictly in
// order. Framework-free and timer-free, so it is unit tested with fakes.

export type QueueErrorAction = 'skip' | 'stop';

export interface SentenceQueueOptions<T> {
  load: (text: string, signal: AbortSignal) => Promise<T>;
  play: (item: T, signal: AbortSignal) => Promise<void>;
  /** Free resources for an item (object URLs). Called once per loaded item. */
  release?: (item: T) => void;
  /** Sentences loaded ahead of the one playing. Default 2. */
  prefetch?: number;
  /** First sentence of a run was queued. */
  onStart?: () => void;
  /** Queue drained (or cancelled while running). */
  onIdle?: () => void;
  /** A load or play failed. 'skip' moves on, 'stop' cancels the rest. Default 'skip'. */
  onError?: (err: unknown, text: string) => QueueErrorAction;
}

export interface SentenceQueue {
  push(text: string): void;
  /** Drop everything and stop playback. Fires onIdle if a run was active. */
  cancel(): void;
  dispose(): void;
  /** A run is active: something is loading, queued or playing. */
  readonly running: boolean;
  readonly pending: number;
  /** Sentences not yet played (including the one playing). */
  remaining(): string[];
}

interface Entry<T> {
  text: string;
  controller: AbortController;
  promise?: Promise<T>;
  value?: T;
  loaded: boolean;
}

export function createSentenceQueue<T>(opts: SentenceQueueOptions<T>): SentenceQueue {
  const prefetch = Math.max(0, opts.prefetch ?? 2);
  let entries: Entry<T>[] = [];
  let running = false;
  let pumping = false;
  let generation = 0;
  let disposed = false;
  let playController: AbortController | null = null;

  const startLoads = () => {
    for (let i = 0; i < Math.min(entries.length, prefetch + 1); i++) {
      const e = entries[i];
      if (e.promise) continue;
      e.promise = opts.load(e.text, e.controller.signal).then((v) => {
        e.value = v;
        e.loaded = true;
        return v;
      });
      // Avoid unhandled rejections for entries dropped before they are awaited.
      e.promise.catch(() => {});
    }
  };

  const releaseEntry = (e: Entry<T>) => {
    e.controller.abort();
    if (e.loaded && e.value !== undefined) {
      opts.release?.(e.value);
      e.value = undefined;
    }
  };

  const finish = () => {
    if (!running) return;
    running = false;
    opts.onIdle?.();
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    const gen = generation;
    try {
      while (entries.length && gen === generation && !disposed) {
        startLoads();
        const e = entries[0];
        try {
          const item = await e.promise!;
          if (gen !== generation) return;
          playController = new AbortController();
          await opts.play(item, playController.signal);
        } catch (err) {
          if (gen !== generation) return;
          if ((opts.onError?.(err, e.text) ?? 'skip') === 'stop') {
            cancelAll();
            return;
          }
        } finally {
          playController = null;
        }
        if (gen !== generation) return;
        releaseEntry(e);
        entries.shift();
      }
      if (gen === generation) finish();
    } finally {
      if (gen === generation) pumping = false;
    }
  };

  const cancelAll = () => {
    generation++;
    pumping = false;
    playController?.abort();
    playController = null;
    const old = entries;
    entries = [];
    old.forEach(releaseEntry);
    finish();
  };

  return {
    push(text) {
      const t = text.trim();
      if (!t || disposed) return;
      entries.push({ text: t, controller: new AbortController(), loaded: false });
      if (!running) {
        running = true;
        opts.onStart?.();
      }
      startLoads();
      void pump();
    },
    cancel: cancelAll,
    dispose() {
      if (disposed) return;
      generation++;
      playController?.abort();
      const old = entries;
      entries = [];
      old.forEach(releaseEntry);
      running = false;
      disposed = true;
    },
    get running() {
      return running;
    },
    get pending() {
      return entries.length;
    },
    remaining() {
      return entries.map((e) => e.text);
    },
  };
}
