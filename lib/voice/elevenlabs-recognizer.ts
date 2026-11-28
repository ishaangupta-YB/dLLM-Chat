// Recognizer backed by MediaRecorder + ElevenLabs speech-to-text. Same
// interface as the Web Speech recognizer (./recognition) so the voice engine
// can swap them. One start() records one user turn: recording ends after
// ~800 ms of silence (mic level meter), then the clip is transcribed.
import type { Recognizer, RecognizerEvents, RecognitionErrorInfo } from './recognition';
import { createSilenceDetector, type SilenceOptions } from './silence';
import { ElevenLabsError, pickRecorderMime, transcribe } from './elevenlabs';

export interface ElevenLabsRecognizerEvents extends RecognizerEvents {
  /** Recording ended; the clip is being transcribed. */
  onTranscribing?: () => void;
  /** The key was rejected (401/403): the engine falls back to browser voice. */
  onAuthError?: (err: ElevenLabsError) => void;
}

export interface ElevenLabsRecognizerOptions {
  getKey: () => string | undefined;
  getStream: () => MediaStream | null;
  getLevel: () => number;
  silence?: SilenceOptions;
  /** Injected for tests. */
  transcribeFn?: typeof transcribe;
  now?: () => number;
}

export function createElevenLabsRecognizer(
  events: ElevenLabsRecognizerEvents,
  opts: ElevenLabsRecognizerOptions,
): Recognizer {
  const now = opts.now ?? (() => performance.now());
  const doTranscribe = opts.transcribeFn ?? transcribe;
  let turn = 0;
  let active = false;
  let recorder: MediaRecorder | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let controller: AbortController | null = null;
  let lang = '';
  let finishCurrent: ((how: 'send' | 'discard', forced?: boolean) => void) | null = null;

  const stopPoll = () => {
    if (poll) clearInterval(poll);
    poll = null;
  };

  const teardown = () => {
    stopPoll();
    const r = recorder;
    recorder = null;
    if (r && r.state !== 'inactive') {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
  };

  const end = (id: number, text: string, err: RecognitionErrorInfo | null) => {
    if (id !== turn) return;
    active = false;
    events.onEnd?.(text, err);
  };

  return {
    start() {
      const stream = opts.getStream();
      const key = opts.getKey();
      if (!stream || !key || typeof MediaRecorder === 'undefined') return false;
      teardown();
      controller?.abort();
      const id = ++turn;
      const mime = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t));
      let rec: MediaRecorder;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        return false;
      }
      const chunks: Blob[] = [];
      const detector = createSilenceDetector(opts.silence);
      let finishing: 'send' | 'discard' | null = null;
      let forcedSend = false;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (id !== turn) return; // aborted
        const heard = detector.heardSpeech || (forcedSend && detector.lastSpeechAt > 0);
        if (finishing !== 'send' || !heard) {
          end(id, '', null);
          return;
        }
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        events.onTranscribing?.();
        controller = new AbortController();
        const k = opts.getKey();
        if (!k) {
          end(id, '', { kind: 'generic', message: 'Add an ElevenLabs API key in Settings.' });
          return;
        }
        doTranscribe(blob, k, { signal: controller.signal, languageCode: lang || undefined })
          .then((text) => end(id, text, null))
          .catch((err: unknown) => {
            if (id !== turn || (err as Error)?.name === 'AbortError') return;
            if (err instanceof ElevenLabsError && err.isAuth) {
              active = false;
              events.onAuthError?.(err);
              return;
            }
            const message = err instanceof Error ? err.message : 'Speech-to-text failed.';
            end(id, '', { kind: 'network', message });
          });
      };

      const finish = (how: 'send' | 'discard', forced = false) => {
        if (finishing || id !== turn) return;
        finishing = how;
        forcedSend = forced;
        finishCurrent = null;
        stopPoll();
        if (rec.state !== 'inactive') {
          try {
            rec.stop();
          } catch {
            end(id, '', null);
          }
        }
      };

      try {
        rec.start(250);
      } catch {
        return false;
      }
      recorder = rec;
      active = true;
      events.onStart?.();
      poll = setInterval(() => {
        if (id !== turn) return;
        const verdict = detector.push(opts.getLevel(), now());
        if (verdict === 'speaking') events.onActivity?.();
        if (verdict === 'end') finish('send');
        else if (verdict === 'timeout') finish('discard');
      }, 50);
      finishCurrent = finish;
      return true;
    },
    stop() {
      finishCurrent?.('send', true);
    },
    abort() {
      turn++;
      active = false;
      finishCurrent = null;
      controller?.abort();
      controller = null;
      teardown();
    },
    get active() {
      return active;
    },
    setLang(l: string) {
      // ElevenLabs auto-detects; only pass a code when it is a plain ISO 639-1/3 code.
      lang = /^[a-z]{2,3}$/i.test(l) ? l.toLowerCase() : '';
    },
  };
}
