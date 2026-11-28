// Pure helpers for coding-agent projects, shared by the server tools, the
// client controller and the preview. No DOM or Node APIs.

export const CODE_LIMITS = {
  maxFiles: 30,
  maxFileBytes: 300 * 1024,
  maxPathLength: 120,
} as const;

export const ENTRY_FILE = 'index.html';

export const ALLOWED_EXTENSIONS = ['html', 'css', 'js', 'json', 'md', 'svg', 'txt'] as const;

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** UTF-8 byte length without TextEncoder allocations for ASCII-heavy input. */
export function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export type PathCheck = { ok: true; path: string } | { ok: false; error: string };

/**
 * Validates and normalises a project path: relative, forward slashes, no `..`,
 * no hidden segments, allowed extension. A leading "./" is stripped.
 */
export function validatePath(raw: unknown): PathCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'Path must be a string.' };
  let p = raw.trim();
  while (p.startsWith('./')) p = p.slice(2);
  if (!p) return { ok: false, error: 'Path is empty.' };
  if (p.length > CODE_LIMITS.maxPathLength) return { ok: false, error: `Path is longer than ${CODE_LIMITS.maxPathLength} characters.` };
  if (p.includes('\\')) return { ok: false, error: 'Use forward slashes in paths.' };
  if (p.startsWith('/') || /^[a-z]+:/i.test(p)) return { ok: false, error: 'Path must be relative (e.g. index.html).' };
  const segments = p.split('/');
  for (const s of segments) {
    if (s === '..' || s === '.') return { ok: false, error: 'Path must not contain "." or ".." segments.' };
    if (!SEGMENT.test(s)) return { ok: false, error: `Invalid path segment "${s}". Use letters, digits, ".", "_" and "-".` };
  }
  const ext = p.slice(p.lastIndexOf('.') + 1).toLowerCase();
  if (!p.includes('.') || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.map((e) => '.' + e).join(', ')}.` };
  }
  return { ok: true, path: p };
}

export type ContentCheck = { ok: true } | { ok: false; error: string };

export function validateContent(content: unknown): ContentCheck {
  if (typeof content !== 'string') return { ok: false, error: 'Content must be a string.' };
  if (byteLength(content) > CODE_LIMITS.maxFileBytes) {
    return { ok: false, error: `File is larger than ${CODE_LIMITS.maxFileBytes / 1024} KB.` };
  }
  return { ok: true };
}

export type EditResult = { ok: true; content: string } | { ok: false; error: string };

/** Replace exactly one occurrence of `search` with `replace`. */
export function applySearchReplace(source: string, search: string, replace: string): EditResult {
  if (!search) return { ok: false, error: 'search must not be empty.' };
  const first = source.indexOf(search);
  if (first === -1) {
    return {
      ok: false,
      error: 'search text not found. It must match the current file exactly (whitespace included). Read the file or use write_file.',
    };
  }
  if (source.indexOf(search, first + 1) !== -1) {
    return { ok: false, error: 'search text matches more than once. Include more surrounding lines so it is unique.' };
  }
  return { ok: true, content: source.slice(0, first) + replace + source.slice(first + search.length) };
}

/** Sorted list of paths with index.html first. */
export function sortPaths(paths: string[]): string[] {
  return paths.slice().sort((a, b) => {
    if (a === ENTRY_FILE) return -1;
    if (b === ENTRY_FILE) return 1;
    const da = a.split('/').length;
    const db = b.split('/').length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}

/** Language id for the editor from a path. */
export function languageForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'js':
      return 'javascript';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'svg':
      return 'xml';
    default:
      return 'text';
  }
}

/** Keep only valid paths/contents, at most maxFiles. */
export function sanitizeFiles(files: Record<string, unknown> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!files || typeof files !== 'object') return out;
  for (const [k, v] of Object.entries(files)) {
    if (Object.keys(out).length >= CODE_LIMITS.maxFiles) break;
    const p = validatePath(k);
    if (!p.ok || typeof v !== 'string' || !validateContent(v).ok) continue;
    out[p.path] = v;
  }
  return out;
}
