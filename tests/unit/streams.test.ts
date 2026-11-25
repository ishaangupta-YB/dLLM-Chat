import { describe, expect, it, vi } from 'vitest';
import { createSseParser } from '@/lib/sse';
import { createNdjsonDecoder, encodeEvent } from '@/lib/chat/protocol';
import { createFramePlayer } from '@/lib/chat/frame-player';

describe('createSseParser', () => {
  it('reassembles events split across chunks and CRLF', () => {
    const got: string[] = [];
    const p = createSseParser((d) => got.push(d));
    p.push('data: {"a":');
    p.push('1}\r\n\r\ndata: [DO');
    p.push('NE]\n\n: keepalive\n\n');
    p.end();
    expect(got).toEqual(['{"a":1}', '[DONE]']);
  });

  it('flushes a trailing event without blank line', () => {
    const got: string[] = [];
    const p = createSseParser((d) => got.push(d));
    p.push('data: x');
    p.end();
    expect(got).toEqual(['x']);
  });
});

describe('ndjson', () => {
  it('decodes split lines', () => {
    const got: unknown[] = [];
    const d = createNdjsonDecoder((e) => got.push(e));
    const s = encodeEvent({ t: 'text', v: 'hi\nthere' }) + encodeEvent({ t: 'finish', reason: 'stop' });
    d.push(s.slice(0, 7));
    d.push(s.slice(7));
    d.end();
    expect(got).toEqual([{ t: 'text', v: 'hi\nthere' }, { t: 'finish', reason: 'stop' }]);
  });
});

describe('createFramePlayer', () => {
  it('plays queued frames in order and ends on the final frame', async () => {
    vi.useFakeTimers();
    const shown: [string, boolean][] = [];
    const p = createFramePlayer({ onFrame: (t, f) => shown.push([t, f]), frameMs: 10 });
    p.push('n1', 0);
    p.push('n2', 0);
    p.push('clean', 1);
    p.push('late-noise', 0); // arrives after final, must not win
    p.end();
    await vi.runAllTimersAsync();
    await p.done;
    expect(shown.at(-1)).toEqual(['clean', true]);
    expect(shown.map((s) => s[0])).toEqual(['n1', 'n2', 'late-noise', 'clean']);
    vi.useRealTimers();
  });

  it('flush jumps straight to final', () => {
    const shown: string[] = [];
    const p = createFramePlayer({ onFrame: (t) => shown.push(t) });
    p.push('a', 0);
    p.push('b', 0);
    p.flush();
    expect(shown).toEqual(['b']);
  });
});
