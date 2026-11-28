"use client";

// Sandboxed preview iframe (see app/preview-frame/route.ts for the CSP side).
//
// - sandbox="allow-scripts allow-forms allow-modals": NEVER allow-same-origin.
//   /preview-frame is same-origin, so allow-same-origin would let the document
//   remove its own sandbox and read the app's storage.
// - Each new document gets a fresh iframe (fresh opaque origin and JS realm).
//   Double-buffered: the next frame loads invisibly and replaces the current one
//   once it has loaded, so live updates don't flash white.
// - Messages are accepted only when event.source is one of our frames' windows
//   (the origin is "null" for every sandboxed frame, so identity is what counts).
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type PreviewLogLevel = "log" | "info" | "warn" | "error";
export interface PreviewLog {
  id: number;
  level: PreviewLogLevel;
  message: string;
  timestamp: number;
}

interface FrameSlot {
  key: number;
  html: string;
}

const SWAP_TIMEOUT_MS = 2500;
const LEVELS = new Set<PreviewLogLevel>(["log", "info", "warn", "error"]);

export interface PreviewFrameProps {
  html: string;
  /** Bump to force a reload of the same document. */
  reloadKey: number;
  /** Console output; `frame` identifies the document that produced it. */
  onLog?: (log: Omit<PreviewLog, "id">, frame: number) => void;
  /** Frame `frame` became visible (logs from older documents are stale). */
  onSwap?: (frame: number) => void;
  /** In-project link clicked inside the preview. */
  onNavigate?: (path: string) => void;
  className?: string;
}

export const PreviewFrame = memo(function PreviewFrame({
  html,
  reloadKey,
  onLog,
  onSwap,
  onNavigate,
  className,
}: PreviewFrameProps) {
  const nextKey = useRef(1);
  const [active, setActive] = useState<FrameSlot>(() => ({ key: 0, html }));
  const [pending, setPending] = useState<FrameSlot | null>(null);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const delivered = useRef(new Set<number>());
  const latest = useRef({ onLog, onSwap, onNavigate });
  latest.current = { onLog, onSwap, onNavigate };
  const shown = useRef({ html, reloadKey });
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // New document or manual reload: load it in a pending frame.
  useEffect(() => {
    if (shown.current.html === html && shown.current.reloadKey === reloadKey) return;
    shown.current = { html, reloadKey };
    setPending({ key: nextKey.current++, html });
  }, [html, reloadKey]);

  const promote = useCallback((key: number) => {
    const p = pendingRef.current;
    if (!p || p.key !== key) return;
    pendingRef.current = null;
    setActive(p);
    setPending(null);
    latest.current.onSwap?.(p.key);
  }, []);

  // Fallback: show the pending frame even if it never reports "loaded"
  // (e.g. a script that blocks the load event).
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => promote(pending.key), SWAP_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending, promote]);

  useEffect(() => {
    const slots = () => [active, pending].filter(Boolean) as FrameSlot[];
    const onMessage = (e: MessageEvent) => {
      if (!e.source) return;
      const slot = slots().find((s) => frames.current.get(s.key)?.contentWindow === e.source);
      if (!slot) return;
      const data = e.data as { type?: unknown; level?: unknown; message?: unknown; path?: unknown } | null;
      if (!data || typeof data.type !== "string") return;
      const win = frames.current.get(slot.key)?.contentWindow;
      switch (data.type) {
        case "preview-ready":
          if (delivered.current.has(slot.key) || !win) return;
          delivered.current.add(slot.key);
          win.postMessage({ type: "render", html: slot.html }, "*");
          break;
        case "preview-loaded":
          if (pending && slot.key === pending.key) promote(slot.key);
          break;
        case "preview-log": {
          // Logs from the visible frame, or the frame about to replace it.
          const level = LEVELS.has(data.level as PreviewLogLevel) ? (data.level as PreviewLogLevel) : "log";
          latest.current.onLog?.({ level, message: String(data.message ?? "").slice(0, 4000), timestamp: Date.now() }, slot.key);
          break;
        }
        case "preview-navigate":
          if (typeof data.path === "string" && slot.key === active.key) latest.current.onNavigate?.(data.path.slice(0, 200));
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active, pending, promote]);

  const slots = [active, pending].filter(Boolean) as FrameSlot[];
  return (
    <div className={cn("relative size-full bg-white", className)}>
      {slots.map((s) => (
        <iframe
          key={s.key}
          ref={(el) => {
            if (el) frames.current.set(s.key, el);
            else {
              frames.current.delete(s.key);
              delivered.current.delete(s.key);
            }
          }}
          src="/preview-frame"
          title="Preview"
          data-testid={s.key === active.key ? "preview-iframe" : "preview-iframe-pending"}
          sandbox="allow-scripts allow-forms allow-modals"
          referrerPolicy="no-referrer"
          allow="clipboard-write"
          className={cn(
            "absolute inset-0 size-full border-0 bg-white",
            s.key === active.key ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={s.key !== active.key}
          tabIndex={s.key === active.key ? undefined : -1}
        />
      ))}
    </div>
  );
});
