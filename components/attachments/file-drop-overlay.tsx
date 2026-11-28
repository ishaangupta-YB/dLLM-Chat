'use client';

// Drag files anywhere over the chat area to attach them. Listens on window in
// the capture phase (so PromptInput's own form-level drop handler never sees
// the files) and shows an overlay over the chat column while dragging.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileUpIcon } from 'lucide-react';
import { MAX_ATTACHMENTS } from '@/lib/attachments/extract';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function chatAreaRect(): Rect {
  const el = document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]') ?? document.querySelector('main');
  if (!el) return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function FileDropOverlay({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const [rect, setRect] = useState<Rect | null>(null);
  const depth = useRef(0);
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    if (disabled) return;
    const reset = () => {
      depth.current = 0;
      setRect(null);
    };
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      if (depth.current === 1) setRect(chatAreaRect());
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setRect(null);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      reset();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFilesRef.current(files);
    };
    window.addEventListener('dragenter', onEnter, true);
    window.addEventListener('dragover', onOver, true);
    window.addEventListener('dragleave', onLeave, true);
    window.addEventListener('drop', onDrop, true);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('dragenter', onEnter, true);
      window.removeEventListener('dragover', onOver, true);
      window.removeEventListener('dragleave', onLeave, true);
      window.removeEventListener('drop', onDrop, true);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [disabled]);

  if (!rect) return null;
  return createPortal(
    <div
      data-testid="file-drop-overlay"
      aria-hidden
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      className="pointer-events-none fixed z-50 p-3 animate-in fade-in-0 duration-150"
    >
      <div className="flex size-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-background/85 backdrop-blur-sm">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <FileUpIcon className="size-7" />
        </span>
        <p className="text-base font-semibold">Drop files to attach</p>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          Text, code, CSV, JSON, PDF or DOCX. Up to {MAX_ATTACHMENTS} files; text is extracted in your browser.
        </p>
      </div>
    </div>,
    document.body,
  );
}
