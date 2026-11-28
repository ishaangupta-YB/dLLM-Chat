// ElevenLabs voice engine (BYOK) with api.elevenlabs.io mocked via page.route.
// The microphone is a synthetic stream: a tone for ~700 ms, then silence, so
// MediaRecorder records a real clip and the silence detector ends the turn.
import { expect, test, type Page } from '@playwright/test';
import { activeConversation, buildState, installStreamStub, openApp, queueChat, textReply } from './fixtures';

/** 0.15 s of silent 8 kHz mono WAV. */
function silentWav(): Buffer {
  const samples = 1200;
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

async function fakeMicAndSpeech(page: Page) {
  await page.addInitScript(() => {
    // Browser-voice fallback needs a recognizer; this one never hears anything.
    class FakeRecognition extends EventTarget {
      continuous = false;
      interimResults = false;
      lang = '';
      maxAlternatives = 1;
      onresult = null;
      onerror = null;
      onend: (() => void) | null = null;
      onstart = null;
      start() {}
      stop() {
        setTimeout(() => this.onend?.(), 0);
      }
      abort() {}
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
    const md = navigator.mediaDevices;
    md.getUserMedia = async () => {
      const ctx = new AudioContext();
      await ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      osc.frequency.value = 220;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      // "Speak" for 700 ms each time a new turn starts listening.
      (window as unknown as { __speak: () => void }).__speak = () => {
        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime + 0.7);
      };
      return dest.stream;
    };
  });
}

/** App state with extra settings the shared fixture type doesn't list (voiceEngine). */
function stateWith(settings: Record<string, unknown>) {
  const st = buildState({});
  Object.assign(st.state.settings, settings);
  return st;
}

async function seedKey(page: Page, key: string) {
  await page.addInitScript((k) => {
    localStorage.setItem('dllm-chat:keys', JSON.stringify({ state: { keys: { elevenlabs: k } }, version: 1 }));
  }, key);
}

test.describe('ElevenLabs voice engine (mocked API)', () => {
  test('records a turn, transcribes with scribe_v2, speaks sentences with flash TTS', async ({ page }) => {
    const stt: { key: string | null; model: string | null }[] = [];
    const tts: { text: string; model: string; key: string | null }[] = [];
    await page.route('https://api.elevenlabs.io/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.endsWith('/v1/speech-to-text')) {
        const body = req.postDataBuffer()?.toString('latin1') ?? '';
        stt.push({ key: req.headers()['xi-api-key'] ?? null, model: /name="model_id"\r\n\r\n([^\r]+)/.exec(body)?.[1] ?? null });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'what is two plus two' }), headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      if (url.includes('/v1/text-to-speech/')) {
        const json = req.postDataJSON() as { text: string; model_id: string };
        tts.push({ text: json.text, model: json.model_id, key: req.headers()['xi-api-key'] ?? null });
        return route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(), headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    await fakeMicAndSpeech(page);
    await seedKey(page, 'sk_test_key');
    await installStreamStub(page);
    await openApp(page, stateWith({ voiceEngine: 'elevenlabs', voiceAutoSpeak: true }));
    await queueChat(page, textReply('Two plus two is four. Anything else?', { delay: 10 }));

    await page.getByTestId('voice-mode-button').click();
    const overlay = page.getByTestId('voice-overlay');
    await expect(overlay.getByTestId('voice-engine-label')).toHaveText('Mercury 3 · ElevenLabs');
    await expect(overlay).toHaveAttribute('data-phase', 'listening');
    await page.evaluate(() => (window as unknown as { __speak: () => void }).__speak());

    await expect(overlay).toContainText('Two plus two is four.', { timeout: 20_000 });
    expect(stt[0]).toEqual({ key: 'sk_test_key', model: 'scribe_v2' });
    await expect.poll(() => tts.map((t) => t.text)).toEqual(['Two plus two is four.', 'Anything else?']);
    expect(tts.every((t) => t.model === 'eleven_flash_v2_5' && t.key === 'sk_test_key')).toBe(true);
    // After speaking, it listens again (barge-in/stop like the browser engine).
    await expect(overlay).toHaveAttribute('data-phase', 'listening', { timeout: 20_000 });
    await page.keyboard.press('Escape');

    const conv = await activeConversation(page);
    expect(conv!.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'what is two plus two'],
      ['assistant', 'Two plus two is four. Anything else?'],
    ]);
  });

  test('a rejected key (401) falls back to browser voice with a notice', async ({ page }) => {
    await page.route('https://api.elevenlabs.io/**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"invalid"}', headers: { 'Access-Control-Allow-Origin': '*' } }),
    );
    await fakeMicAndSpeech(page);
    await seedKey(page, 'sk_bad');
    await openApp(page, stateWith({ voiceEngine: 'elevenlabs' }));
    await page.getByTestId('voice-mode-button').click();
    const overlay = page.getByTestId('voice-overlay');
    await expect(overlay.getByTestId('voice-engine-label')).toHaveText('Mercury 3 · ElevenLabs');
    await expect(overlay).toHaveAttribute('data-phase', 'listening');
    await page.evaluate(() => (window as unknown as { __speak: () => void }).__speak());
    await expect(overlay.getByTestId('voice-notice')).toContainText('rejected', { timeout: 15_000 });
    await expect(overlay.getByTestId('voice-engine-label')).toHaveText('Mercury 3 · browser voice');
    await expect(overlay).toHaveAttribute('data-phase', 'listening');
  });

  test('without a key, ElevenLabs falls back to browser voice', async ({ page }) => {
    await fakeMicAndSpeech(page);
    await openApp(page, stateWith({ voiceEngine: 'elevenlabs' }));
    await page.getByTestId('voice-mode-button').click();
    const overlay = page.getByTestId('voice-overlay');
    await expect(overlay.getByTestId('voice-engine-label')).toHaveText('Mercury 3 · browser voice');
    await expect(overlay.getByTestId('voice-notice')).toContainText('Add an ElevenLabs API key');
  });
});
