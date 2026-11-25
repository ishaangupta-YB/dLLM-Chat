// One-utterance-at-a-time wrapper around the Web Speech API recognizer
// (SpeechRecognition / webkitSpeechRecognition). Each start() listens for a
// single user turn (continuous = false, so the browser does the endpointing),
// reporting interim text as it goes and the final transcript when it ends.

// Minimal typing of the parts we use. Declared locally (not on Window) so it
// cannot clash with other declarations in the project.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionResultList {
  readonly length: number;
  [index: number]: RecognitionResult;
}
interface RecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}
interface RecognitionErrorEventLike extends Event {
  readonly error: string;
}
interface RecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: RecognitionEventLike) => void) | null;
  onerror: ((ev: RecognitionErrorEventLike) => void) | null;
  onend: ((ev: Event) => void) | null;
  onstart: ((ev: Event) => void) | null;
  onspeechstart?: ((ev: Event) => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

export function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export type RecognitionErrorKind = 'permission' | 'network' | 'no-mic' | 'language' | 'ignore' | 'generic';

export interface RecognitionErrorInfo {
  kind: RecognitionErrorKind;
  message: string;
}

/** Map a SpeechRecognitionErrorEvent.error code to something we can show. */
export function describeRecognitionError(code: string): RecognitionErrorInfo {
  switch (code) {
    case 'no-speech':
    case 'aborted':
      return { kind: 'ignore', message: '' };
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        kind: 'permission',
        message: 'Microphone access is blocked. Allow the microphone for this site in your browser, then try again.',
      };
    case 'audio-capture':
      return { kind: 'no-mic', message: 'No microphone was found. Connect one and try again.' };
    case 'network':
      return {
        kind: 'network',
        message: "Speech recognition couldn't reach the browser's speech service. Check your connection and try again.",
      };
    case 'language-not-supported':
      return { kind: 'language', message: 'Your language is not supported by speech recognition; using English.' };
    default:
      return { kind: 'generic', message: `Speech recognition stopped (${code || 'unknown error'}).` };
  }
}

export interface RecognizerEvents {
  onStart?: () => void;
  /** Running transcript of this turn (final parts + current interim guess). */
  onInterim?: (text: string) => void;
  /** Any recognition activity: used as a proxy for "user is still speaking". */
  onActivity?: () => void;
  /** Called once per start() when the turn ends. `transcript` may be ''. */
  onEnd?: (transcript: string, error: RecognitionErrorInfo | null) => void;
}

export interface Recognizer {
  start(): boolean;
  /** Stop listening and deliver what was heard so far. */
  stop(): void;
  /** Stop listening and discard. onEnd is not called. */
  abort(): void;
  readonly active: boolean;
  setLang(lang: string): void;
}

export function createRecognizer(events: RecognizerEvents, initialLang?: string): Recognizer {
  const Ctor = getRecognitionCtor();
  let lang = initialLang || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-US';
  let rec: RecognitionLike | null = null;

  const detach = (r: RecognitionLike) => {
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    r.onstart = null;
  };

  return {
    start() {
      if (!Ctor) return false;
      if (rec) {
        const old = rec;
        detach(old);
        try {
          old.abort();
        } catch {
          /* ignore */
        }
        rec = null;
      }
      // A fresh instance per turn: reusing one across turns is flaky in Safari.
      const r = new Ctor();
      r.continuous = false;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.lang = lang;
      let finalText = '';
      let interimText = '';
      let error: RecognitionErrorInfo | null = null;

      r.onstart = () => events.onStart?.();
      r.onresult = (ev) => {
        let fin = '';
        let interim = '';
        for (let i = 0; i < ev.results.length; i++) {
          const res = ev.results[i];
          const t = res[0]?.transcript ?? '';
          if (res.isFinal) fin += t;
          else interim += t;
        }
        finalText = fin;
        interimText = interim;
        events.onActivity?.();
        events.onInterim?.(`${fin}${interim}`.replace(/\s+/g, ' ').trim());
      };
      r.onerror = (ev) => {
        const info = describeRecognitionError(ev.error);
        if (info.kind !== 'ignore') error = info;
      };
      r.onend = () => {
        if (rec !== r) return;
        rec = null;
        detach(r);
        // If the engine ended before marking anything final (stop() was
        // called, or Safari), use the last interim guess.
        const text = (finalText || interimText).replace(/\s+/g, ' ').trim();
        events.onEnd?.(text, error);
      };

      rec = r;
      try {
        r.start();
        return true;
      } catch {
        rec = null;
        detach(r);
        return false;
      }
    },
    stop() {
      try {
        rec?.stop();
      } catch {
        /* ignore */
      }
    },
    abort() {
      const r = rec;
      rec = null;
      if (!r) return;
      detach(r);
      try {
        r.abort();
      } catch {
        /* ignore */
      }
    },
    get active() {
      return rec !== null;
    },
    setLang(l: string) {
      lang = l;
    },
  };
}
