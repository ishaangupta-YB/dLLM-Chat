import { describe, expect, it, vi } from 'vitest';
import { applySearchReplace, CODE_LIMITS, sanitizeFiles, sortPaths, validateContent, validatePath } from '@/lib/code-agent/files';
import { createZip, crc32 } from '@/lib/code-agent/zip';

vi.mock('server-only', () => ({}));

describe('validatePath', () => {
  it.each(['index.html', 'styles.css', 'js/app.js', 'data/items.json', 'README.md', 'img/logo.svg', 'notes.txt', 'a-b_c.v2.js'])(
    'accepts %s',
    (p) => {
      expect(validatePath(p)).toEqual({ ok: true, path: p });
    },
  );

  it('normalises a leading ./', () => {
    expect(validatePath('./index.html')).toEqual({ ok: true, path: 'index.html' });
  });

  it.each([
    ['../secret.html', 'traversal'],
    ['a/../../b.js', 'nested traversal'],
    ['/etc/passwd.txt', 'absolute'],
    ['C:/x.js', 'drive'],
    ['https://x.com/a.js', 'url'],
    ['a\\b.js', 'backslash'],
    ['.env.txt', 'hidden file'],
    ['a/.git/config.txt', 'hidden dir'],
    ['app.ts', 'extension'],
    ['image.png', 'binary'],
    ['Makefile', 'no extension'],
    ['a//b.js', 'empty segment'],
    ['', 'empty'],
    ['a b.js', 'space'],
    ['x'.repeat(130) + '.js', 'too long'],
  ])('rejects %s (%s)', (p) => {
    expect(validatePath(p).ok).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(validatePath(42).ok).toBe(false);
    expect(validatePath(undefined).ok).toBe(false);
  });
});

describe('validateContent', () => {
  it('enforces the per-file size limit in UTF-8 bytes', () => {
    expect(validateContent('a'.repeat(CODE_LIMITS.maxFileBytes)).ok).toBe(true);
    expect(validateContent('a'.repeat(CODE_LIMITS.maxFileBytes + 1)).ok).toBe(false);
    // 3-byte characters
    expect(validateContent('€'.repeat(Math.floor(CODE_LIMITS.maxFileBytes / 3) + 1)).ok).toBe(false);
    expect(validateContent(1).ok).toBe(false);
  });
});

describe('applySearchReplace', () => {
  it('replaces a unique match', () => {
    expect(applySearchReplace('a\nb\nc', 'b', 'B')).toEqual({ ok: true, content: 'a\nB\nc' });
  });
  it('fails when not found', () => {
    const r = applySearchReplace('abc', 'x', 'y');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/);
  });
  it('fails when ambiguous', () => {
    const r = applySearchReplace('<li></li><li></li>', '<li></li>', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/more than once/);
  });
  it('fails on empty search', () => {
    expect(applySearchReplace('abc', '', 'x').ok).toBe(false);
  });
  it('treats $ patterns literally', () => {
    expect(applySearchReplace('price', 'price', '$& $1 $$')).toEqual({ ok: true, content: '$& $1 $$' });
  });
});

describe('sortPaths / sanitizeFiles', () => {
  it('puts index.html first, then shallow paths', () => {
    expect(sortPaths(['b/x.js', 'styles.css', 'index.html', 'app.js'])).toEqual(['index.html', 'app.js', 'styles.css', 'b/x.js']);
  });
  it('drops invalid entries and caps the count', () => {
    const files: Record<string, unknown> = { 'index.html': 'x', '../a.js': 'y', 'b.png': 'z', 'c.js': 3 };
    for (let i = 0; i < 40; i++) files[`f${i}.js`] = '';
    const out = sanitizeFiles(files);
    expect(out['index.html']).toBe('x');
    expect(out['../a.js']).toBeUndefined();
    expect(out['c.js']).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(CODE_LIMITS.maxFiles);
  });
});

describe('createZip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('writes local headers, central directory and end record', () => {
    const zip = createZip({ 'index.html': '<h1>Hi</h1>', 'js/app.js': 'console.log(1)' }, new Date(2026, 0, 2, 3, 4, 6));
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 10, true)).toBe(2);
    const cdOffset = dv.getUint32(end + 16, true);
    expect(dv.getUint32(cdOffset, true)).toBe(0x02014b50);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain('index.html');
    expect(text).toContain('<h1>Hi</h1>');
  });
});
