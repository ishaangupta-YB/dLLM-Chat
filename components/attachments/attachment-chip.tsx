'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';
import {
  CircleAlertIcon,
  FileBracesIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  Loader2Icon,
  XIcon,
} from 'lucide-react';
import { extensionOf, formatBytes } from '@/lib/attachments/extract';
import { cn } from '@/lib/utils';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface FileVisual {
  Icon: IconType;
  /** Short type label, e.g. "PDF". */
  label: string;
  /** Tailwind classes for the icon tile. */
  tone: string;
}

const CODE_EXT = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp',
  'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'html', 'htm', 'css', 'scss', 'vue', 'svelte', 'lua', 'r', 'dart', 'scala',
  'graphql', 'proto', 'dockerfile', 'makefile', 'xml', 'svg',
]);

export function fileVisual(name: string, mime: string): FileVisual {
  const ext = extensionOf(name);
  const label = (ext || mime.split('/').pop() || 'file').toUpperCase().slice(0, 6);
  if (ext === 'pdf' || mime === 'application/pdf')
    return { Icon: FileTypeIcon, label: 'PDF', tone: 'bg-red-500/12 text-red-600 dark:text-red-400' };
  if (ext === 'docx' || ext === 'doc')
    return { Icon: FileTextIcon, label: 'DOCX', tone: 'bg-blue-500/12 text-blue-600 dark:text-blue-400' };
  if (ext === 'csv' || ext === 'tsv')
    return { Icon: FileSpreadsheetIcon, label, tone: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' };
  if (ext === 'json' || ext === 'jsonl' || ext === 'yaml' || ext === 'yml' || ext === 'toml')
    return { Icon: FileBracesIcon, label, tone: 'bg-amber-500/14 text-amber-600 dark:text-amber-400' };
  if (CODE_EXT.has(ext))
    return { Icon: FileCodeIcon, label, tone: 'bg-violet-500/12 text-violet-600 dark:text-violet-400' };
  return { Icon: FileTextIcon, label: ext ? label : 'TEXT', tone: 'bg-primary/14 text-primary' };
}

export interface AttachmentChipProps {
  name: string;
  mime: string;
  size: number;
  status?: 'extracting' | 'ready' | 'error';
  truncated?: boolean;
  error?: string;
  /** Extra detail after the type and size, e.g. "3 pages". */
  detail?: ReactNode;
  onRemove?: () => void;
  onOpen?: () => void;
  className?: string;
}

/** File chip used in the composer (removable) and on sent user messages (click to preview). */
export function AttachmentChip({
  name,
  mime,
  size,
  status = 'ready',
  truncated,
  error,
  detail,
  onRemove,
  onOpen,
  className,
}: AttachmentChipProps) {
  const { Icon, label, tone } = fileVisual(name, mime);
  const isError = status === 'error';
  const sub =
    status === 'extracting'
      ? 'Reading…'
      : isError
        ? error || 'Can’t attach'
        : [label, formatBytes(size)].filter(Boolean).join(' · ');

  const body = (
    <>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          isError ? 'bg-destructive/12 text-destructive' : tone,
        )}
      >
        {status === 'extracting' ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : isError ? (
          <CircleAlertIcon className="size-4" aria-hidden />
        ) : (
          <Icon className="size-4" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-col text-left leading-tight">
        <span className="truncate text-[13px] font-medium text-foreground">{name}</span>
        <span
          className={cn(
            'flex min-w-0 items-center gap-1 truncate text-[11px]',
            isError ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          <span className="truncate">{sub}</span>
          {!isError && status === 'ready' && detail && <span className="shrink-0">· {detail}</span>}
          {!isError && status === 'ready' && truncated && (
            <span
              data-testid="attachment-truncated"
              title="Only the first part of this file is sent to the model."
              className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300"
            >
              truncated
            </span>
          )}
        </span>
      </span>
    </>
  );

  return (
    <div
      data-testid="attachment-chip"
      data-status={status}
      title={isError ? `${name}: ${error ?? ''}` : name}
      className={cn(
        'group/chip relative flex h-12 max-w-[15rem] min-w-0 shrink-0 items-center rounded-xl border bg-background/70 shadow-xs transition-colors',
        isError ? 'border-destructive/40 bg-destructive/5' : 'border-border/80',
        onOpen && 'hover:border-primary/40 hover:bg-accent/50',
        className,
      )}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Preview ${name}`}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1.5 pr-3 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {body}
        </button>
      ) : (
        <div className={cn('flex h-full min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-2', onRemove ? 'pr-8' : 'pr-3')}>
          {body}
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
