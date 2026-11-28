// How attached files are presented to the model. Pure, shared by client and tests.
import type { Attachment } from '@/lib/types';

/** Total characters of attachment text sent with one message. */
export const MAX_ATTACHMENT_CHARS_TOTAL = 120_000;
/** Characters per file. */
export const MAX_ATTACHMENT_CHARS_EACH = 60_000;
export const MAX_ATTACHMENTS = 8;

function fenceFor(text: string): string {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** User text followed by each attached file in a fenced block labelled with its name. */
export function formatWithAttachments(text: string, attachments?: Attachment[]): string {
  if (!attachments?.length) return text;
  const blocks = attachments.map((a) => {
    const fence = fenceFor(a.text);
    const note = a.truncated ? ' (truncated)' : '';
    return `Attached file: ${a.name}${note}\n${fence}\n${a.text}\n${fence}`;
  });
  return [text.trim(), ...blocks].filter(Boolean).join('\n\n');
}
