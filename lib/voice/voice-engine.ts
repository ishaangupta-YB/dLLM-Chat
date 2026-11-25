// Hands-free voice conversation loop:
//   listening -> (final transcript) -> thinking -> speaking -> listening ...
//
// Framework-free; React binds to it through useVoiceSession(). Speech in and
// out run in the browser (Web Speech API); the text turn goes through the
// normal chat controller with voice:true (mercury-3 + realtime on the server).
import { createRecognizer, isRecognitionSupported, type RecognitionErrorInfo } from './recognition';
import { createSpeaker } from './tts';
import { createSentenceChunker } from './sentence-chunker';
import { createMicMeter } from './mic-level';

export type VoicePhase = 'starting' | 'listening' | 'thinking' | 'speaking' | 'paused';

export type VoiceErrorKind = RecognitionErrorInfo['kind'] | 'unsupported' | 'api';

export interface VoiceError {
  kind: VoiceErrorKind;
  message: string;
  /** Show a retry button. */
  retryable: boolean;
}

export interface VoiceState {
  phase: VoicePhase;
  muted: boolean;
  /** Live transcript of what the user is saying right now. */
  interim: string;
  /** Last completed user utterance. */
  userText: string;
  /** Assistant reply as it streams. */
  assistantText: string;
  error: VoiceError | null;
  /** End of user speech to first assistant text, for the last turn. */
  latencyMs: number | null;
  /** A level meter is running (mic permission granted). */
  micLive: boolean;
}

export interface TurnResultLike {
  content: string;
  error?: string;
  aborted?: boolean;
}

export interface VoiceEngineDeps {
  send: (text: string, opts: { voice: true; onText: (full: string) => void }) => Promise<TurnResultLike>;
  stop: () => void;
  /** Another response (e.g. typed chat) is streaming. */
  isBusy: () => boolean;
  getAutoSpeak: () => boolean;
  onState: (s: VoiceState) => void;
}

export interface VoiceEngine {
  start(): Promise<void>;
  dispose(): void;
  toggleMute(): void;
  /** Stop speaking / cancel the in-flight reply, then listen again. */
  interrupt(): void;
  /** Stop listening now and send what was heard. */
  finishTurn(): void;
  retry(): void;
  /** Send text as if it had been spoken (dev test hook). */
  submit(text: string): void;
  setAutoSpeak(on: boolean): void;
  /** Mic level 0..1 for visuals. */
  getLevel(): number;
  /** 0..1 pulse that jumps on TTS word boundaries and decays. */
  getSpeechPulse(): number;
  getState(): VoiceState;
}

const BARGE_MIN_LEVEL = 0.09;
const BARGE_HOLD_MS = 350;
const BARGE_GRACE_MS = 700;

