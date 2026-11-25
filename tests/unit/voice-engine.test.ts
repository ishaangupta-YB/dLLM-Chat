import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeRecognitionError } from '@/lib/voice/recognition';
import { createVoiceEngine, type TurnResultLike, type VoiceEngineDeps } from '@/lib/voice/voice-engine';

// ---- Minimal fakes for the Web Speech API --------------------------------

class FakeRecognition extends EventTarget {
  static instances: FakeRecognition[] = [];
  continuous = true;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;
  started = false;
  onresult: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onend: ((ev: unknown) => void) | null = null;
  onstart: ((ev: unknown) => void) | null = null;
  constructor() {
    super();
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.end();
  }
  abort() {
    this.started = false;
  }
  say(text: string, isFinal = true) {
    const result = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  end() {
    this.started = false;
    this.onend?.({});
  }
}

class FakeUtterance {
  text: string;
  voice: unknown = null;
  lang = '';
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onboundary: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const synth = {
  spoken: [] as FakeUtterance[],
  speaking: false,
  pending: false,
  paused: false,
  getVoices: () => [{ name: 'Google US English', lang: 'en-US', localService: false, default: true }],
  speak(u: FakeUtterance) {
    this.spoken.push(u);
    this.speaking = true;
  },
  cancel() {
    const u = this.spoken.at(-1);
    this.speaking = false;
    u?.onerror?.();
  },
  pause() {},
  resume() {},
  addEventListener() {},
  removeEventListener() {},
  finishCurrent() {
    const u = this.spoken.at(-1);
    this.speaking = false;
    u?.onend?.();
  },
};

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const lastRec = () => FakeRecognition.instances.at(-1)!;

beforeEach(() => {
  FakeRecognition.instances = [];
  synth.spoken = [];
  vi.stubGlobal('window', {
    webkitSpeechRecognition: FakeRecognition,
    speechSynthesis: synth,
    SpeechSynthesisUtterance: FakeUtterance,
  });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('navigator', { language: 'en-US', userAgent: 'test' });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makeDeps(reply: string[], overrides: Partial<VoiceEngineDeps> = {}) {
  let release: (r: TurnResultLike) => void = () => {};
  const deps = {
    send: vi.fn(async (_text: string, opts: { onText: (s: string) => void }) => {
      let full = '';
      for (const piece of reply) {
        full += piece;
        opts.onText(full);
      }
      return new Promise<TurnResultLike>((r) => {
        release = r;
      }).then((r) => r ?? { content: full });
    }),
    stop: vi.fn(() => release({ content: '', aborted: true })),
    isBusy: () => false,
    getAutoSpeak: () => true,
    onState: vi.fn(),
    ...overrides,
  };
  return { deps, finish: (r?: TurnResultLike) => release(r ?? { content: reply.join('') }) };
}

describe('voice engine loop', () => {
  it('listens, sends the transcript, speaks sentences, then listens again', async () => {
    const { deps, finish } = makeDeps(['No, 91 is not prime. ', 'It equals 7 times 13.']);
    const engine = createVoiceEngine(deps);
    await engine.start();
    expect(engine.getState().phase).toBe('listening');
    expect(lastRec().started).toBe(true);
    expect(lastRec().continuous).toBe(false);

    lastRec().say('is 91 prime', false);
    expect(engine.getState().interim).toBe('is 91 prime');
    lastRec().say('is 91 prime');
    lastRec().end();
    await tick();

    expect(deps.send).toHaveBeenCalledWith('is 91 prime', expect.objectContaining({ voice: true }));
    expect(engine.getState().assistantText).toBe('No, 91 is not prime. It equals 7 times 13.');
    expect(engine.getState().latencyMs).not.toBeNull();
    // The first sentence was spoken before the reply finished.
    expect(synth.spoken.map((u) => u.text)).toEqual(['No, 91 is not prime.']);
    expect(engine.getState().phase).toBe('speaking');

    finish();
    await tick();
    synth.finishCurrent(); // first sentence ends -> remainder plays
    expect(synth.spoken.map((u) => u.text)).toEqual(['No, 91 is not prime.', 'It equals 7 times 13.']);
    const recsBefore = FakeRecognition.instances.length;
    synth.finishCurrent();
    expect(engine.getState().phase).toBe('listening');
    expect(FakeRecognition.instances.length).toBe(recsBefore + 1);
    engine.dispose();
  });

  it('restarts listening after silence and reports permission errors', async () => {
    const { deps } = makeDeps(['Hi.']);
    const engine = createVoiceEngine(deps);
    await engine.start();
    const first = lastRec();
    await tick(450);
    first.fail('no-speech');
    first.end();
    await tick(60);
    expect(lastRec()).not.toBe(first);
    expect(engine.getState().phase).toBe('listening');
    expect(engine.getState().error).toBeNull();

    lastRec().fail('not-allowed');
    lastRec().end();
    expect(engine.getState().phase).toBe('paused');
    expect(engine.getState().error?.kind).toBe('permission');
    expect(engine.getState().error?.retryable).toBe(true);
    expect(deps.send).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('interrupt cancels speech and the request, then listens', async () => {
    const { deps } = makeDeps(['First sentence here. ', 'Second one']);
    const engine = createVoiceEngine(deps);
    await engine.start();
    engine.submit('tell me something');
    await tick();
    expect(engine.getState().phase).toBe('speaking');
    engine.interrupt();
    expect(deps.stop).toHaveBeenCalled();
    expect(engine.getState().phase).toBe('listening');
    engine.dispose();
  });

  it('mute pauses listening; dispose stops everything', async () => {
    const { deps } = makeDeps(['Ok.']);
    const engine = createVoiceEngine(deps);
    await engine.start();
    const rec = lastRec();
    engine.toggleMute();
    expect(engine.getState()).toMatchObject({ muted: true, phase: 'paused' });
    expect(rec.started).toBe(false);
    engine.toggleMute();
    expect(engine.getState()).toMatchObject({ muted: false, phase: 'listening' });

    engine.submit('question');
    await tick();
    engine.dispose();
    expect(deps.stop).toHaveBeenCalledTimes(1);
    expect(lastRec().started).toBe(false);
  });

  it('does not speak when auto-speak is off', async () => {
    const { deps, finish } = makeDeps(['Quiet reply. Two.'], { getAutoSpeak: () => false });
    const engine = createVoiceEngine(deps);
    await engine.start();
    engine.submit('hello');
    await tick();
    finish();
    await tick();
    expect(synth.spoken).toEqual([]);
    expect(engine.getState().phase).toBe('listening');
    engine.dispose();
  });
});

describe('describeRecognitionError', () => {
  it('maps codes', () => {
    expect(describeRecognitionError('no-speech').kind).toBe('ignore');
    expect(describeRecognitionError('not-allowed').kind).toBe('permission');
    expect(describeRecognitionError('network').kind).toBe('network');
    expect(describeRecognitionError('weird').kind).toBe('generic');
  });
});
