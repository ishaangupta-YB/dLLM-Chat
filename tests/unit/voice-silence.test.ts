import { describe, expect, it } from 'vitest';
import { createSilenceDetector } from '@/lib/voice/silence';

/** Feed `ms` of a constant level at 50 ms steps; returns the last verdict. */
function feed(d: ReturnType<typeof createSilenceDetector>, clock: { t: number }, level: number, ms: number) {
  let v = d.push(level, clock.t);
  const end = clock.t + ms;
  while (clock.t < end) {
    clock.t += 50;
    v = d.push(level, clock.t);
    if (v === 'end' || v === 'timeout') break;
  }
  return v;
}

describe('silence detector', () => {
  it('waits, detects speech, then ends after ~800 ms of quiet', () => {
    const d = createSilenceDetector();
    const c = { t: 0 };
    expect(feed(d, c, 0.005, 500)).toBe('waiting');
    expect(feed(d, c, 0.2, 600)).toBe('speaking');
    expect(d.heardSpeech).toBe(true);
    // A short pause (400 ms) does not end the turn.
    expect(feed(d, c, 0.005, 400)).toBe('speaking');
    expect(feed(d, c, 0.2, 300)).toBe('speaking');
    const quietFrom = c.t;
    expect(feed(d, c, 0.005, 2000)).toBe('end');
    expect(c.t - quietFrom).toBeGreaterThanOrEqual(800);
    expect(c.t - quietFrom).toBeLessThan(950);
  });

  it('ignores short blips (clicks) and times out without speech', () => {
    const d = createSilenceDetector({ noSpeechTimeoutMs: 3000 });
    const c = { t: 0 };
    feed(d, c, 0.3, 100); // 100 ms blip < minSpeechMs
    expect(d.heardSpeech).toBe(false);
    expect(feed(d, c, 0.004, 5000)).toBe('timeout');
    // Ended detectors keep reporting the final verdict.
    expect(d.push(0.5, c.t + 50)).toBe('timeout');
  });

  it('adapts to a noisy room: steady fan noise is not speech, louder voice is', () => {
    const d = createSilenceDetector({ noSpeechTimeoutMs: 60_000 });
    const c = { t: 0 };
    expect(feed(d, c, 0.03, 3000)).toBe('waiting');
    expect(d.threshold).toBeGreaterThan(0.035);
    expect(feed(d, c, 0.25, 500)).toBe('speaking');
    expect(feed(d, c, 0.03, 2000)).toBe('end');
  });

  it('caps very long utterances and resets cleanly', () => {
    const d = createSilenceDetector({ maxUtteranceMs: 2000 });
    const c = { t: 0 };
    expect(feed(d, c, 0.2, 5000)).toBe('end');
    d.reset();
    expect(d.heardSpeech).toBe(false);
    expect(d.push(0.001, c.t)).toBe('waiting');
  });
});
