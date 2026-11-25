import { describe, expect, it } from 'vitest';
import { pickVoice, scoreVoice, type VoiceLike } from '@/lib/voice/tts';

const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({
  name,
  lang,
  localService: true,
  default: false,
  ...extra,
});

describe('pickVoice', () => {
  it('prefers natural/neural voices in the exact language', () => {
    const voices = [
      v('Fred', 'en-US'),
      v('Google US English', 'en-US', { localService: false }),
      v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', { localService: false }),
      v('Google UK English Female', 'en-GB'),
    ];
    expect(pickVoice(voices, 'en-US')?.name).toContain('Aria');
  });

  it('falls back to Google voices, then same base language', () => {
    expect(pickVoice([v('Alex', 'en-US'), v('Google US English', 'en-US')], 'en-US')?.name).toBe('Google US English');
    expect(pickVoice([v('Thomas', 'fr-FR'), v('Daniel', 'en-GB')], 'en-US')?.name).toBe('Daniel');
  });

  it('avoids novelty voices and handles other languages', () => {
    expect(pickVoice([v('Zarvox', 'en-US'), v('Samantha', 'en-US')], 'en-US')?.name).toBe('Samantha');
    expect(pickVoice([v('Google Deutsch', 'de-DE'), v('Samantha', 'en-US')], 'de-DE')?.name).toBe('Google Deutsch');
    // Accepts underscore language tags (Android).
    expect(scoreVoice(v('x', 'en_US'), 'en-US')).toBeGreaterThan(30);
  });

  it('returns null when nothing usable exists', () => {
    expect(pickVoice([], 'en-US')).toBeNull();
    expect(pickVoice([v('Kyoko', 'ja-JP')], 'en-US')).toBeNull();
  });
});
