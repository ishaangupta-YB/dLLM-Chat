// Microphone level meter (getUserMedia + AnalyserNode RMS) for the voice orb
// and for best-effort barge-in detection. It never records anything.

export type MicStartResult = { ok: true } | { ok: false; reason: 'permission' | 'no-mic' | 'unsupported' | 'other' };

export interface MicMeter {
  start(): Promise<MicStartResult>;
  /** Smoothed RMS level, 0..1 (speech near a laptop mic is roughly 0.03 to 0.3). */
  readonly level: number;
  /** Mute: disables the track so the level drops to zero. */
  setEnabled(enabled: boolean): void;
  /** Stops all tracks and closes the audio context. Safe to call twice. */
  dispose(): void;
  /** For tests/diagnostics: whether a live track is held. */
  readonly live: boolean;
  /** The live microphone stream (recorded by the ElevenLabs engine), or null. */
  readonly stream: MediaStream | null;
}

/** RMS of time-domain samples in [-1, 1]. */
export function rms(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function createMicMeter(): MicMeter {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let buf: Float32Array<ArrayBuffer> | null = null;
  let raf: number | null = null;
  let level = 0;
  let enabled = true;
  let disposed = false;

  const tick = () => {
    raf = null;
    if (disposed || !analyser || !buf) return;
    analyser.getFloatTimeDomainData(buf);
    const v = enabled ? rms(buf) : 0;
    // Fast attack, slower release reads as "alive" without jitter.
    level = v > level ? level + (v - level) * 0.6 : level + (v - level) * 0.15;
    raf = requestAnimationFrame(tick);
  };

  const release = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    buf = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    ctx = null;
    level = 0;
  };

  return {
    async start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return { ok: false, reason: 'unsupported' };
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (disposed) {
          s.getTracks().forEach((t) => t.stop());
          return { ok: false, reason: 'other' };
        }
        stream = s;
        s.getAudioTracks().forEach((t) => (t.enabled = enabled));
        const AC: typeof AudioContext | undefined =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          ctx = new AC();
          void ctx.resume().catch(() => {});
          const src = ctx.createMediaStreamSource(s);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.2;
          buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
          src.connect(analyser); // not connected to destination: no feedback
          raf = requestAnimationFrame(tick);
        }
        return { ok: true };
      } catch (err) {
        const name = (err as DOMException)?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, reason: 'permission' };
        if (name === 'NotFoundError' || name === 'OverconstrainedError') return { ok: false, reason: 'no-mic' };
        return { ok: false, reason: 'other' };
      }
    },
    get level() {
      return level;
    },
    setEnabled(e: boolean) {
      enabled = e;
      stream?.getAudioTracks().forEach((t) => (t.enabled = e));
    },
    dispose() {
      disposed = true;
      release();
    },
    get live() {
      return !!stream?.getTracks().some((t) => t.readyState === 'live');
    },
    get stream() {
      return stream;
    },
  };
}
