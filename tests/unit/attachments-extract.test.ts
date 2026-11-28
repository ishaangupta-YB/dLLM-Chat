import { describe, expect, it } from 'vitest';
import {
  AttachmentError,
  MAX_ATTACHMENT_CHARS_EACH,
  MAX_FILE_BYTES,
  capText,
  classifyFile,
  extensionOf,
  extractFile,
  fitToBudget,
  formatBytes,
  isProbablyBinary,
  normalizeText,
  precheckFile,
  unsupportedReason,
} from '@/lib/attachments/extract';
import { formatWithAttachments } from '@/lib/attachments/format';
import type { Attachment } from '@/lib/types';

const att = (id: string, text: string, extra: Partial<Attachment> = {}): Attachment => ({
  id,
  name: `${id}.txt`,
  mime: 'text/plain',
  size: text.length,
  text,
  ...extra,
});

describe('classifyFile', () => {
  it('detects kinds from extension and MIME type', () => {
    expect(classifyFile('report.PDF', '')).toBe('pdf');
    expect(classifyFile('x', 'application/pdf')).toBe('pdf');
    expect(classifyFile('notes.docx', '')).toBe('docx');
    expect(classifyFile('photo.jpg', 'image/jpeg')).toBe('image');
    expect(classifyFile('pasted', 'image/png')).toBe('image');
    expect(classifyFile('logo.svg', 'image/svg+xml')).toBe('text');
    expect(classifyFile('song.mp3', 'audio/mpeg')).toBe('media');
    expect(classifyFile('old.doc', 'application/msword')).toBe('office');
    expect(classifyFile('sheet.xlsx', '')).toBe('office');
    expect(classifyFile('src.zip', 'application/zip')).toBe('archive');
    expect(classifyFile('app.exe', '')).toBe('binary');
    for (const n of ['a.ts', 'b.py', 'c.csv', 'd.json', 'e.yaml', 'f.log', 'g.md', 'Dockerfile', '.env']) {
      expect(classifyFile(n, '')).toBe('text');
    }
    // Unknown extension: tried as text (the binary sniffer decides).
    expect(classifyFile('data.weird', '')).toBe('text');
  });

  it('extensionOf handles paths, dotfiles and special names', () => {
    expect(extensionOf('dir/sub/file.TSX')).toBe('tsx');
    expect(extensionOf('.gitignore')).toBe('gitignore');
    expect(extensionOf('Makefile')).toBe('makefile');
    expect(extensionOf('README')).toBe('');
  });

  it('explains unsupported kinds; images mention text-only Mercury 3', () => {
    expect(unsupportedReason('image', 'a.png')).toMatch(/Mercury 3 is a text-only model/);
    expect(unsupportedReason('office', 'a.doc')).toMatch(/\.docx/);
    expect(unsupportedReason('office', 'a.xlsx')).toMatch(/\.xlsx/);
    expect(unsupportedReason('text', 'a.txt')).toBeNull();
    expect(unsupportedReason('pdf', 'a.pdf')).toBeNull();
  });
});

describe('precheckFile', () => {
  it('rejects images and oversize files with AttachmentError', () => {
    expect(() => precheckFile({ name: 'a.png', type: 'image/png', size: 10 })).toThrow(AttachmentError);
    expect(() => precheckFile({ name: 'a.txt', type: 'text/plain', size: MAX_FILE_BYTES + 1 })).toThrow(/too large/);
    expect(precheckFile({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBe('pdf');
  });
});

describe('isProbablyBinary', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('accepts text, including UTF-8 and tabs', () => {
    expect(isProbablyBinary(enc('hello\tworld\r\nnaïve café 日本語\n'))).toBe(false);
    expect(isProbablyBinary(new Uint8Array())).toBe(false);
  });
  it('rejects NUL bytes, many control chars and UTF-16 BOMs', () => {
    expect(isProbablyBinary(new Uint8Array([0x41, 0x00, 0x42]))).toBe(true);
    expect(isProbablyBinary(new Uint8Array(Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? 1 : 65))))).toBe(true);
    expect(isProbablyBinary(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe(true);
  });
});

describe('text helpers', () => {
  it('normalizeText strips BOM, CRLF, trailing spaces and blank runs', () => {
    expect(normalizeText('﻿a  \r\nb\r\n\n\n\n\n\nc  ')).toBe('a\nb\n\n\nc');
  });

  it('capText keeps short text and cuts long text at a line break', () => {
    expect(capText('abc', 10)).toEqual({ text: 'abc', truncated: false });
    const long = 'line one\n'.repeat(20); // 180 chars
    const r = capText(long, 100);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(100);
    expect(r.text.endsWith('line one')).toBe(true);
    expect(capText('abc', 0)).toEqual({ text: '', truncated: true });
  });

  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(200 * 1024)).toBe('200 KB');
    expect(formatBytes(3.25 * 1024 * 1024)).toBe('3.3 MB');
  });
});

describe('fitToBudget', () => {
  it('leaves attachments that fit untouched (same objects)', () => {
    const list = [att('a', 'x'.repeat(10)), att('b', 'y'.repeat(10))];
    const out = fitToBudget(list, 100, 50);
    expect(out[0]).toBe(list[0]);
    expect(out[1]).toBe(list[1]);
  });

  it('applies per-file and total caps in order and flags truncation', () => {
    const list = [att('a', 'a'.repeat(60)), att('b', 'b'.repeat(60)), att('c', 'c'.repeat(10))];
    const out = fitToBudget(list, 100, 50);
    expect(out[0].text.length).toBe(50);
    expect(out[0].truncated).toBe(true);
    expect(out[1].text.length).toBe(50);
    expect(out[2].text).toBe('');
    expect(out[2].truncated).toBe(true);
    expect(out.reduce((n, a) => n + a.text.length, 0)).toBeLessThanOrEqual(100);
  });

  it('keeps an existing truncated flag', () => {
    const out = fitToBudget([att('a', 'abc', { truncated: true })], 100, 50);
    expect(out[0].truncated).toBe(true);
  });

  it('the formatted message marks truncated files', () => {
    const msg = formatWithAttachments('Summarize', fitToBudget([att('a', 'z'.repeat(80))], 100, 50));
    expect(msg).toContain('Attached file: a.txt (truncated)');
  });
});

describe('extractFile (plain text path, Node File)', () => {
  it('reads text files and caps them', async () => {
    const r = await extractFile(new File(['hello\r\nworld'], 'a.txt', { type: 'text/plain' }));
    expect(r).toEqual({ text: 'hello\nworld', truncated: false });
    const big = await extractFile(new File(['x'.repeat(MAX_ATTACHMENT_CHARS_EACH + 500)], 'b.log'));
    expect(big.truncated).toBe(true);
    expect(big.text.length).toBe(MAX_ATTACHMENT_CHARS_EACH);
  });

  it('rejects binary content, empty files and images with clear messages', async () => {
    await expect(extractFile(new File([new Uint8Array([0, 1, 2, 3])], 'x.txt'))).rejects.toThrow(/isn’t plain text/);
    await expect(extractFile(new File(['   \n '], 'e.txt'))).rejects.toThrow(/empty/);
    await expect(extractFile(new File(['png'], 'p.png', { type: 'image/png' }))).rejects.toThrow(/text-only/);
  });
});
