import { describe, expect, it } from 'vitest';
import {
  FIM_MAX_DOC_CHARS,
  backoffMs,
  consumeTyped,
  fimErrorLabel,
  fimMode,
  fimSkipReason,
  lineInfo,
  maxTokensFor,
  nextWordChunk,
  planFimRequest,
  postProcessSuggestion,
} from '@/lib/editor/fim-logic';

const gate = {
  enabled: true,
  focused: true,
  selectionEmpty: true,
  docLength: 10,
  charAfter: '',
  backoffUntil: 0,
  now: 1000,
};

describe('fimSkipReason', () => {
  it('allows a normal request', () => expect(fimSkipReason(gate)).toBeNull());
  it('skips when disabled / unfocused / selection / composing', () => {
    expect(fimSkipReason({ ...gate, enabled: false })).toBe('disabled');
    expect(fimSkipReason({ ...gate, focused: false })).toBe('unfocused');
    expect(fimSkipReason({ ...gate, selectionEmpty: false })).toBe('selection');
    expect(fimSkipReason({ ...gate, composing: true })).toBe('composing');
  });
  it('skips huge documents', () => {
    expect(fimSkipReason({ ...gate, docLength: FIM_MAX_DOC_CHARS + 1 })).toBe('too-large');
  });
  it('skips during back-off', () => {
    expect(fimSkipReason({ ...gate, backoffUntil: 2000 })).toBe('backoff');
  });
  it('skips mid-word but not before punctuation or whitespace', () => {
    expect(fimSkipReason({ ...gate, charAfter: 'a' })).toBe('mid-word');
    expect(fimSkipReason({ ...gate, charAfter: '_' })).toBe('mid-word');
    expect(fimSkipReason({ ...gate, charAfter: ')' })).toBeNull();
    expect(fimSkipReason({ ...gate, charAfter: ' ' })).toBeNull();
    expect(fimSkipReason({ ...gate, charAfter: '\n' })).toBeNull();
  });
});

describe('lineInfo / fimMode / maxTokens', () => {
  it('splits the cursor line', () => {
    const doc = 'a\nfoo(bar)\nz';
    const pos = doc.indexOf('bar');
    expect(lineInfo({ doc, pos })).toEqual({ before: 'foo(', after: 'bar)', lineCount: 3 });
  });
  it('picks inline when text follows the cursor', () => {
    expect(fimMode({ before: 'print(', after: ')', lineCount: 5 })).toBe('inline');
  });
  it('picks inline for single-line documents', () => {
    expect(fimMode({ before: 'const x = ', after: '', lineCount: 1 })).toBe('inline');
  });
  it('picks block on a blank line and line at the end of content', () => {
    expect(fimMode({ before: '    ', after: '', lineCount: 4 })).toBe('block');
    expect(fimMode({ before: '    return ', after: '  ', lineCount: 4 })).toBe('line');
  });
  it('maps token budgets', () => {
    expect(maxTokensFor('inline')).toBe(64);
    expect(maxTokensFor('line')).toBeGreaterThanOrEqual(128);
    expect(maxTokensFor('block')).toBeGreaterThanOrEqual(128);
    expect(maxTokensFor('block')).toBeLessThanOrEqual(192);
  });
  it('plans prompt and suffix around the cursor', () => {
    const doc = 'def f(x):\n    return \n\nprint(f(2))\n';
    const pos = doc.indexOf('return ') + 7;
    const plan = planFimRequest({ doc, pos });
    expect(plan.prompt).toBe('def f(x):\n    return ');
    expect(plan.suffix).toBe('\n\nprint(f(2))\n');
    expect(plan.mode).toBe('line');
    expect(plan.maxTokens).toBe(128);
  });
  it('trims long context', () => {
    const doc = 'x'.repeat(40_000) + 'y'.repeat(40_000);
    const plan = planFimRequest({ doc, pos: 40_000 });
    expect(plan.prompt.length).toBeLessThan(40_000);
    expect(plan.suffix.length).toBeLessThan(40_000);
    expect(plan.prompt.endsWith('x')).toBe(true);
    expect(plan.suffix.startsWith('y')).toBe(true);
  });
});

