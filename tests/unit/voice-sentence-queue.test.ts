import { describe, expect, it, vi } from 'vitest';
import { createSentenceQueue } from '@/lib/voice/sentence-queue';

const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Queue with manually controlled loads and plays. */
function setup(prefetch = 2) {
  const loads = new Map<string, ReturnType<typeof deferred<string>>>();
  const plays: { item: string; done: ReturnType<typeof deferred<void>>; signal: AbortSignal }[] = [];
  const events = { start: 0, idle: 0, released: [] as string[], errors: [] as string[] };
  const q = createSentenceQueue<string>({
    prefetch,
    load: (text) => {
      const d = deferred<string>();
      loads.set(text, d);
      return d.promise;
    },
    play: (item, signal) => {
      const done = deferred<void>();
      plays.push({ item, done, signal });
      signal.addEventListener('abort', () => done.reject(new Error('aborted')));
      return done.promise;
    },
    release: (item) => events.released.push(item),
    onStart: () => events.start++,
    onIdle: () => events.idle++,
    onError: (err, text) => {
      events.errors.push(text);
      return (err as Error).message === 'fatal' ? 'stop' : 'skip';
    },
  });
  return { q, loads, plays, events };
}

describe('sentence queue', () => {
  it('prefetches ahead and plays strictly in order', async () => {
    const { q, loads, plays, events } = setup(1);
    q.push('One.');
    q.push('Two.');
    q.push('Three.');
    expect(events.start).toBe(1);
    // prefetch 1: the current + one ahead are loading, the third waits.
    expect([...loads.keys()]).toEqual(['One.', 'Two.']);
    // Second finishes loading first; nothing plays until the first is ready.
    loads.get('Two.')!.resolve('audio-2');
    await tick();
    expect(plays).toHaveLength(0);
    loads.get('One.')!.resolve('audio-1');
    await tick();
    expect(plays.map((p) => p.item)).toEqual(['audio-1']);
    expect(q.remaining()).toEqual(['One.', 'Two.', 'Three.']);
    plays[0].done.resolve();
    await tick();
    expect(plays.map((p) => p.item)).toEqual(['audio-1', 'audio-2']);
    expect([...loads.keys()]).toEqual(['One.', 'Two.', 'Three.']);
    expect(events.released).toEqual(['audio-1']);
    loads.get('Three.')!.resolve('audio-3');
    plays[1].done.resolve();
    await tick();
    plays[2].done.resolve();
    await tick();
    expect(events.released).toEqual(['audio-1', 'audio-2', 'audio-3']);
    expect(events.idle).toBe(1);
    expect(q.running).toBe(false);

    // A new run starts again.
    q.push('Four.');
    expect(events.start).toBe(2);
  });

  it('skips a sentence whose load fails, stops on a fatal error', async () => {
    const { q, loads, plays, events } = setup();
    q.push('Bad.');
    q.push('Good.');
    loads.get('Bad.')!.reject(new Error('500'));
    loads.get('Good.')!.resolve('audio-good');
    await tick();
    expect(events.errors).toEqual(['Bad.']);
    expect(plays.map((p) => p.item)).toEqual(['audio-good']);
    plays[0].done.resolve();
    await tick();
    expect(events.idle).toBe(1);

    q.push('A.');
    q.push('B.');
    loads.get('A.')!.reject(new Error('fatal'));
    await tick();
    expect(q.running).toBe(false);
    expect(q.pending).toBe(0);
    expect(events.idle).toBe(2);
  });

  it('cancel aborts playback, releases loaded audio and fires idle once', async () => {
    const { q, loads, plays, events } = setup();
    q.push('One.');
    q.push('Two.');
    loads.get('One.')!.resolve('a1');
    loads.get('Two.')!.resolve('a2');
    await tick();
    expect(plays).toHaveLength(1);
    q.cancel();
    expect(plays[0].signal.aborted).toBe(true);
    expect(events.idle).toBe(1);
    expect(events.released.sort()).toEqual(['a1', 'a2']);
    await tick();
    expect(plays).toHaveLength(1); // nothing else played after cancel
    q.cancel();
    expect(events.idle).toBe(1);
  });

  it('ignores empty sentences and pushes after dispose', () => {
    const load = vi.fn(async () => 'x');
    const q = createSentenceQueue({ load, play: async () => {} });
    q.push('   ');
    expect(load).not.toHaveBeenCalled();
    q.dispose();
    q.push('Hello.');
    expect(load).not.toHaveBeenCalled();
  });
});
