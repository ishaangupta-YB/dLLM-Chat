import { describe, expect, it } from 'vitest';
import {
  createSentenceChunker,
  findSentenceEnd,
  removeCodeFences,
  stripMarkdown,
} from '@/lib/voice/sentence-chunker';

/** Feed text in small pieces, like a token stream, and collect everything. */
function streamAll(text: string, step = 3): string[] {
  const c = createSentenceChunker();
  const out: string[] = [];
  for (let i = step; i < text.length + step; i += step) out.push(...c.push(text.slice(0, i)));
  out.push(...c.flush());
  return out;
}

describe('findSentenceEnd', () => {
  it('needs whitespace after the terminator', () => {
    expect(findSentenceEnd('Hello there.')).toBe(-1);
    expect(findSentenceEnd('Hello there. Next')).toBe(12);
  });
  it('does not split decimals or abbreviations', () => {
    expect(findSentenceEnd('Pi is 3.14 roughly')).toBe(-1);
    expect(findSentenceEnd('Use e.g. apples ')).toBe(-1);
    expect(findSentenceEnd('Ask Dr. Smith now')).toBe(-1);
    expect(findSentenceEnd('Mr. and Mrs. Jones ')).toBe(-1);
  });
  it('splits on newlines', () => {
    expect(findSentenceEnd('First line\nSecond')).toBe(11);
    expect(findSentenceEnd('\n\nText')).toBe(-1);
  });
  it('keeps closing quotes with the sentence', () => {
    expect(findSentenceEnd('He said "hi." Then')).toBe(13);
  });
});

describe('createSentenceChunker', () => {
  it('emits sentences as soon as they complete', () => {
    const c = createSentenceChunker();
    expect(c.push('No, 91 is not')).toEqual([]);
    expect(c.push('No, 91 is not prime.')).toEqual([]);
    expect(c.push('No, 91 is not prime. It equals')).toEqual(['No, 91 is not prime.']);
    expect(c.push('No, 91 is not prime. It equals 7 times 13.')).toEqual([]);
    expect(c.flush()).toEqual(['It equals 7 times 13.']);
    expect(c.flush()).toEqual([]);
  });

  it('handles streamed text with tricky punctuation', () => {
    const text =
      'Pi is about 3.14159. Dr. Who says hi! Really?! Use e.g. a fork. Visit example.com today.\nNew line here';
    expect(streamAll(text)).toEqual([
      'Pi is about 3.14159.',
      'Dr. Who says hi!',
      'Really?!',
      'Use e.g. a fork.',
      'Visit example.com today.',
      'New line here',
    ]);
  });

  it('treats etc. as a sentence end before a capital', () => {
    expect(streamAll('Apples, pears, etc. Then more. Also etc. and so on.')).toEqual([
      'Apples, pears, etc.',
      'Then more.',
      'Also etc. and so on.',
    ]);
  });

  it('strips markdown and skips code blocks', () => {
    const text =
      '# Title\n\nHere is **bold** and a [link](https://x.y).\n\n```python\nprint("x. y. z.")\n```\n\n- first item\n- second item\n1. numbered one\n2. numbered two';
    expect(streamAll(text, 2)).toEqual([
      'Title',
      'Here is bold and a link.',
      'first item',
      'second item',
      'numbered one',
      'numbered two',
    ]);
  });

  it('drops an unclosed code fence at the end', () => {
    expect(streamAll('Sure. Here:\n```js\nconst a = 1;')).toEqual(['Sure.', 'Here:']);
  });

  it('skips punctuation-only chunks and resets', () => {
    const c = createSentenceChunker();
    expect(c.push('--- \n...\nOk then. ')).toEqual(['Ok then.']);
    c.reset();
    expect(c.push('Fresh start. ')).toEqual(['Fresh start.']);
  });

  it('handles initials', () => {
    expect(streamAll('J. R. R. Tolkien wrote it. Yes.')).toEqual(['J. R. R. Tolkien wrote it.', 'Yes.']);
  });
});

describe('stripMarkdown', () => {
  it('removes formatting symbols', () => {
    expect(stripMarkdown('**18°C** and _sunny_ with `code` ~~old~~')).toBe('18°C and sunny with code old');
    expect(stripMarkdown('> quoted\n### Heading')).toBe('quoted Heading');
    expect(stripMarkdown('![alt text](a.png)')).toBe('alt text');
    expect(stripMarkdown('snake_case_name stays')).toBe('snake_case_name stays');
    expect(stripMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a, b 1, 2');
  });
  it('removes closed fences', () => {
    expect(removeCodeFences('a\n```\nx\n```\nb')).toBe('a\n\nb');
    expect(removeCodeFences('a\n~~~ts\nx')).toBe('a\n');
  });
});
