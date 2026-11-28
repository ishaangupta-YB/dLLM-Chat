// Speaker backed by ElevenLabs streaming TTS (eleven_flash_v2_5). Same
// interface as the speechSynthesis speaker (./tts). Sentences are synthesized
// ahead (prefetch 2) and played in order through one <audio> element.
import type { Speaker, SpeakerEvents } from './tts';
import { createSentenceQueue } from './sentence-queue';
import { ElevenLabsError, synthesize } from './elevenlabs';

export interface ElevenLabsSpeakerEvents extends SpeakerEvents {
  /** Key rejected: `unspoken` holds the sentences that were not played. */
  onAuthError?: (err: ElevenLabsError, unspoken: string[]) => void;
  /** A sentence failed for another reason (it is skipped). */
  onError?: (err: unknown) => void;
}

export interface ElevenLabsSpeakerOptions {
  getKey: () => string | undefined;
  voiceId?: string;
  /** Injected for tests. */
  synthesizeFn?: typeof synthesize;
}

/** Plays one audio blob to the end on a shared element. Resolves on end, rejects on error/abort. */
function playBlob(audio: HTMLAudioElement, url: string, signal: AbortSignal, onTick: () => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let ticker: ReturnType<typeof setInterval> | null = null;
    const cleanup = () => {
      if (ticker) clearInterval(ticker);
      audio.onended = null;
      audio.onerror = null;
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      audio.pause();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort);
    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('Audio playback failed.'));
    };
    audio.src = url;
    // Animate the orb roughly at syllable rate while audio plays.
    ticker = setInterval(() => {
      if (!audio.paused) onTick();
    }, 190);
    audio.play().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

export function createElevenLabsSpeaker(events: ElevenLabsSpeakerEvents, opts: ElevenLabsSpeakerOptions): Speaker {
  const doSynthesize = opts.synthesizeFn ?? synthesize;
  const audio = typeof Audio !== 'undefined' ? new Audio() : null;
  if (audio) audio.preload = 'auto';
  let authFailed = false;

  const queue = createSentenceQueue<string>({
    prefetch: 2,
    load: async (text, signal) => {
      const key = opts.getKey();
      if (!key) throw new ElevenLabsError(401, 'No ElevenLabs API key.');
      const blob = await doSynthesize(text, key, { signal, voiceId: opts.voiceId });
      return URL.createObjectURL(blob);
    },
    play: (url, signal) => {
      if (!audio) return Promise.resolve();
      return playBlob(audio, url, signal, () => events.onBoundary?.());
    },
    release: (url) => URL.revokeObjectURL(url),
    onStart: () => events.onStart?.(),
    onIdle: () => {
      if (!authFailed) events.onIdle?.();
    },
    onError: (err, text) => {
      if (err instanceof ElevenLabsError && err.isAuth) {
        authFailed = true;
        const rest = queue.remaining();
        const unspoken = rest[0] === text ? rest : [text, ...rest];
        // Stop quietly; the engine re-speaks `unspoken` with the browser voice.
        queueMicrotask(() => {
          events.onAuthError?.(err, unspoken);
        });
        return 'stop';
      }
      events.onError?.(err);
      return 'skip';
    },
  });

  return {
    speak(sentence) {
      if (authFailed) return;
      queue.push(sentence);
    },
    cancel() {
      queue.cancel();
      audio?.pause();
    },
    get speaking() {
      return queue.running;
    },
    get pending() {
      return queue.pending;
    },
    dispose() {
      queue.dispose();
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    },
  };
}
