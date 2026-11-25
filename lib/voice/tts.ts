// Sentence queue on top of the browser's speechSynthesis.
//
// We keep our own queue (one utterance at a time) instead of relying on the
// engine's queue so we always know when speech starts and when the queue is
// empty, and so cancel() is reliable. Utterances stay sentence-sized, which
// avoids Chrome's habit of silently stopping long utterances.

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
  voiceURI?: string;
}

/** Score a voice for natural English-ish speech in `lang`. Higher is better. */
export function scoreVoice(v: VoiceLike, lang: string): number {
  const want = lang.toLowerCase().replace('_', '-');
  const wantBase = want.split('-')[0];
  const vl = v.lang.toLowerCase().replace('_', '-');
  const base = vl.split('-')[0];
  const name = v.name.toLowerCase();
  let s = 0;
  if (vl === want) s += 40;
  else if (base === wantBase) s += 25;
  else if (base === 'en') s += 5;
  else return -100;
  if (/natural|neural/.test(name)) s += 30; // Edge "Microsoft Aria Online (Natural)"
  if (/premium|enhanced/.test(name)) s += 22; // Safari downloaded voices
  if (/google/.test(name)) s += 18; // Chrome's network voices
  if (/microsoft/.test(name) && /online/.test(name)) s += 6;
  if (/samantha|ava|allison|serena|daniel|karen|moira|aria|jenny|guy/.test(name)) s += 6;
  if (/espeak|compact|novelty|bad news|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|albert|jester|organ|superstar|wobble|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/.test(name)) s -= 40;
  if (v.default) s += 3;
  return s;
}

export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  let best: V | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const sc = scoreVoice(v, lang);
    if (sc > bestScore) {
      best = v;
      bestScore = sc;
    }
  }
  return bestScore > -100 ? best : null;
}

export interface SpeakerEvents {
  /** First audio of a queue run started. */
  onStart?: () => void;
  /** Queue drained (all sentences spoken, or cancelled). */
  onIdle?: () => void;
  /** Word boundary inside an utterance (used to animate the orb). */
  onBoundary?: () => void;
}

export interface Speaker {
  speak(sentence: string): void;
  cancel(): void;
  readonly speaking: boolean;
  /** Sentences queued or playing. */
  readonly pending: number;
  dispose(): void;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function createSpeaker(events: SpeakerEvents = {}, opts: { lang?: string; rate?: number } = {}): Speaker {
  const supported = isSpeechSynthesisSupported();
  const synth = supported ? window.speechSynthesis : null;
  const lang = opts.lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
  const rate = opts.rate ?? 1.05;

  let voice: SpeechSynthesisVoice | null = null;
  const queue: string[] = [];
  let current: SpeechSynthesisUtterance | null = null; // strong ref: Chrome GCs utterances and drops onend
  let running = false;
  let disposed = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const chooseVoice = () => {
    if (!synth) return;
    const v = pickVoice(synth.getVoices(), lang);
    if (v) voice = v;
  };
  chooseVoice();
  const onVoicesChanged = () => chooseVoice();
  synth?.addEventListener?.('voiceschanged', onVoicesChanged);

  // Desktop Chrome stops network voices after ~15 s; a pause/resume nudge keeps
  // them going. On Android and Safari pause() behaves like cancel, so skip it.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const needsKeepAlive = /Chrome\//.test(ua) && !/Android|Edg\//.test(ua);

  const clearTimers = () => {
    if (watchdog) clearTimeout(watchdog);
    if (keepAlive) clearInterval(keepAlive);
    watchdog = null;
    keepAlive = null;
  };

  const finishRun = () => {
    clearTimers();
    current = null;
    if (running) {
      running = false;
      events.onIdle?.();
    }
  };

  const next = () => {
    clearTimers();
    current = null;
    if (disposed || !synth) return finishRun();
    const text = queue.shift();
    if (!text) return finishRun();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    if (voice) {
      try {
        u.voice = voice;
        u.lang = voice.lang;
      } catch {
        /* stale or foreign voice object: fall back to the language default */
      }
    }
    u.rate = rate;
    u.pitch = 1;
    current = u;
    let done = false;
    const advance = () => {
      if (done || current !== u) return;
      done = true;
      next();
    };
    u.onend = advance;
    u.onerror = advance; // "interrupted"/"canceled" from cancel() land here too
    u.onboundary = () => events.onBoundary?.();
    // Some engines never fire onend (or never start, e.g. no voices installed).
    // Advance after a generous estimate so the conversation never hangs.
    watchdog = setTimeout(advance, 5000 + text.length * 130);
    if (needsKeepAlive && voice && !voice.localService) {
      keepAlive = setInterval(() => {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      }, 10_000);
    }
    try {
      synth.speak(u);
    } catch {
      advance();
    }
  };

  return {
    speak(sentence: string) {
      const s = sentence.trim();
      if (!s || disposed || !synth) return;
      queue.push(s);
      if (!running) {
        running = true;
        events.onStart?.();
        // Chrome can get stuck paused after a previous cancel.
        if (synth.paused) synth.resume();
        next();
      }
    },
    cancel() {
      queue.length = 0;
      const wasRunning = running;
      current = null;
      clearTimers();
      if (synth && (synth.speaking || synth.pending)) synth.cancel();
      running = false;
      if (wasRunning) events.onIdle?.();
    },
    get speaking() {
      return running;
    },
    get pending() {
      return queue.length + (current ? 1 : 0);
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      current = null;
      clearTimers();
      running = false;
      if (synth && (synth.speaking || synth.pending)) synth.cancel();
      synth?.removeEventListener?.('voiceschanged', onVoicesChanged);
    },
  };
}
