import { describe, expect, it } from 'vitest';
import { countCodeBlocks, parseSegments, replaceCodeBlock } from '@/lib/chat/segments';

describe('parseSegments', () => {
  it('splits prose and code', () => {
    const md = 'Intro\n\n```python\nprint(1)\n```\n\nOutro';
    const s = parseSegments(md);
    expect(s).toEqual([
      { type: 'markdown', text: 'Intro\n\n' },
      { type: 'code', index: 0, language: 'python', code: 'print(1)', closed: true },
      { type: 'markdown', text: '\nOutro' },
    ]);
  });

  it('marks an unclosed fence while streaming', () => {
    const s = parseSegments('Here:\n```ts\nconst a = 1;\nconst b');
    expect(s[1]).toMatchObject({ type: 'code', closed: false, code: 'const a = 1;\nconst b', language: 'ts' });
  });

  it('handles empty code blocks and tildes', () => {
    const s = parseSegments('~~~\n~~~\n```js\n```');
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ code: '', closed: true, language: '' });
    expect(s[1]).toMatchObject({ code: '', closed: true, language: 'js', index: 1 });
  });

  it('does not close a 4-backtick fence with 3 backticks', () => {
    const md = '````md\n```js\nx\n```\n````';
    const s = parseSegments(md);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ code: '```js\nx\n```', language: 'md' });
  });

  it('handles CRLF-free content with info strings', () => {
    const s = parseSegments('```python title="a.py"\nx=1\n```');
    expect(s[0]).toMatchObject({ language: 'python', code: 'x=1' });
  });
});

describe('replaceCodeBlock', () => {
  const md = 'A\n```python\nprint(1)\n```\nB\n```js\nx()\n```\n';

  it('replaces only the targeted block', () => {
    const out = replaceCodeBlock(md, 1, 'y()');
    expect(out).toBe('A\n```python\nprint(1)\n```\nB\n```js\ny()\n```\n');
    expect(parseSegments(out).filter((x) => x.type === 'code')).toHaveLength(2);
  });

  it('round-trips multi-line edits', () => {
    const out = replaceCodeBlock(md, 0, 'def f():\n    return 2\n');
    const code = parseSegments(out).find((x) => x.type === 'code' && x.index === 0);
    expect(code).toMatchObject({ code: 'def f():\n    return 2' });
    expect(out.endsWith('```js\nx()\n```\n')).toBe(true);
  });

  it('lengthens the fence when code contains backticks', () => {
    const out = replaceCodeBlock(md, 0, 'echo "```"');
    expect(out).toContain('````python\necho "```"\n````');
    expect(countCodeBlocks(out)).toBe(2);
    const code = parseSegments(out).find((x) => x.type === 'code' && x.index === 0);
    expect(code).toMatchObject({ code: 'echo "```"' });
  });

  it('is a no-op for a missing index', () => {
    expect(replaceCodeBlock(md, 5, 'z')).toBe(md);
  });

  it('works when the block is at the very end without newline', () => {
    const out = replaceCodeBlock('```\na\n```', 0, 'b');
    expect(out).toBe('```\nb\n```');
  });
});
