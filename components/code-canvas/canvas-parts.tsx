'use client';

// Presentational pieces of the code canvas: header toolbar, footer status bar
// and the bottom resize handle.
import { useSyncExternalStore } from 'react';
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileCode2Icon,
  Maximize2Icon,
  Minimize2Icon,
  RotateCcwIcon,
  SaveIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CanvasStatusStore } from '@/lib/editor/status-store';
import { cn } from '@/lib/utils';

/** Light/dark syntax palette (GitHub Primer) consumed by the --cm-* HighlightStyle. */
export const SYNTAX_VARS =
  '[--cm-kw:#cf222e] [--cm-str:#0a3069] [--cm-re:#116329] [--cm-com:#6e7781] [--cm-num:#0550ae] [--cm-fn:#8250df] [--cm-type:#953800] [--cm-prop:#0550ae] [--cm-tag:#116329] [--cm-meta:#6e7781] [--cm-ins:#116329] [--cm-del:#82071e] [--cm-punct:#57606a] ' +
  'dark:[--cm-kw:#ff7b72] dark:[--cm-str:#a5d6ff] dark:[--cm-re:#7ee787] dark:[--cm-com:#8b949e] dark:[--cm-num:#79c0ff] dark:[--cm-fn:#d2a8ff] dark:[--cm-type:#ffa657] dark:[--cm-prop:#79c0ff] dark:[--cm-tag:#7ee787] dark:[--cm-meta:#8b949e] dark:[--cm-ins:#aff5b4] dark:[--cm-del:#ffa198] dark:[--cm-punct:#b1bac4]';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function IconAction({
  label,
  shortcut,
  onClick,
  disabled,
  children,
  testId,
  className,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn('size-7 text-muted-foreground hover:text-foreground', className)}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          data-testid={testId}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
        {shortcut && <span className="ml-1.5 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export interface CanvasHeaderProps {
  languageLabel: string;
  filename: string;
  streaming: boolean;
  editable: boolean;
  dirty: boolean;
  savedFlash: boolean;
  copied: boolean;
  fimEnabled: boolean;
  maximized: boolean;
  onToggleFim: (v: boolean) => void;
  onSave: () => void;
  onReset: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onToggleMaximize: () => void;
}

export function CanvasHeader(p: CanvasHeaderProps) {
  const mod = isMac() ? '⌘' : 'Ctrl+';
  return (
    <div className="flex h-10 min-w-0 items-center gap-2 border-b bg-muted/40 pl-3 pr-1.5 dark:bg-muted/25">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FileCode2Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span
          className="shrink-0 rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] font-medium leading-none text-foreground/80 ring-1 ring-border"
          data-testid="code-canvas-language"
        >
          {p.languageLabel}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">{p.filename}</span>
        {p.dirty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="relative flex size-2 shrink-0"
                role="status"
                aria-label="Unsaved changes"
                data-testid="code-canvas-dirty"
              >
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500/40 [animation-iteration-count:2]" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>Unsaved changes</TooltipContent>
          </Tooltip>
        )}
        <span
          className={cn(
            'hidden items-center gap-1 text-[11px] text-emerald-600 transition-opacity duration-300 sm:inline-flex dark:text-emerald-400',
            p.savedFlash && !p.dirty ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          aria-live="polite"
          data-testid="code-canvas-saved"
        >
          <CheckIcon className="size-3" aria-hidden />
          {p.savedFlash && !p.dirty ? 'Saved' : ''}
        </span>
        {p.streaming && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            Writing…
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {!p.streaming && (
          <Tooltip>
            <TooltipTrigger asChild>
              <label
                className="mr-1 flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                data-testid="code-canvas-fim-toggle"
              >
                <SparklesIcon
                  className={cn('size-3.5 transition-colors', p.fimEnabled && 'text-primary')}
                  aria-hidden
                />
                <span className="hidden sm:inline">Autocomplete</span>
                <Switch
                  size="sm"
                  checked={p.fimEnabled}
                  onCheckedChange={p.onToggleFim}
                  aria-label="Autocomplete"
                />
              </label>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="max-w-60">
              Mercury Edit fill-in-the-middle suggestions. Tab to accept, Esc to dismiss
            </TooltipContent>
          </Tooltip>
        )}
        {p.editable && (
          <>
            <IconAction label="Reset to last saved" onClick={p.onReset} disabled={!p.dirty} testId="code-canvas-reset">
              <RotateCcwIcon />
            </IconAction>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={p.dirty ? 'secondary' : 'ghost'}
                  size="xs"
                  className={cn(
                    'h-7 gap-1 px-2 text-xs',
                    !p.dirty && 'text-muted-foreground',
                    p.dirty && 'ring-1 ring-border',
                  )}
                  onClick={p.onSave}
                  disabled={!p.dirty}
                  data-testid="code-canvas-save"
                >
                  <SaveIcon className="size-3.5" />
                  <span className="hidden sm:inline">Save</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                Save to chat <span className="ml-1 opacity-60">{mod}S</span>
              </TooltipContent>
            </Tooltip>
          </>
        )}
        <IconAction label={p.copied ? 'Copied' : 'Copy code'} onClick={p.onCopy} testId="code-canvas-copy">
          {p.copied ? <CheckIcon className="text-emerald-500" /> : <CopyIcon />}
        </IconAction>
        <IconAction label="Download" onClick={p.onDownload} testId="code-canvas-download" className="hidden sm:inline-flex">
          <DownloadIcon />
        </IconAction>
        <IconAction
          label={p.maximized ? 'Restore' : 'Maximize'}
          shortcut={p.maximized ? 'Esc' : undefined}
          onClick={p.onToggleMaximize}
          disabled={p.streaming}
          testId="code-canvas-maximize"
        >
          {p.maximized ? <Minimize2Icon /> : <Maximize2Icon />}
        </IconAction>
      </div>
    </div>
  );
}

export function CanvasFooter({
  status,
  streaming,
  editable,
  lineCount,
  indentLabel,
}: {
  status: CanvasStatusStore;
  streaming: boolean;
  editable: boolean;
  lineCount: number;
  indentLabel: string;
}) {
  const s = useSyncExternalStore(status.subscribe, status.get, status.get);
  const mod = isMac() ? '⌘' : 'Ctrl';

  let left: React.ReactNode;
  if (streaming) {
    left = <span className="text-muted-foreground">Streaming…</span>;
  } else if (!editable) {
    left = <span className="text-muted-foreground">Loading editor…</span>;
  } else if (s.ghost) {
    left = (
      <span className="flex items-center gap-2 text-muted-foreground" data-testid="code-canvas-fim-status">
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-background px-1 font-sans text-[10px] leading-4">Tab</kbd> accept
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <kbd className="rounded border bg-background px-1 font-sans text-[10px] leading-4">{mod} →</kbd> word
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-background px-1 font-sans text-[10px] leading-4">Esc</kbd> dismiss
        </span>
      </span>
    );
  } else {
    const f = s.fim;
    left = (
      <span className="flex items-center gap-1.5" data-testid="code-canvas-fim-status" data-state={f.kind}>
        {f.kind === 'loading' ? (
          <span className="relative flex size-2.5 items-center justify-center" aria-hidden>
            <span className="absolute size-2.5 animate-spin rounded-full border border-primary/30 border-t-primary" />
          </span>
        ) : (
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              f.kind === 'off' && 'bg-muted-foreground/40',
              f.kind === 'idle' && 'bg-emerald-500',
              f.kind === 'error' && 'bg-amber-500',
            )}
          />
        )}
        <span className={cn('text-muted-foreground', f.kind === 'error' && 'text-amber-600 dark:text-amber-400')}>
          {f.kind === 'off' && 'Autocomplete off'}
          {f.kind === 'idle' && 'Autocomplete on'}
          {f.kind === 'loading' && 'Thinking…'}
          {f.kind === 'error' && `${f.message} · paused`}
        </span>
        {f.kind !== 'off' && f.latencyMs !== undefined && (
          <span className="tabular-nums text-muted-foreground/70">· {f.latencyMs} ms</span>
        )}
      </span>
    );
  }

  return (
    <div className="flex h-7 min-w-0 items-center justify-between gap-3 border-t bg-muted/30 px-3 text-[11px] dark:bg-muted/20">
      <div className="min-w-0 truncate">{left}</div>
      <div className="flex shrink-0 items-center gap-3 tabular-nums text-muted-foreground/80">
        {editable && !streaming ? (
          <>
            <span data-testid="code-canvas-cursor">
              Ln {s.line}, Col {s.col}
            </span>
            <span className="hidden sm:inline">{indentLabel}</span>
          </>
        ) : (
          <span>
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        )}
      </div>
    </div>
  );
}

export function ResizeHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onKeyDown,
  active,
}: {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  active: boolean;
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize editor (double-click to fit)"
      tabIndex={0}
      className="group/handle absolute inset-x-0 bottom-0 z-10 flex h-3 cursor-row-resize touch-none items-end justify-center outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      data-testid="code-canvas-resize"
    >
      <span
        className={cn(
          'mb-[3px] h-1 w-10 rounded-full bg-muted-foreground/0 transition-colors duration-150',
          'group-hover/handle:bg-muted-foreground/40 group-focus-visible/handle:bg-ring',
          '[@media(pointer:coarse)]:bg-muted-foreground/25',
          active && 'bg-primary/70 group-hover/handle:bg-primary/70',
        )}
      />
    </div>
  );
}
