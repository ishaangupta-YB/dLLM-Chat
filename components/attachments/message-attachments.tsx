'use client';

// Chips for files attached to a sent user message. Clicking one opens a dialog
// with the exact text that was extracted and sent to the model.
import { memo, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatBytes, formatChars } from '@/lib/attachments/extract';
import type { Attachment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AttachmentChip, fileVisual } from './attachment-chip';

export const MessageAttachments = memo(function MessageAttachments({
  attachments,
  className,
}: {
  attachments?: Attachment[];
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!attachments?.length) return null;
  const open = attachments.find((a) => a.id === openId) ?? null;

  return (
    <>
      <div
        data-testid="message-attachments"
        className={cn('flex max-w-full flex-wrap justify-end gap-2', className)}
      >
        {attachments.map((a) => (
          <AttachmentChip
            key={a.id}
            name={a.name}
            mime={a.mime}
            size={a.size}
            truncated={a.truncated}
            onOpen={() => setOpenId(a.id)}
          />
        ))}
      </div>
      <AttachmentPreviewDialog attachment={open} onClose={() => setOpenId(null)} />
    </>
  );
});

function AttachmentPreviewDialog({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const visual = attachment ? fileVisual(attachment.name, attachment.mime) : null;

  const copy = async () => {
    if (!attachment) return;
    try {
      await navigator.clipboard.writeText(attachment.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Dialog open={!!attachment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="attachment-preview" className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
        {attachment && visual && (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="flex min-w-0 items-center gap-2.5 text-base">
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', visual.tone)}>
                  <visual.Icon className="size-4" />
                </span>
                <span className="truncate">{attachment.name}</span>
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span>{visual.label}</span>
                <span aria-hidden>·</span>
                <span>{formatBytes(attachment.size)}</span>
                <span aria-hidden>·</span>
                <span>{formatChars(attachment.text.length)} sent to the model</span>
                {attachment.truncated && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                    Truncated: only the first part was sent
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <pre
              data-testid="attachment-preview-text"
              className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
            >
              {attachment.text || '(no text)'}
            </pre>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <CheckIcon className="text-emerald-500" /> : <CopyIcon />}
                {copied ? 'Copied' : 'Copy text'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