describe('postProcessSuggestion', () => {
  const block = { suffix: '\n', lineAfter: '', mode: 'block' as const };
  it('skips empty and whitespace-only suggestions', () => {
    expect(postProcessSuggestion('', block)).toBeNull();
    expect(postProcessSuggestion('  \n\n ', block)).toBeNull();
  });
  it('trims trailing whitespace-only lines', () => {
    expect(postProcessSuggestion('return x\n\n   \n', block)).toBe('return x');
  });
  it('keeps only the first line in inline mode', () => {
    expect(
      postProcessSuggestion('"hello"\nprint(2)', { suffix: ')\n', lineAfter: ')', mode: 'inline' }),
    ).toBe('"hello"');
  });
  it('strips a tail that duplicates the rest of the line', () => {
    expect(postProcessSuggestion('"hello")', { suffix: ')\nx', lineAfter: ')', mode: 'inline' })).toBe('"hello"');
    expect(postProcessSuggestion('a, b])', { suffix: '])', lineAfter: '])', mode: 'inline' })).toBe('a, b');
    expect(postProcessSuggestion('foo())', { suffix: ');', lineAfter: ');', mode: 'inline' })).toBe('foo()');
  });
  it('drops suggestions that only repeat the text after the cursor', () => {
    expect(postProcessSuggestion(')', { suffix: ')\n', lineAfter: ')', mode: 'inline' })).toBeNull();
    expect(postProcessSuggestion(') + 1', { suffix: ')\n', lineAfter: ')', mode: 'inline' })).toBeNull();
    expect(postProcessSuggestion('    return 1', { suffix: '\n    return 1\n', lineAfter: '', mode: 'block' })).toBeNull();
  });
  it('drops a trailing repeat of the next existing line in block mode', () => {
    expect(
      postProcessSuggestion('    total += x\n    return total', {
        suffix: '\n    return total\n',
        lineAfter: '',
        mode: 'block',
      }),
    ).toBe('    total += x');
  });
  it('normalises CRLF', () => {
    expect(postProcessSuggestion('a\r\nb', block)).toBe('a\nb');
  });
});

describe('nextWordChunk / consumeTyped', () => {
  it('takes whitespace plus one word', () => {
    expect(nextWordChunk(' foo bar')).toBe(' foo');
    expect(nextWordChunk('foo(bar)')).toBe('foo');
    expect(nextWordChunk('(bar)')).toBe('(');
    expect(nextWordChunk('\n    return x')).toBe('\n    return');
    expect(nextWordChunk('')).toBe('');
    expect(nextWordChunk('   ')).toBe('   ');
  });
  it('consumes a typed prefix', () => {
    expect(consumeTyped('hello', 'he')).toBe('llo');
    expect(consumeTyped('hello', 'hello')).toBe('');
    expect(consumeTyped('hello', 'x')).toBeNull();
    expect(consumeTyped('hello', '')).toBeNull();
  });
});

describe('backoff', () => {
  it('backs off longer for rate limits and grows with repeated errors', () => {
    expect(backoffMs({ status: 429 }, 1)).toBe(8000);
    expect(backoffMs({ status: 500 }, 1)).toBe(4000);
    expect(backoffMs({ status: 500 }, 2)).toBe(8000);
    expect(backoffMs({ status: 400 }, 1)).toBe(3000);
    expect(backoffMs({ status: 429 }, 10)).toBe(60_000);
  });
  it('honours retry-after', () => {
    expect(backoffMs({ status: 429, retryAfterMs: 2000 }, 3)).toBe(2000);
  });
  it('labels errors', () => {
    expect(fimErrorLabel({ status: 429 })).toBe('Rate limited');
    expect(fimErrorLabel({ status: 0 })).toBe('Offline');
    expect(fimErrorLabel({ status: 502 })).toBe('Service unavailable');
  });
});
