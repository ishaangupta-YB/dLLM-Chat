// Paces diffusion frames. Mercury sends diffusing frames in bursts (2-3 frames
// within ~1ms, then a pause), so rendering them as they arrive makes the
// denoising effect invisible. Frames are queued and shown at a steady cadence,
// and the clean final frame always wins: a late noisy frame can never
// overwrite it.

export interface FramePlayerOptions {
  onFrame: (text: string, isFinal: boolean) => void;
  /** ms each frame stays on screen. Shortened automatically when backlogged. */
  frameMs?: number;
}

export function createFramePlayer({ onFrame, frameMs = 80 }: FramePlayerOptions) {
  const queue: string[] = [];
  let finalText: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ended = false;
  let stopped = false;
  let resolveDone: (() => void) | null = null;
  const done = new Promise<void>((r) => (resolveDone = r));

  const finish = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    resolveDone?.();
  };

  const tick = () => {
    timer = null;
    if (stopped) return;
    const next = queue.shift();
    if (next !== undefined) {
      onFrame(next, false);
    } else if (ended) {
      if (finalText !== null) onFrame(finalText, true);
      finish();
      return;
    }
    // Catch up when frames pile up (long answers) so we never lag far behind.
    const delay = queue.length > 12 ? frameMs / 4 : queue.length > 4 ? frameMs / 2 : frameMs;
    timer = setTimeout(tick, delay);
  };

  const ensureRunning = () => {
    if (!timer && !stopped) timer = setTimeout(tick, 0);
  };

  return {
    push(text: string, progress: number) {
      if (stopped) return;
      if (progress >= 1) {
        finalText = text;
      } else {
        queue.push(text);
      }
      ensureRunning();
    },
    /** Upstream finished. Remaining frames play out, then the final text. */
    end(fallbackFinal?: string) {
      if (finalText === null && fallbackFinal !== undefined) finalText = fallbackFinal;
      if (finalText === null && queue.length) finalText = queue[queue.length - 1];
      ended = true;
      ensureRunning();
    },
    /** Skip the animation and jump to the latest known text. */
    flush() {
      const latest = finalText ?? queue[queue.length - 1];
      queue.length = 0;
      if (latest !== undefined) onFrame(latest, true);
      finish();
    },
    cancel: finish,
    done,
  };
}
