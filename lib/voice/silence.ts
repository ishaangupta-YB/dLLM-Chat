// End-of-speech detection from a microphone level stream (RMS 0..1), used to
// end a recorded turn for server-side speech-to-text (ElevenLabs engine).
//
// Pure and clock-free: feed it (level, timeMs) samples and it reports when
// the user has started speaking and when they have been quiet long enough.

export interface SilenceOptions {
  /** Quiet time after speech that ends the turn. */
  silenceMs?: number;
  /** Speech must last this long (total above threshold) to count as a turn. */
  minSpeechMs?: number;
  /** Give up when nobody speaks for this long. */
  noSpeechTimeoutMs?: number;
  /** Hard cap on one utterance. */
  maxUtteranceMs?: number;
  /** Minimum absolute level treated as speech. */
  minThreshold?: number;
  /** Speech threshold relative to the measured noise floor. */
  floorRatio?: number;
}

export type SilenceVerdict =
  | 'waiting' // no speech yet
  | 'speaking' // speech in progress (or a short pause inside it)
  | 'end' // speech then silenceMs of quiet: end the turn
  | 'timeout'; // no speech within noSpeechTimeoutMs, or utterance too long without a pause

export interface SilenceDetector {
  push(level: number, now: number): SilenceVerdict;
  /** Speech was detected at some point in this turn. */
  readonly heardSpeech: boolean;
  /** Time of the last sample above the speech threshold (0 = none). */
  readonly lastSpeechAt: number;
  readonly threshold: number;
  reset(): void;
}

export const SILENCE_DEFAULTS: Required<SilenceOptions> = {
  silenceMs: 800,
  minSpeechMs: 220,
  noSpeechTimeoutMs: 9000,
  maxUtteranceMs: 45_000,
  minThreshold: 0.035,
  floorRatio: 2.2,
};

export function createSilenceDetector(options: SilenceOptions = {}): SilenceDetector {
  const o = { ...SILENCE_DEFAULTS, ...options };
  let startedAt = -1;
  let lastAt = -1;
  let floor = 0;
  let speechMs = 0;
  let heard = false;
  let lastSpeechAt = 0;
  let ended = false;

  const threshold = () => Math.max(o.minThreshold, floor * o.floorRatio);

  return {
    push(level, now) {
      if (ended) return heard ? 'end' : 'timeout';
      if (startedAt < 0) {
        startedAt = now;
        lastAt = now;
        floor = Math.min(level, o.minThreshold);
      }
      const dt = Math.max(0, Math.min(250, now - lastAt));
      lastAt = now;
      const loud = level > threshold();
      if (loud) {
        speechMs += dt;
        lastSpeechAt = now;
        if (speechMs >= o.minSpeechMs) heard = true;
      } else {
        // Track the noise floor slowly, only while quiet.
        floor = floor * 0.95 + level * 0.05;
        // A blip that never reached minSpeechMs decays away.
        if (!heard) speechMs = Math.max(0, speechMs - dt * 0.5);
      }

      if (heard) {
        if (!loud && now - lastSpeechAt >= o.silenceMs) {
          ended = true;
          return 'end';
        }
        if (now - startedAt >= o.maxUtteranceMs) {
          ended = true;
          return 'end';
        }
        return 'speaking';
      }
      if (now - startedAt >= o.noSpeechTimeoutMs) {
        ended = true;
        return 'timeout';
      }
      return speechMs > 0 ? 'speaking' : 'waiting';
    },
    get heardSpeech() {
      return heard;
    },
    get lastSpeechAt() {
      return lastSpeechAt;
    },
    get threshold() {
      return threshold();
    },
    reset() {
      startedAt = -1;
      lastAt = -1;
      floor = 0;
      speechMs = 0;
      heard = false;
      lastSpeechAt = 0;
      ended = false;
    },
  };
}
