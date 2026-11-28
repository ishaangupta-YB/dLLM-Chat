// Client-side text extraction for attached files. Mercury is text-only, so
// every file is turned into plain text in the browser before it is sent.
//
// The pure helpers at the top (classification, binary sniffing, caps, budget)
// are unit tested in Node. extractFile() needs browser APIs (File, Worker) and
// loads pdf.js / mammoth lazily so neither ships in the main bundle.
import type { Attachment } from '@/lib/types';
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_CHARS_EACH, MAX_ATTACHMENT_CHARS_TOTAL } from './format';

export { MAX_ATTACHMENTS, MAX_ATTACHMENT_CHARS_EACH, MAX_ATTACHMENT_CHARS_TOTAL };

/** Raw file size cap (PDFs can be large while holding little text). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** pdf.js stops after this many pages even if the char cap is not reached. */
export const MAX_PDF_PAGES = 300;

export type FileKind = 'text' | 'pdf' | 'docx' | 'image' | 'media' | 'office' | 'archive' | 'binary';

const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'adoc', 'tex', 'org', 'csv', 'tsv', 'json', 'jsonl', 'ndjson',
  'json5', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'env', 'log', 'out', 'srt', 'vtt',
  'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts',
  'vue', 'svelte', 'astro', 'py', 'pyi', 'ipynb', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'groovy',
  'gradle', 'swift', 'm', 'mm', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'fs', 'php', 'pl', 'pm', 'lua',
  'r', 'jl', 'dart', 'ex', 'exs', 'erl', 'hs', 'elm', 'clj', 'cljs', 'zig', 'nim', 'sol', 'sh', 'bash', 'zsh',
  'fish', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'gql', 'proto', 'prisma', 'tf', 'hcl', 'diff', 'patch',
  'dockerfile', 'makefile', 'cmake', 'gitignore', 'editorconfig', 'lock', 'bib', 'rtf',
]);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'ico', 'svgz']);
const MEDIA_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus', 'mp4', 'mov', 'webm', 'mkv', 'avi']);
const OFFICE_EXTENSIONS = new Set(['doc', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'pages', 'numbers', 'key', 'epub']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'gz', 'tgz', 'tar', 'rar', '7z', 'bz2', 'xz', 'dmg', 'iso']);
const BINARY_EXTENSIONS = new Set(['exe', 'dll', 'so', 'dylib', 'bin', 'class', 'jar', 'wasm', 'o', 'a', 'pyc', 'sqlite', 'db', 'psd', 'ttf', 'otf', 'woff', 'woff2']);

const TEXT_MIMES = /^(text\/|application\/(json|ld\+json|xml|xhtml\+xml|javascript|ecmascript|typescript|x-yaml|yaml|toml|x-sh|x-httpd-php|sql|graphql|x-ndjson|rtf))/i;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Lowercase extension without the dot ("" when none). Dotfiles like ".env" count as extension "env". */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const lower = base.toLowerCase();
  if (lower === 'dockerfile' || lower === 'makefile') return lower;
  const i = lower.lastIndexOf('.');
  return i >= 0 ? lower.slice(i + 1) : '';
}

/** Decide how a file should be read, from its name and MIME type. */
export function classifyFile(name: string, mime: string): FileKind {
  const ext = extensionOf(name);
  const type = (mime || '').toLowerCase();
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || type === DOCX_MIME) return 'docx';
  if (ext === 'svg' || type === 'image/svg+xml') return 'text'; // SVG is XML text
  if (IMAGE_EXTENSIONS.has(ext) || type.startsWith('image/')) return 'image';
  if (MEDIA_EXTENSIONS.has(ext) || type.startsWith('audio/') || type.startsWith('video/')) return 'media';
  if (OFFICE_EXTENSIONS.has(ext)) return 'office';
  if (ARCHIVE_EXTENSIONS.has(ext) || /zip|x-tar|x-7z|x-rar|gzip/.test(type)) return 'archive';
  if (BINARY_EXTENSIONS.has(ext)) return 'binary';
  if (TEXT_EXTENSIONS.has(ext) || TEXT_MIMES.test(type)) return 'text';
  // Unknown: try it as text; the binary sniffer rejects it if needed.
  return 'text';
}

/** User-facing reason a file kind cannot be attached, or null when it can. */
export function unsupportedReason(kind: FileKind, name: string): string | null {
  const ext = extensionOf(name);
  switch (kind) {
    case 'image':
      return 'Images can’t be attached: Mercury 3 is a text-only model. Paste the text or describe the image instead.';
    case 'media':
      return 'Audio and video files can’t be attached: Mercury 3 reads text only.';
    case 'office':
      return ext === 'doc'
        ? 'Old Word .doc files aren’t supported. Save it as .docx or PDF and try again.'
        : `.${ext} files aren’t supported yet. Export as PDF, CSV or plain text and try again.`;
    case 'archive':
      return 'Archives can’t be attached. Unzip and attach the text files you need.';
    case 'binary':
      return 'This looks like a binary file. Only text, code, PDF and DOCX files can be attached.';
    default:
      return null;
  }
}

/**
 * True when a byte sample is probably not text: a NUL byte, or more than 10%
 * control characters (other than tab, newline, carriage return, form feed, ESC).
 */
