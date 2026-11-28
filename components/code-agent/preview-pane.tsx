"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, MonitorIcon, TerminalSquareIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildPreviewDocument } from "@/lib/code-agent/bundle";
import { DEVICE_WIDTH, useWorkspaceStore, type ConsoleEntry } from "@/lib/code-agent/workspace-store";
import { cn } from "@/lib/utils";
import { PreviewFrame } from "./preview-frame";

/** Debounce a value; `delay` 0 passes it through on the next tick. */
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function PreviewPane({
  files,
  streaming,
  className,
}: {
  files: Record<string, string>;
  streaming: boolean;
  className?: string;
}) {
  const device = useWorkspaceStore((s) => s.device);
  const reloadKey = useWorkspaceStore((s) => s.reloadKey);
  const page = useWorkspaceStore((s) => s.page);
  const setPage = useWorkspaceStore((s) => s.setPage);
  const addLog = useWorkspaceStore((s) => s.addLog);
  const swapFrame = useWorkspaceStore((s) => s.swapFrame);
  const setHtml = useWorkspaceStore((s) => s.setHtml);

  // Files arrive one tool call at a time; debounce so a burst re-renders once.
  const debouncedFiles = useDebounced(files, streaming ? 450 : 120);
  const doc = useMemo(() => buildPreviewDocument(debouncedFiles, page), [debouncedFiles, page]);
  const html = doc?.html ?? null;

  useEffect(() => {
    setHtml(html);
  }, [html, setHtml]);

  const onNavigate = useCallback(
    (path: string) => {
      if (files[path] != null) setPage(path);
    },
    [files, setPage],
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="relative min-h-0 flex-1 overflow-auto bg-muted/40 dark:bg-muted/20">
        {html ? (
          <div
            className={cn(
              "mx-auto h-full transition-[width] duration-300 ease-out",
              device !== "desktop" && "py-4",
            )}
            style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}
          >
            <div
              className={cn(
                "h-full overflow-hidden bg-white",
                device !== "desktop" && "rounded-xl border border-border/80 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.25)]",
              )}
            >
              <PreviewFrame html={html} reloadKey={reloadKey} onLog={(l, f) => addLog(f, l)} onSwap={swapFrame} onNavigate={onNavigate} />
            </div>
          </div>
        ) : (
          <PreviewEmpty streaming={streaming} />
        )}
      </div>
      <ConsolePanel />
    </div>
  );
}

function PreviewEmpty({ streaming }: { streaming: boolean }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border/80 bg-background shadow-xs">
        <MonitorIcon className={cn("size-5 text-muted-foreground", streaming && "animate-pulse text-primary")} />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-sm">{streaming ? "Building your app…" : "Your preview will appear here"}</p>
        <p className="max-w-72 text-muted-foreground text-xs">
          {streaming
            ? "The preview updates live as files are written."
            : "Describe what you want to build in the chat. The app runs in a secure sandbox."}
        </p>
      </div>
    </div>
  );
}

const LEVEL_STYLE: Record<ConsoleEntry["level"], string> = {
  log: "text-foreground/85",
  info: "text-sky-700 dark:text-sky-300",
  warn: "bg-amber-500/8 text-amber-700 dark:text-amber-300",
  error: "bg-destructive/8 text-destructive",
};

export function ConsolePanel() {
  const open = useWorkspaceStore((s) => s.consoleOpen);
  const setOpen = useWorkspaceStore((s) => s.setConsoleOpen);
  const logs = useWorkspaceStore((s) => s.logs);
  const clear = useWorkspaceStore((s) => s.clearLogs);
  const errors = logs.filter((l) => l.level === "error").length;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (open && el) el.scrollTop = el.scrollHeight;
  }, [logs, open]);

  return (
    <div className="shrink-0 border-border/70 border-t bg-background" data-testid="preview-console">
      <div className="flex h-9 items-center gap-2 px-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-medium text-muted-foreground text-xs hover:text-foreground"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="preview-console-list"
        >
          <TerminalSquareIcon className="size-3.5" />
          Console
          {logs.length > 0 && (
            <Badge variant="secondary" className="h-4 rounded-full px-1.5 font-mono text-[10px]">
              {logs.length}
            </Badge>
          )}
          {errors > 0 && (
            <Badge variant="destructive" className="h-4 rounded-full px-1.5 font-mono text-[10px]">
              {errors} error{errors === 1 ? "" : "s"}
            </Badge>
          )}
          <ChevronDownIcon className={cn("size-3.5 transition-transform", !open && "rotate-180")} />
        </Button>
        {open && logs.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto size-7 text-muted-foreground"
            onClick={clear}
            aria-label="Clear console"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <div
          id="preview-console-list"
          ref={listRef}
          role="log"
          aria-live="polite"
          className="max-h-44 overflow-y-auto border-border/60 border-t font-mono text-[11.5px] leading-5"
        >
          {logs.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">No console output yet.</p>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                data-level={l.level}
                className={cn("flex gap-3 border-border/40 border-b px-3 py-1 last:border-b-0", LEVEL_STYLE[l.level])}
              >
                <span className="shrink-0 text-muted-foreground/70 tabular-nums">
                  {new Date(l.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words">{l.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
