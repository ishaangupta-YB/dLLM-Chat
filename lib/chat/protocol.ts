// Wire protocol between /api/chat and the browser: newline-delimited JSON.
// The server translates Inception's SSE into these events so the client never
// needs to know about upstream quirks (append vs replace, usage shape, etc).
import type { MessageUsage, SourceRef } from '@/lib/types';

export type ChatStreamEvent =
  /** Append text (streaming mode). */
  | { t: 'text'; v: string }
  /** Replace the whole canvas (diffusing mode). p = 1 on the clean final frame. */
  | { t: 'frame'; v: string; p: number }
  | { t: 'finish'; reason: string | null }
  | { t: 'usage'; usage: MessageUsage }
  | { t: 'warning'; message: string }
  | { t: 'error'; message: string }
  /**
   * Agent loop. A new model step starts (step >= 1). In diffusing mode, frames
   * of a step replace only that step's text; text from earlier steps is kept.
   */
  | { t: 'step'; step: number }
  /** A tool call started. args is a JSON string. */
  | { t: 'tool_start'; id: string; name: string; label?: string; source?: string; args: string }
  /** A tool call finished. result is a display preview (truncated). */
  | { t: 'tool_end'; id: string; ok: boolean; result?: string; error?: string }
  /** Web sources gathered by tools, deduplicated by URL. */
  | { t: 'sources'; sources: SourceRef[] }
  /**
   * Coding agent: a file was written or deleted. content is the full file
   * (omitted when deleted). Emitted when the write_file/edit_file tool runs.
   */
  | { t: 'file'; path: string; content?: string; deleted?: boolean };

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