export function isProbablyBinary(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  // UTF-16 BOMs: technically text, but File.text() would decode them as garbage.
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return true;
  let control = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 32 && b !== 9 && b !== 10 && b !== 13 && b !== 12 && b !== 27) control++;
  }
  return control / bytes.length > 0.1;
}

/** Normalise line endings, strip trailing spaces and runs of blank lines. */
export function normalizeText(text: string): string {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/** Cut text to `max` characters, preferring a line break near the end. */
export function capText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  if (max <= 0) return { text: '', truncated: true };
  let cut = text.slice(0, max);
  const nl = cut.lastIndexOf('\n');
  if (nl > max * 0.9) cut = cut.slice(0, nl);
  return { text: cut.trimEnd(), truncated: true };
}

/**
 * Apply the per-message total budget in order: later files get what is left.
 * Files that end up with no room keep a truncated, empty text.
 */
export function fitToBudget(
  attachments: Attachment[],
  total = MAX_ATTACHMENT_CHARS_TOTAL,
  each = MAX_ATTACHMENT_CHARS_EACH,
): Attachment[] {
  let left = total;
  return attachments.map((a) => {
    const capped = capText(a.text, Math.min(each, Math.max(0, left)));
    left -= capped.text.length;
    const truncated = !!a.truncated || capped.truncated;
    return capped.text === a.text && truncated === !!a.truncated
      ? a
      : { ...a, text: capped.text, truncated: truncated || undefined };
  });
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact character count, e.g. 1.2k chars. */
export function formatChars(n: number): string {
  if (n < 1000) return `${n} chars`;
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k chars`;
}

/** Error with a message that is safe to show to the user. */
export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentError';
  }
}

/** Fast checks before reading the file. Throws AttachmentError. */
export function precheckFile(file: { name: string; type: string; size: number }): FileKind {
  const kind = classifyFile(file.name, file.type);
  const reason = unsupportedReason(kind, file.name);
  if (reason) throw new AttachmentError(reason);
  if (file.size > MAX_FILE_BYTES) {
    throw new AttachmentError(`File is too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  return kind;
}

export interface ExtractResult {
  text: string;
  truncated: boolean;
  /** PDFs: total page count. */
  pages?: number;
}

/* ------------------------------------------------------------ browser only */

async function extractPlain(file: File, max: number): Promise<ExtractResult> {
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (isProbablyBinary(head)) {
    throw new AttachmentError('This file isn’t plain text. Only text, code, PDF and DOCX files can be attached.');
  }
  const text = normalizeText(await file.text());
  if (!text) throw new AttachmentError('The file is empty.');
  return capText(text, max);
}

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    // A same-origin module worker (allowed by CSP worker-src 'self'). Turbopack
    // and webpack both bundle `new Worker(new URL(..., import.meta.url))`.
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf.worker.ts', import.meta.url), {
        type: 'module',
        name: 'pdfjs',
      });
    }
    return pdfjs;
  });
  pdfjsPromise.catch(() => {
    pdfjsPromise = null;
  });
  return pdfjsPromise;
}

async function extractPdf(file: File, max: number): Promise<ExtractResult> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  // pdf.js v6 no longer evaluates code (the isEvalSupported option is gone),
  // so it runs under the production CSP without 'unsafe-eval'.
  const task = pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'PasswordException') throw new AttachmentError('This PDF is password-protected.');
      throw new AttachmentError('This PDF could not be read. It may be damaged.');
    }
    const pages: string[] = [];
    let length = 0;
    const n = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let i = 1; i <= n && length <= max; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let s = '';
      for (const item of content.items) {
        if ('str' in item) s += item.str + (item.hasEOL ? '\n' : '');
      }
      page.cleanup();
      s = normalizeText(s);
      if (s) {
        const block = doc.numPages > 1 ? `[Page ${i}]\n${s}` : s;
        pages.push(block);
        length += block.length + 2;
      }
    }
    const text = pages.join('\n\n');
    if (!text.replace(/\[Page \d+\]/g, '').trim()) {
      throw new AttachmentError('No selectable text found in this PDF (it may be scanned). OCR isn’t supported.');
    }
    const capped = capText(text, max);
    return { ...capped, truncated: capped.truncated || n < doc.numPages, pages: doc.numPages };
  } finally {
    void task.destroy();
  }
}

async function extractDocx(file: File, max: number): Promise<ExtractResult> {
  type Mammoth = typeof import('mammoth');
  // CommonJS module: the namespace may expose it directly or under default.
  const mod = (await import('mammoth')) as unknown as Partial<Mammoth> & { default?: Mammoth };
  const mammoth = (typeof mod.extractRawText === 'function' ? mod : mod.default) as Mammoth;
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }));
  } catch {
    throw new AttachmentError('This Word document could not be read. It may be damaged.');
  }
  const text = normalizeText(value);
  if (!text) throw new AttachmentError('No text found in this document.');
  return capText(text, max);
}

/**
 * Extract text from a File. Throws AttachmentError with a user-facing message
 * for unsupported, empty, binary or unreadable files.
 */
export async function extractFile(file: File, max = MAX_ATTACHMENT_CHARS_EACH): Promise<ExtractResult> {
  const kind = precheckFile(file);
  try {
    if (kind === 'pdf') return await extractPdf(file, max);
    if (kind === 'docx') return await extractDocx(file, max);
    return await extractPlain(file, max);
  } catch (err) {
    if (err instanceof AttachmentError) throw err;
    throw new AttachmentError('This file could not be read.');
  }
}
