// Pure FIM (fill-in-the-middle) logic shared by the CodeMirror extension:
// request gating, token budgets, suggestion post-processing, partial accept,
// typed-character consumption and error back-off. No DOM, no CodeMirror.

/** Max document size we send for autocomplete. */
export const FIM_MAX_DOC_CHARS = 500_000;
/** Client-side context window (the route trims further). */
export const FIM_PREFIX_CHARS = 16_000;
export const FIM_SUFFIX_CHARS = 6_000;
export const FIM_DEBOUNCE_MS = 200;

export interface FimContext {
  /** Whole document text. */
  doc: string;
  /** Cursor offset. */
  pos: number;
}

export interface FimGateInput {
  enabled: boolean;
  focused: boolean;
  selectionEmpty: boolean;
  docLength: number;
  /** Character right after the cursor ('' at end of doc). */
  charAfter: string;
  /** Epoch ms until which requests are suppressed after an error. */
  backoffUntil: number;
  now: number;
  composing?: boolean;
}

export type FimSkipReason =
  | 'disabled'
  | 'unfocused'
  | 'selection'
  | 'too-large'
  | 'mid-word'
  | 'backoff'
  | 'composing';

/** Returns why a request should not be made, or null when it may proceed. */
export function fimSkipReason(i: FimGateInput): FimSkipReason | null {
  if (!i.enabled) return 'disabled';
  if (!i.focused) return 'unfocused';
  if (i.composing) return 'composing';
  if (!i.selectionEmpty) return 'selection';
  if (i.docLength > FIM_MAX_DOC_CHARS) return 'too-large';
  if (i.now < i.backoffUntil) return 'backoff';
  // Cursor in the middle of an identifier: suggestions there are mostly noise.
  if (i.charAfter && /[\p{L}\p{N}_$]/u.test(i.charAfter)) return 'mid-word';
  return null;
}

export interface LineInfo {
  /** Text on the cursor line before the cursor. */
  before: string;
  /** Text on the cursor line after the cursor. */
  after: string;
  /** Total number of lines in the document. */
  lineCount: number;
}

export function lineInfo({ doc, pos }: FimContext): LineInfo {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  let lineEnd = doc.indexOf('\n', pos);
  if (lineEnd === -1) lineEnd = doc.length;
  let lineCount = 1;
  for (let i = doc.indexOf('\n'); i !== -1; i = doc.indexOf('\n', i + 1)) lineCount++;
  return { before: doc.slice(lineStart, pos), after: doc.slice(pos, lineEnd), lineCount };
}

export type FimMode = 'inline' | 'line' | 'block';

/**
 * inline: text follows the cursor on its line, complete only up to it.
 * line:   cursor at the end of a line with content (finish the statement, maybe more).
 * block:  cursor on a blank line (start of a new statement / body).
 */
export function fimMode(info: LineInfo): FimMode {
  if (info.after.trim()) return 'inline';
  if (info.lineCount <= 1) return 'inline';
  if (!info.before.trim()) return 'block';
  return 'line';
}

export function maxTokensFor(mode: FimMode): number {
  switch (mode) {
    case 'inline':
      return 64;
    case 'line':
      return 128;
    case 'block':
      return 192;
  }
}

export interface FimRequestPlan {
  prompt: string;
  suffix: string;
  maxTokens: number;
  mode: FimMode;
  /** Rest of the cursor line, used by post-processing. */
  lineAfter: string;
}

export function planFimRequest(ctx: FimContext): FimRequestPlan {
  const info = lineInfo(ctx);
  const mode = fimMode(info);
  return {
    prompt: ctx.doc.slice(Math.max(0, ctx.pos - FIM_PREFIX_CHARS), ctx.pos),
    suffix: ctx.doc.slice(ctx.pos, ctx.pos + FIM_SUFFIX_CHARS),
    maxTokens: maxTokensFor(mode),
    mode,
    lineAfter: info.after,
  };
}

const CLOSERS = new Set([')', ']', '}', '"', "'", '`', ';', ',', '>']);

