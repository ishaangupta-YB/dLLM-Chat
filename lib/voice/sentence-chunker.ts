// Turns a growing stream of assistant text into speakable sentences.
//
// Mercury streams text token by token. For low latency we hand each sentence
// to speech synthesis as soon as it is complete, instead of waiting for the
// whole answer (the pattern from Inception's realtime voice cookbook).
// Everything here is pure so it can be unit tested in Node.

/** Words that end with a period but do not end a sentence (lowercase, no dot). */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'etc', 'approx', 'appt', 'apt',
  'dept', 'est', 'fig', 'inc', 'ltd', 'co', 'corp', 'no', 'nos', 'vol', 'ave', 'blvd', 'rd',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'e.g', 'i.e', 'cf', 'al', 'u.s', 'u.k', 'a.m', 'p.m', 'ph.d', 'min', 'max',
]);

// "etc." very often ends a sentence; only treat it as an abbreviation when a
// lowercase word follows. Same for a few others that commonly end sentences.
const SOFT_ABBREVIATIONS = new Set(['etc', 'al', 'inc', 'ltd', 'co', 'corp', 'min', 'max', 'a.m', 'p.m']);

const CLOSERS = `"')]}”’`;

/**
 * Remove fenced code blocks. An unclosed fence (still streaming) hides
 * everything after it, so the result only ever grows as more text arrives.
 */
export function removeCodeFences(text: string): string {
  let out = '';
  let i = 0;
  // Fences must start at the beginning of a line.
  const fence = /(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*/g;
  while (true) {
    fence.lastIndex = i;
    const open = fence.exec(text);
    if (!open) {
      out += text.slice(i);
      break;
    }
    const openStart = open.index + open[1].length;
    out += text.slice(i, openStart);
    const marker = open[2];
    const close = new RegExp(`\\n[ \\t]*${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*(?=\\n|$)`, 'g');
    close.lastIndex = open.index + open[0].length;
    const closed = close.exec(text);
    if (!closed) break; // unclosed: drop the rest
    i = closed.index + closed[0].length;
  }
  return out;
}

/** Strip markdown so a TTS engine does not read symbols aloud. */
export function stripMarkdown(input: string): string {
  let t = removeCodeFences(input);
  t = t.replace(/<[^>\n]+>/g, ' '); // html tags
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // images -> alt
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links -> text
  t = t.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1'); // reference links
  t = t.replace(/`([^`]*)`/g, '$1'); // inline code
  t = t.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ' '); // horizontal rules
  t = t.replace(/^[ \t]*#{1,6}[ \t]+/gm, ''); // headings
  t = t.replace(/^[ \t]*>+[ \t]?/gm, ''); // blockquotes
  t = t.replace(/^[ \t]*[-*+•][ \t]+(\[[ xX]\][ \t]+)?/gm, ''); // bullets / task lists
  t = t.replace(/^[ \t]*\d{1,3}[.)][ \t]+/gm, ''); // numbered lists
  t = t.replace(/^[ \t]*\|?[ \t:]*-{3,}[ \t:|-]*$/gm, ' '); // table separators
  t = t.replace(/[ \t]*\|[ \t]*/g, ', '); // table cells
  t = t.replace(/(\*\*|__)(.+?)\1/g, '$2'); // bold
  t = t.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2'); // *italic*
  t = t.replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2'); // _italic_
  t = t.replace(/~~(.+?)~~/g, '$1'); // strikethrough
  t = t.replace(/\*+/g, ''); // stray asterisks
  t = t.replace(/^[ ,]+|[ ,]+$/gm, '');
  t = t.replace(/\s+/g, ' ');
  return t.trim();
}

/** Word immediately before position `dot` (exclusive), lowercased, keeping inner dots. */
function wordBefore(text: string, dot: number): { word: string; start: number } {
  let s = dot;
  while (s > 0 && /[\w.]/.test(text[s - 1])) s--;
  return { word: text.slice(s, dot).toLowerCase(), start: s };
}

/**
 * Index just after the end of the first complete sentence in `text`, or -1.
 * A sentence is complete when terminal punctuation is followed by whitespace
 * (we cannot know yet whether "3." at the very end becomes "3.14"), or at a
 * newline.
 */
export function findSentenceEnd(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      if (text.slice(0, i).trim()) return i + 1;
      continue;
    }
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;

    // Swallow runs like "?!" or "..." and trailing quotes/brackets.
    let j = i + 1;
    while (j < text.length && /[.!?…]/.test(text[j])) j++;
    while (j < text.length && CLOSERS.includes(text[j])) j++;
    if (j >= text.length) return -1; // need to see what follows
    if (!/\s/.test(text[j])) {
      i = j - 1;
      continue; // 3.14, e.g, example.com, "Hi!Yo"
    }

    if (ch === '.' && j === i + 1) {
      const { word, start } = wordBefore(text, i);
      const next = text.slice(j).trimStart()[0] ?? '';
      // List markers like "1. " at the start of a line.
      if (/^\d+$/.test(word) && (start === 0 || text[start - 1] === '\n')) continue;
      // Single-letter initials: "J. R. R. Tolkien".
      if (/^[a-z]$/.test(word) && /[A-Z]/.test(text[start] ?? '')) continue;
      if (ABBREVIATIONS.has(word)) {
        if (!SOFT_ABBREVIATIONS.has(word)) continue;
        if (next && /[a-z0-9]/.test(next)) continue;
      }
    }
    if (text.slice(0, j).trim()) return j;
  }
  return -1;
}

export interface SentenceChunker {
  /** Pass the full text so far; returns sentences completed since the last call. */
  push(fullText: string): string[];
  /** End of stream: returns whatever is left as a final sentence. */
  flush(): string[];
  reset(): void;
}

export function createSentenceChunker(): SentenceChunker {
  let consumed = 0; // offset into the fence-free text already emitted
  let latest = '';

  const take = (final: boolean): string[] => {
    const speakable = removeCodeFences(latest);
    const out: string[] = [];
    while (consumed < speakable.length) {
      const rest = speakable.slice(consumed);
      const end = findSentenceEnd(rest);
      if (end === -1) {
        if (final) {
          const s = stripMarkdown(rest);
          if (s && /[\p{L}\p{N}]/u.test(s)) out.push(s);
          consumed = speakable.length;
        }
        break;
      }
      const s = stripMarkdown(rest.slice(0, end));
      if (s && /[\p{L}\p{N}]/u.test(s)) out.push(s);
      consumed += end;
    }
    return out;
  };

  return {
    push(fullText: string) {
      latest = fullText;
      return take(false);
    },
    flush() {
      return take(true);
    },
    reset() {
      consumed = 0;
      latest = '';
    },
  };
}
