'use client';

// Composer-side state for files being attached: extraction runs as soon as a
// file is added, so the send button only waits for files still in progress.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import {
  AttachmentError,
  MAX_ATTACHMENTS,
  extractFile,
  fitToBudget,
  precheckFile,
} from '@/lib/attachments/extract';
import type { Attachment } from '@/lib/types';

export type DraftStatus = 'extracting' | 'ready' | 'error';

export interface DraftAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  status: DraftStatus;
  text?: string;
  truncated?: boolean;
  pages?: number;
  error?: string;
}

function mimeFor(file: File): string {
  return file.type || 'text/plain';
}

export function useAttachmentDraft() {
  const [items, setItems] = useState<DraftAttachment[]>([]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // Ids removed while extracting: their results are dropped.
  const cancelled = useRef(new Set<string>());

  const update = useCallback((id: string, patch: Partial<DraftAttachment>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const add = useCallback(
    (files: Iterable<File> | ArrayLike<File>) => {
      const incoming = Array.from(files as ArrayLike<File>);
      if (!incoming.length) return;
      const active = itemsRef.current.filter((it) => it.status !== 'error').length;
      const room = Math.max(0, MAX_ATTACHMENTS - active);
      if (incoming.length > room) {
        toast.error(
          room === 0
            ? `You can attach up to ${MAX_ATTACHMENTS} files per message.`
            : `Only ${room} more file${room === 1 ? '' : 's'} can be attached (limit ${MAX_ATTACHMENTS}).`,
        );
      }
      const accepted = incoming.slice(0, room);
      const created: { item: DraftAttachment; file: File }[] = [];
      const errors: string[] = [];
      for (const file of accepted) {
        const item: DraftAttachment = {
          id: nanoid(10),
          name: file.name || 'pasted.txt',
          mime: mimeFor(file),
          size: file.size,
          status: 'extracting',
        };
        try {
          precheckFile(file);
        } catch (err) {
          item.status = 'error';
          item.error = err instanceof AttachmentError ? err.message : 'This file can’t be attached.';
          errors.push(`${item.name}: ${item.error}`);
        }
        created.push({ item, file });
      }
      setItems((list) => [...list, ...created.map((c) => c.item)]);
      if (errors.length) toast.error(errors.length === 1 ? errors[0] : `${errors.length} files can’t be attached. ${errors[0]}`);

      for (const { item, file } of created) {
        if (item.status !== 'extracting') continue;
        extractFile(file)
          .then((res) => {
            if (cancelled.current.has(item.id)) return;
            update(item.id, { status: 'ready', text: res.text, truncated: res.truncated, pages: res.pages });
          })
          .catch((err: unknown) => {
            if (cancelled.current.has(item.id)) return;
            const message = err instanceof AttachmentError ? err.message : 'This file could not be read.';
            update(item.id, { status: 'error', error: message });
            toast.error(`${item.name}: ${message}`);
          });
      }
    },
    [update],
  );

  const remove = useCallback((id: string) => {
    cancelled.current.add(id);
    setItems((list) => list.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => {
    for (const it of itemsRef.current) cancelled.current.add(it.id);
    setItems([]);
  }, []);

  useEffect(() => {
    const set = cancelled.current;
    return () => set.clear();
  }, []);

  const extracting = items.some((it) => it.status === 'extracting');

  /** Ready attachments with the per-message budget applied (what will be sent). */
  const ready = useMemo<Attachment[]>(
    () =>
      fitToBudget(
        items
          .filter((it) => it.status === 'ready')
          .map((it) => ({
            id: it.id,
            name: it.name,
            mime: it.mime,
            size: it.size,
            text: it.text ?? '',
            truncated: it.truncated || undefined,
          })),
      ),
    [items],
  );

  return { items, add, remove, clear, extracting, ready };
}
