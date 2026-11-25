// Splits assistant markdown into prose and fenced code segments so code can be
// rendered in an editable canvas, and writes edited code back into the exact
// fence it came from. Pure functions, unit tested.

export interface MarkdownSegment {
  type: 'markdown';
  text: string;
}

export interface CodeSegment {
  type: 'code';
  /** 0-based index among code blocks in the message. Stable key for edits. */
  index: number;
  language: string;
  code: string;
  /** false while the closing fence has not arrived yet (streaming). */
  closed: boolean;
}

export type Segment = MarkdownSegment | CodeSegment;

interface FenceMatch {
  index: number;
  /** char offsets in the source */
  start: number; // start of opening fence line
  codeStart: number; // first char of code
  codeEnd: number; // char after last code char (before closing fence line)
  end: number; // char after closing fence line (or content end)
  fence: string; // e.g. ``` or ~~~~
  indent: number;
  info: string;
  closed: boolean;
}

const OPEN_RE = /^( {0,3})(`{3,}|~{3,})([^\n]*)$/;
const CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

function scanFences(content: string): FenceMatch[] {
  const out: FenceMatch[] = [];
  const lines = content.split('\n');
  let offset = 0;
  let open: Omit<FenceMatch, 'codeEnd' | 'end' | 'closed'> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length; // excludes \n
    const nextOffset = lineEnd + (i < lines.length - 1 ? 1 : 0);

    if (!open) {
      const m = OPEN_RE.exec(line);
      // Backtick fences cannot have backticks in the info string (CommonMark).
      if (m && !(m[2][0] === '`' && m[3].includes('`'))) {
        open = {
          index: out.length,
          start: lineStart,
          codeStart: nextOffset,
          fence: m[2],
          indent: m[1].length,
          info: m[3].trim(),
        };
      }
    } else {
      const m = CLOSE_RE.exec(line);
      if (m && m[1][0] === open.fence[0] && m[1].length >= open.fence.length) {
        out.push({
          ...open,
          codeEnd: Math.max(open.codeStart, lineStart - 1),
          end: nextOffset,
          closed: true,
        });
        open = null;
      }
    }
    offset = nextOffset;
  }

  if (open) {
    out.push({ ...open, codeEnd: content.length, end: content.length, closed: false });
  }
  return out;
}

function stripIndent(code: string, indent: number): string {
  if (!indent) return code;
  const re = new RegExp(`^ {0,${indent}}`);
  return code
    .split('\n')
    .map((l) => l.replace(re, ''))
    .join('\n');
}

function languageOf(info: string): string {
  const lang = info.split(/\s+/)[0] ?? '';
  return lang.replace(/^\{?\.?/, '').replace(/\}$/, '').toLowerCase();
}

export function parseSegments(content: string): Segment[] {
  const fences = scanFences(content);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const f of fences) {
    if (f.start > cursor) {
      const text = content.slice(cursor, f.start);
      if (text.trim()) segments.push({ type: 'markdown', text });
    }
    const rawCode = f.codeStart <= f.codeEnd ? content.slice(f.codeStart, f.codeEnd) : '';
    segments.push({
      type: 'code',
      index: f.index,
      language: languageOf(f.info),
      code: stripIndent(rawCode, f.indent),
      closed: f.closed,
    });
    cursor = f.end;
  }
  if (cursor < content.length) {
    const text = content.slice(cursor);
    if (text.trim()) segments.push({ type: 'markdown', text });
  }
  return segments;
}

export function countCodeBlocks(content: string): number {
  return scanFences(content).length;
}

/**
 * Replace the code inside the `index`-th fence. The fence is lengthened when
 * the new code itself contains a fence of the same character, so the edit can
 * never break the surrounding markdown.
 */
export function replaceCodeBlock(content: string, index: number, newCode: string): string {
  const f = scanFences(content).find((x) => x.index === index);
  if (!f) return content;

  const ch = f.fence[0];
  let longestRun = 0;
  const runRe = ch === '`' ? /`+/g : /~+/g;
  for (const m of newCode.matchAll(runRe)) longestRun = Math.max(longestRun, m[0].length);
  const fenceLen = Math.max(f.fence.length, longestRun >= 3 ? longestRun + 1 : 3);
  const fence = ch.repeat(fenceLen);

  const body = newCode.endsWith('\n') ? newCode : newCode + '\n';
  const block = `${fence}${f.info}\n${body}${fence}`;
  // f.end includes the newline after the closing fence, if there was one.
  const trailingNl = content.slice(f.start, f.end).endsWith('\n') ? '\n' : '';
  return content.slice(0, f.start) + block + trailingNl + content.slice(f.end);
}

/** Heuristic file extension for downloads. */
export function extensionFor(language: string): string {
  const map: Record<string, string> = {
    javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
    python: 'py', py: 'py', rust: 'rs', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    'c++': 'cpp', csharp: 'cs', cs: 'cs', ruby: 'rb', php: 'php', swift: 'swift',
    kotlin: 'kt', html: 'html', css: 'css', json: 'json', yaml: 'yml', yml: 'yml',
    markdown: 'md', md: 'md', sql: 'sql', bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh',
  };
  return map[language] ?? 'txt';
}