export function createVoiceEngine(deps: VoiceEngineDeps): VoiceEngine {
  const state: VoiceState = {
    phase: 'starting',
    muted: false,
    interim: '',
    userText: '',
    assistantText: '',
    error: null,
    latencyMs: null,
    micLive: false,
  };

  let disposed = false;
  let turnId = 0;
  let requestInFlight = false;
  let responseDone = true;
  let suppressIdle = false;
  let listenStartedAt = 0;
  let lastActivity = 0;
  let quickEnds = 0;
  let speakingSince = 0;
  let pulse = 0;
  let pulseAt = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let emitTimer: ReturnType<typeof setTimeout> | null = null;
  let bargeTimer: ReturnType<typeof setInterval> | null = null;

  const emitNow = () => {
    emitTimer = null;
    if (!disposed) deps.onState({ ...state });
  };
  const emit = () => {
    if (emitTimer === null && !disposed) emitTimer = setTimeout(emitNow, 16);
  };
  const set = (patch: Partial<VoiceState>) => {
    Object.assign(state, patch);
    emit();
  };
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!disposed) fn();
    }, ms);
    timers.add(t);
  };

  let mic = createMicMeter();
  const chunker = createSentenceChunker();

  const speaker = createSpeaker({
    onStart: () => {
      if (disposed) return;
      speakingSince = performance.now();
      if (state.phase === 'thinking' || state.phase === 'speaking') set({ phase: 'speaking' });
    },
    onIdle: () => {
      if (disposed || suppressIdle) return;
      if (state.phase !== 'speaking' && state.phase !== 'thinking') return;
      if (responseDone) listen();
      else set({ phase: 'thinking' }); // waiting for more text
    },
    onBoundary: () => {
      pulse = 1;
      pulseAt = performance.now();
    },
  });

  const cancelSpeech = () => {
    suppressIdle = true;
    speaker.cancel();
    suppressIdle = false;
  };

  const recognizer = createRecognizer({
    onInterim: (text) => {
      if (state.phase === 'listening') set({ interim: text });
    },
    onActivity: () => {
      lastActivity = performance.now();
    },
    onEnd: (transcript, err) => handleRecognitionEnd(transcript, err),
  });

  function listen() {
    if (disposed) return;
    if (state.muted) {
      set({ phase: 'paused', interim: '' });
      return;
    }
    stopBargeWatch();
    listenStartedAt = performance.now();
    lastActivity = 0;
    set({ phase: 'listening', interim: '' });
    if (!recognizer.start()) {
      quickEnds++;
      if (quickEnds > 5) {
        set({
          phase: 'paused',
          error: { kind: 'generic', message: 'Speech recognition could not start.', retryable: true },
        });
        return;
      }
      later(listen, 300);
    }
  }

  function handleRecognitionEnd(transcript: string, err: RecognitionErrorInfo | null) {
    if (disposed || state.phase !== 'listening') return;
    if (err) {
      if (err.kind === 'language') {
        recognizer.setLang('en-US');
        set({ error: { kind: 'language', message: err.message, retryable: false } });
      } else {
        set({ phase: 'paused', interim: '', error: { ...err, retryable: true } });
        return;
      }
    }
    if (transcript) {
      quickEnds = 0;
      void runTurn(transcript, lastActivity || performance.now());
      return;
    }
    // Nothing heard (no-speech timeout): just listen again. Guard against a
    // tight loop when the engine ends immediately every time.
    if (performance.now() - listenStartedAt < 400) quickEnds++;
    else quickEnds = 0;
    if (quickEnds > 6) {
      set({
        phase: 'paused',
        error: { kind: 'generic', message: 'Speech recognition keeps stopping. Try again.', retryable: true },
      });
      return;
    }
    later(listen, quickEnds ? 250 : 30);
  }

  async function runTurn(text: string, speechEndAt: number) {
    const id = ++turnId;
    recognizer.abort();
    cancelSpeech();
    chunker.reset();
    responseDone = false;
    let firstText = true;
    set({
      phase: 'thinking',
      userText: text,
      interim: '',
      assistantText: '',
      error: state.error?.kind === 'language' ? state.error : null,
    });

    if (deps.isBusy()) {
      // A typed reply is still streaming; voice takes over.
      deps.stop();
      for (let i = 0; i < 30 && deps.isBusy(); i++) await new Promise((r) => setTimeout(r, 50));
      if (disposed || id !== turnId) return;
    }

    requestInFlight = true;
    let res: TurnResultLike;
    try {
      res = await deps.send(text, {
        voice: true,
        onText: (full) => {
          if (disposed || id !== turnId) return;
          if (firstText) {
            firstText = false;
            set({ latencyMs: Math.max(0, Math.round(performance.now() - speechEndAt)) });
          }
          set({ assistantText: full });
          if (deps.getAutoSpeak()) for (const s of chunker.push(full)) speaker.speak(s);
        },
      });
    } catch (e) {
      res = { content: '', error: (e as Error)?.message || 'Something went wrong.' };
    }
    requestInFlight = false;
    if (disposed || id !== turnId) return;
    responseDone = true;
    if (res.aborted) return;

    if (res.error) {
      set({ error: { kind: 'api', message: res.error, retryable: false } });
    } else if (deps.getAutoSpeak()) {
      for (const s of chunker.flush()) speaker.speak(s);
    }
    if (speaker.speaking) {
      startBargeWatch();
    } else {
      listen();
    }
  }

  // Best-effort barge-in: while the assistant speaks, sustained loud input on
  // the mic cancels speech and starts listening. Echo cancellation helps with
  // speakers; with headphones it is reliable.
  let bargeMs = 0;
  let echoFloor = 0;
  function startBargeWatch() {
    if (bargeTimer || !state.micLive) return;
    bargeMs = 0;
    echoFloor = 0;
    bargeTimer = setInterval(() => {
      if (disposed || state.phase !== 'speaking' || state.muted) {
        bargeMs = 0;
        return;
      }
      const lvl = mic.level;
      if (performance.now() - speakingSince < BARGE_GRACE_MS) {
        echoFloor = Math.max(echoFloor, lvl);
        return;
      }
      echoFloor = echoFloor * 0.98 + lvl * 0.02;
      const threshold = Math.max(BARGE_MIN_LEVEL, echoFloor * 2.5);
      bargeMs = lvl > threshold ? bargeMs + 60 : Math.max(0, bargeMs - 60);
      if (bargeMs >= BARGE_HOLD_MS) interrupt();
    }, 60);
  }
  function stopBargeWatch() {
    if (bargeTimer) clearInterval(bargeTimer);
    bargeTimer = null;
  }

  function interrupt() {
    if (disposed) return;
    if (state.phase !== 'speaking' && state.phase !== 'thinking') return;
    turnId++;
    if (requestInFlight) {
      requestInFlight = false;
      deps.stop();
    }
    responseDone = true;
    cancelSpeech();
    listen();
  }

  function retry() {
    if (disposed) return;
    set({ error: null });
    quickEnds = 0;
    if (!state.micLive) {
      // A fresh meter re-requests microphone permission.
      mic.dispose();
      mic = createMicMeter();
      void start();
    } else {
      listen();
    }
  }

  async function start() {
    if (!isRecognitionSupported()) {
      set({
        phase: 'paused',
        error: { kind: 'unsupported', message: 'Voice mode needs Chrome, Edge or Safari.', retryable: false },
      });
      return;
    }
    Object.assign(state, { phase: 'starting', error: null });
    emitNow(); // synchronously, so a reopened overlay never shows the last session
    const r = await mic.start();
    if (disposed) return;
    if (!r.ok && (r.reason === 'permission' || r.reason === 'no-mic')) {
      set({
        phase: 'paused',
        micLive: false,
        error:
          r.reason === 'permission'
            ? {
                kind: 'permission',
                message: 'Microphone access is blocked. Allow the microphone for this site in your browser, then try again.',
                retryable: true,
              }
            : { kind: 'no-mic', message: 'No microphone was found. Connect one and try again.', retryable: true },
      });
      return;
    }
    set({ micLive: r.ok });
    mic.setEnabled(!state.muted);
    listen();
  }

  return {
    start,
    dispose() {
      if (disposed) return;
      disposed = true;
      turnId++;
      recognizer.abort();
      if (requestInFlight) {
        requestInFlight = false;
        deps.stop();
      }
      speaker.dispose();
      mic.dispose();
      stopBargeWatch();
      timers.forEach(clearTimeout);
      timers.clear();
      if (emitTimer) clearTimeout(emitTimer);
      emitTimer = null;
    },
    toggleMute() {
      if (disposed) return;
      const muted = !state.muted;
      mic.setEnabled(!muted);
      set({ muted });
      if (muted) {
        if (state.phase === 'listening' || state.phase === 'starting') {
          recognizer.abort();
          set({ phase: 'paused', interim: '' });
        }
      } else if (state.phase === 'paused') {
        if (state.error?.retryable) retry();
        else listen();
      }
    },
    interrupt,
    finishTurn() {
      if (state.phase === 'listening') recognizer.stop();
    },
    retry,
    submit(text: string) {
      const t = text.trim();
      if (!t || disposed) return;
      void runTurn(t, performance.now());
    },
    setAutoSpeak(on: boolean) {
      if (on || disposed) return;
      if (speaker.speaking) {
        cancelSpeech();
        if (responseDone) listen();
        else set({ phase: 'thinking' });
      }
    },
    getLevel() {
      return state.muted ? 0 : mic.level;
    },
    getSpeechPulse() {
      if (!pulse) return 0;
      const v = Math.max(0, 1 - (performance.now() - pulseAt) / 260);
      if (!v) pulse = 0;
      return v;
    },
    getState() {
      return { ...state };
    },
  };
}