/**
 * Cleans a raw completion. Returns null when nothing useful remains.
 * - inline mode keeps only the first line (the rest of the line already exists)
 * - drops a suggestion that only repeats text already after the cursor
 * - strips a tail that duplicates the rest of the cursor line (e.g. `foo()` before `)`)
 * - trims trailing whitespace-only lines
 */
export function postProcessSuggestion(
  raw: string,
  opts: { suffix: string; lineAfter: string; mode: FimMode },
): string | null {
  let text = raw.replace(/\r\n?/g, '\n');
  if (!text) return null;

  if (opts.mode === 'inline') {
    const nl = text.indexOf('\n');
    if (nl !== -1) text = text.slice(0, nl);
  }

  // Nothing new: the suggestion is already what follows the cursor.
  if (opts.suffix.startsWith(text)) return null;
  const suffixHead = opts.suffix.replace(/^\s+/, '');
  if (text.trim() && suffixHead.startsWith(text.trim())) return null;

  // Leading duplicate: the model re-emitted the text right after the cursor
  // first (it ignored the suffix). Inserting it would duplicate that text.
  const after = opts.lineAfter.trimEnd();
  if (after.trim() && text.startsWith(after.trim())) return null;

  // Block completions sometimes end by repeating the next existing line.
  if (opts.mode !== 'inline' && text.includes('\n')) {
    const nextLine = opts.suffix
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    const lines = text.split('\n');
    if (nextLine && lines[lines.length - 1].trim() === nextLine) {
      text = lines.slice(0, -1).join('\n');
    }
  }

  // Tail duplicate of the rest of the line.
  if (after) {
    if (text.endsWith(after) && text.length > after.length) {
      text = text.slice(0, -after.length);
    } else {
      let k = 0;
      while (k < after.length && CLOSERS.has(after[k])) k++;
      for (; k > 0; k--) {
        const head = after.slice(0, k);
        if (text.endsWith(head) && text.length > k) {
          text = text.slice(0, -k);
          break;
        }
      }
    }
  }

  text = text.replace(/(\n[ \t]*)+$/, '');
  if (!text.trim()) return null;
  return text;
}

/** The next chunk for Ctrl/Cmd+Right partial accept: whitespace + a word, or a punctuation run. */
export function nextWordChunk(s: string): string {
  if (!s) return '';
  const m = /^(\s*)([\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]+)?/u.exec(s);
  const chunk = m ? m[0] : '';
  if (chunk) return chunk;
  return s[0];
}

/**
 * If `typed` (inserted at the ghost position) is a prefix of the suggestion,
 * returns the remaining suggestion ('' when fully typed). Otherwise null.
 */
export function consumeTyped(suggestion: string, typed: string): string | null {
  if (!typed || !suggestion.startsWith(typed)) return null;
  return suggestion.slice(typed.length);
}

export interface FimErrorInfo {
  status: number;
  code?: string;
  retryAfterMs?: number;
}

/** How long to stop requesting after an error. */
export function backoffMs(err: FimErrorInfo, consecutiveErrors: number): number {
  if (err.retryAfterMs && err.retryAfterMs > 0) return Math.min(err.retryAfterMs, 60_000);
  const base = err.status === 429 ? 8_000 : err.status >= 500 || err.status === 0 ? 4_000 : 3_000;
  return Math.min(base * 2 ** Math.max(0, consecutiveErrors - 1), 60_000);
}

export function fimErrorLabel(err: FimErrorInfo): string {
  if (err.status === 429) return 'Rate limited';
  if (err.status === 0) return 'Offline';
  if (err.status === 401 || err.status === 403) return 'Not allowed';
  if (err.status === 502 || err.status === 503) return 'Service unavailable';
  if (err.status >= 500) return 'Server error';
  return 'Request failed';
}

export type FimStatus =
  | { kind: 'off' }
  | { kind: 'idle'; latencyMs?: number }
  | { kind: 'loading'; latencyMs?: number }
  | { kind: 'error'; message: string; until: number; latencyMs?: number };
