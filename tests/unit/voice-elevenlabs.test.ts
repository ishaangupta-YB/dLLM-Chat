import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ELEVENLABS_DEFAULT_VOICE_ID,
  ELEVENLABS_STT_MODEL,
  ELEVENLABS_TTS_MODEL,
  ElevenLabsError,
  cleanTranscript,
  pickRecorderMime,
  synthesize,
  transcribe,
} from '@/lib/voice/elevenlabs';
import type { Recognizer } from '@/lib/voice/recognition';
import type { Speaker } from '@/lib/voice/tts';
import type { ElevenLabsRecognizerEvents } from '@/lib/voice/elevenlabs-recognizer';
import type { ElevenLabsSpeakerEvents } from '@/lib/voice/elevenlabs-speaker';
import {
  ELEVENLABS_FALLBACK_AUTH,
  ELEVENLABS_FALLBACK_NO_KEY,
  createVoiceEngine,
  type TurnResultLike,
  type VoiceEngineDeps,
} from '@/lib/voice/voice-engine';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('ElevenLabs REST client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('transcribe posts multipart scribe_v2 with the key header and returns clean text', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ text: ' Hello (laughs) there [music] ' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const text = await transcribe(new Blob(['abc'], { type: 'audio/webm' }), 'sk_test');
    expect(text).toBe('Hello there');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk_test');
    const form = init.body as FormData;
    expect(form.get('model_id')).toBe(ELEVENLABS_STT_MODEL);
    expect((form.get('file') as File).name).toBe('turn.webm');
    expect(init.credentials).toBe('omit');
  });

  it('synthesize streams flash TTS for the default voice', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const blob = await synthesize('Hi there.', 'sk_test');
    expect(blob.size).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_DEFAULT_VOICE_ID}/stream?output_format=mp3_44100_128`,
    );
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Hi there.', model_id: ELEVENLABS_TTS_MODEL });
  });

  it('maps 401 to an auth error without leaking the body or key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"invalid api key sk_test"}', { status: 401 })));
    const err = await transcribe(new Blob(['x']), 'sk_test').catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsError);
    expect(err.isAuth).toBe(true);
    expect(err.message).not.toContain('sk_test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    const rl = await synthesize('x', 'k').catch((e) => e);
    expect(rl.isAuth).toBe(false);
    expect(rl.message).toMatch(/rate limited/);
  });

  it('helpers', () => {
    expect(cleanTranscript('  a  b ')).toBe('a b');
    expect(pickRecorderMime((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecorderMime(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickRecorderMime(() => false)).toBe('');
  });
});

/* -------------------------------------------------------- engine wiring */

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;
  onresult = null;
  onerror = null;
  onend: (() => void) | null = null;
  onstart = null;
  started = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {}
  abort() {
    this.started = false;
  }
}

/** Fake ElevenLabs recognizer/speaker that record calls and expose their events. */
function fakeEleven() {
  const ctl = {
    recEvents: null as ElevenLabsRecognizerEvents | null,
    spkEvents: null as ElevenLabsSpeakerEvents | null,
    recStarts: 0,
    spoken: [] as string[],
    speaking: false,
  };
  const createRecognizer = (events: ElevenLabsRecognizerEvents): Recognizer => {
    ctl.recEvents = events;
    return {
      start: () => {
        ctl.recStarts++;
        return true;
      },
      stop: () => {},
      abort: () => {},
      get active() {
        return false;
      },
      setLang: () => {},
    };
  };
  const createSpeaker = (events: ElevenLabsSpeakerEvents): Speaker => {
    ctl.spkEvents = events;
    return {
      speak: (s) => {
        ctl.spoken.push(s);
        if (!ctl.speaking) {
          ctl.speaking = true;
          events.onStart?.();
        }
      },
      cancel: () => {
        ctl.speaking = false;
      },
      get speaking() {
        return ctl.speaking;
      },
      get pending() {
        return 0;
      },
      dispose: () => {
        ctl.speaking = false;
      },
    };
  };
  return { ctl, createRecognizer, createSpeaker };
}

const synth = {
  spoken: [] as { text: string }[],
  speaking: false,
  pending: false,
  paused: false,
  getVoices: () => [],
  speak(u: { text: string }) {
    this.spoken.push(u);
  },
  cancel() {},
  pause() {},
  resume() {},
  addEventListener() {},
  removeEventListener() {},
};

class FakeUtterance {
  text: string;
  constructor(t: string) {
    this.text = t;
  }
}

beforeEach(() => {
  FakeRecognition.instances = [];
  synth.spoken = [];
  vi.stubGlobal('window', {
    webkitSpeechRecognition: FakeRecognition,
    speechSynthesis: synth,
    SpeechSynthesisUtterance: FakeUtterance,
  });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  const track = { enabled: true, readyState: 'live', stop() {} };
  vi.stubGlobal('navigator', {
    language: 'en-US',
    userAgent: 'test',
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function deps(over: Partial<VoiceEngineDeps> = {}): VoiceEngineDeps {
  return {
    send: vi.fn(async (_t: string, o: { onText: (s: string) => void }) => {
      o.onText('Sure thing. ');
      o.onText('Sure thing. Here it is.');
      return { content: 'Sure thing. Here it is.' } as TurnResultLike;
    }),
    stop: vi.fn(),
    isBusy: () => false,
    getAutoSpeak: () => true,
    onState: vi.fn(),
    ...over,
  };
}

describe('voice engine with ElevenLabs', () => {
  it('uses ElevenLabs when selected with a key: transcript -> send -> sentences to TTS', async () => {
    const { ctl, createRecognizer, createSpeaker } = fakeEleven();
    const d = deps({
      engine: 'elevenlabs',
      getElevenLabsKey: () => 'sk_live',
      elevenLabs: { createRecognizer, createSpeaker, isSupported: () => true },
    });
    const engine = createVoiceEngine(d);
    expect(engine.getState().engine).toBe('elevenlabs');
    await engine.start();
    expect(engine.getState().phase).toBe('listening');
    expect(ctl.recStarts).toBe(1);
    expect(FakeRecognition.instances).toHaveLength(0); // browser recognizer unused

    ctl.recEvents!.onTranscribing!();
    expect(engine.getState().transcribing).toBe(true);
    ctl.recEvents!.onEnd!('tell me a fact', null);
    await tick();
    expect(d.send).toHaveBeenCalledWith('tell me a fact', expect.objectContaining({ voice: true }));
    expect(ctl.spoken).toEqual(['Sure thing.', 'Here it is.']);
    expect(synth.spoken).toHaveLength(0);
    expect(engine.getState().phase).toBe('speaking');
    // Queue drains -> listening again with the ElevenLabs recognizer.
    ctl.speaking = false;
    ctl.spkEvents!.onIdle!();
    expect(engine.getState().phase).toBe('listening');
    expect(ctl.recStarts).toBe(2);
    engine.dispose();
  });

  it('falls back to browser voice with a notice when the key is missing', async () => {
    const { ctl, createRecognizer, createSpeaker } = fakeEleven();
    const engine = createVoiceEngine(
      deps({ engine: 'elevenlabs', getElevenLabsKey: () => undefined, elevenLabs: { createRecognizer, createSpeaker } }),
    );
    expect(engine.getState()).toMatchObject({ engine: 'browser', notice: ELEVENLABS_FALLBACK_NO_KEY });
    await engine.start();
    expect(ctl.recStarts).toBe(0);
    expect(FakeRecognition.instances.at(-1)!.started).toBe(true);
    engine.dispose();
  });

  it('falls back to browser voice when STT returns 401, and keeps listening', async () => {
    const { ctl, createRecognizer, createSpeaker } = fakeEleven();
    const engine = createVoiceEngine(
      deps({
        engine: 'elevenlabs',
        getElevenLabsKey: () => 'sk_bad',
        elevenLabs: { createRecognizer, createSpeaker, isSupported: () => true },
      }),
    );
    await engine.start();
    ctl.recEvents!.onAuthError!(new ElevenLabsError(401, 'rejected'));
    expect(engine.getState()).toMatchObject({ engine: 'browser', notice: ELEVENLABS_FALLBACK_AUTH });
    await tick(60);
    expect(engine.getState().phase).toBe('listening');
    expect(FakeRecognition.instances.at(-1)!.started).toBe(true);
    engine.dispose();
  });

  it('re-speaks unspoken sentences with the browser voice when TTS returns 401', async () => {
    const { ctl, createRecognizer, createSpeaker } = fakeEleven();
    const engine = createVoiceEngine(
      deps({
        engine: 'elevenlabs',
        getElevenLabsKey: () => 'sk_bad',
        elevenLabs: { createRecognizer, createSpeaker, isSupported: () => true },
      }),
    );
    await engine.start();
    engine.submit('hello');
    await tick();
    expect(ctl.spoken).toEqual(['Sure thing.', 'Here it is.']);
    ctl.spkEvents!.onAuthError!(new ElevenLabsError(401, 'rejected'), ['Sure thing.', 'Here it is.']);
    expect(engine.getState().engine).toBe('browser');
    expect(synth.spoken.map((u) => u.text)).toEqual(['Sure thing.']);
    engine.dispose();
  });

  it('falls back when the browser cannot record', async () => {
    const { createRecognizer, createSpeaker } = fakeEleven();
    const engine = createVoiceEngine(
      deps({
        engine: 'elevenlabs',
        getElevenLabsKey: () => 'sk',
        elevenLabs: { createRecognizer, createSpeaker, isSupported: () => false },
      }),
    );
    await engine.start();
    expect(engine.getState().engine).toBe('browser');
    expect(engine.getState().notice).toMatch(/can’t record/);
    engine.dispose();
  });
});
