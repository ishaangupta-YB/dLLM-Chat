// Wire protocol between /api/chat and the browser: newline-delimited JSON.
// The server translates Inception's SSE into these events so the client never
// needs to know about upstream quirks (append vs replace, usage shape, etc).
import type { MessageUsage } from '@/lib/types';

export type ChatStreamEvent =
  /** Append text (streaming mode). */
  | { t: 'text'; v: string }
  /** Replace the whole canvas (diffusing mode). p = 1 on the clean final frame. */
  | { t: 'frame'; v: string; p: number }
  | { t: 'finish'; reason: string | null }
  | { t: 'usage'; usage: MessageUsage }
  | { t: 'warning'; message: string }
  | { t: 'error'; message: string };

export const encodeEvent = (e: ChatStreamEvent) => JSON.stringify(e) + '\n';

/** Incremental NDJSON decoder for the browser. */
export function createNdjsonDecoder(onEvent: (e: ChatStreamEvent) => void) {
  let buffer = '';
  const handle = (line: string) => {
    const s = line.trim();
    if (!s) return;
    try {
      onEvent(JSON.parse(s) as ChatStreamEvent);
    } catch {
      /* ignore malformed line */
    }
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    },
    end() {
      handle(buffer);
      buffer = '';
    },
  };
}
