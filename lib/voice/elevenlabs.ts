// ElevenLabs REST calls made directly from the browser with the user's own key
// (BYOK; CORS is open and CSP allows connect-src https://api.elevenlabs.io).
// The key never reaches this app's server and is never logged.
//
// Follows Inception's "Realtime Voice Assistant" cookbook: speech-to-text for
// the user's turn, Mercury streams the reply, and each finished sentence is
// synthesized with the low-latency Flash model.

export const ELEVENLABS_API = 'https://api.elevenlabs.io';
export const ELEVENLABS_STT_MODEL = 'scribe_v2';
export const ELEVENLABS_TTS_MODEL = 'eleven_flash_v2_5';
/** "Rachel", the cookbook's default premade voice. */
export const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
export const ELEVENLABS_OUTPUT_FORMAT = 'mp3_44100_128';

export class ElevenLabsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ElevenLabsError';
    this.status = status;
  }
  /** The key is missing, wrong or lacks permission. */
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

/** User-facing message for an HTTP failure. Never includes the key or raw bodies. */
export function describeElevenLabsStatus(status: number, what: 'speech-to-text' | 'text-to-speech'): string {
  if (status === 401 || status === 403) return 'Your ElevenLabs API key was rejected.';
  if (status === 429) return `ElevenLabs ${what} is rate limited or out of credits.`;
  if (status === 422 || status === 400) return `ElevenLabs couldn't process the ${what === 'speech-to-text' ? 'recording' : 'text'}.`;
  if (status === 0) return `Couldn't reach ElevenLabs ${what}. Check your connection.`;
  return `ElevenLabs ${what} failed (${status}).`;
}

async function call(url: string, init: RequestInit, what: 'speech-to-text' | 'text-to-speech'): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ElevenLabsError(0, describeElevenLabsStatus(0, what));
  }
  if (!res.ok) {
    // Drain the body without surfacing it.
    void res.body?.cancel().catch(() => {});
    throw new ElevenLabsError(res.status, describeElevenLabsStatus(res.status, what));
  }
  return res;
}

function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

/** POST /v1/speech-to-text (multipart) and return the transcript text. */
export async function transcribe(
  audio: Blob,
  key: string,
  opts: { signal?: AbortSignal; languageCode?: string } = {},
): Promise<string> {
  const form = new FormData();
  form.append('model_id', ELEVENLABS_STT_MODEL);
  form.append('file', audio, `turn.${extensionFor(audio.type)}`);
  form.append('tag_audio_events', 'false');
  if (opts.languageCode) form.append('language_code', opts.languageCode);
  const res = await call(
    `${ELEVENLABS_API}/v1/speech-to-text`,
    { method: 'POST', headers: { 'xi-api-key': key }, body: form, signal: opts.signal },
    'speech-to-text',
  );
  const data = (await res.json().catch(() => ({}))) as { text?: unknown };
  return typeof data.text === 'string' ? cleanTranscript(data.text) : '';
}

/** Remove audio-event tags like "(laughs)" / "[music]" and squeeze whitespace. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\[[^\]]{1,40}\]|\((?:[a-z ]{1,30})\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * POST /v1/text-to-speech/{voice}/stream and return the audio as one Blob.
 * Sentences are short, so buffering a sentence costs little and keeps
 * playback simple (one <audio> source per sentence, prefetched ahead).
 */
export async function synthesize(
  text: string,
  key: string,
  opts: { signal?: AbortSignal; voiceId?: string } = {},
): Promise<Blob> {
  const voice = encodeURIComponent(opts.voiceId || ELEVENLABS_DEFAULT_VOICE_ID);
  const res = await call(
    `${ELEVENLABS_API}/v1/text-to-speech/${voice}/stream?output_format=${ELEVENLABS_OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: ELEVENLABS_TTS_MODEL }),
      signal: opts.signal,
    },
    'text-to-speech',
  );
  const blob = await res.blob();
  return blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' });
}

/** Best MediaRecorder MIME type this browser supports for speech upload. */
export function pickRecorderMime(isSupported: (t: string) => boolean): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    try {
      if (isSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
