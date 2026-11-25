"use client";

import { memo, useMemo, useState } from "react";
import { WavesIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Run {
  start: number;
  text: string;
  hot: boolean;
}

/**
 * O(n) positional diff: characters that differ from the previous frame at the
 * same index are "hot". Consecutive chars of the same kind are grouped into a
 * single run so a 5k-char frame becomes a few hundred spans at most.
 */
export function diffRuns(prev: string, next: string): Run[] {
  const runs: Run[] = [];
  const n = next.length;
  if (n === 0) return runs;
  let start = 0;
  let hot = prev.charCodeAt(0) !== next.charCodeAt(0) || prev.length === 0;
  for (let i = 1; i <= n; i++) {
    const h = i < n ? i >= prev.length || prev.charCodeAt(i) !== next.charCodeAt(i) : !hot;
    if (i === n || h !== hot) {
      runs.push({ start, text: next.slice(start, i), hot });
      start = i;
      hot = h;
    }
  }
  return mergeTinyColdRuns(runs);
}

/**
 * Noise flickers: a single unchanged char between two changed runs is visual
 * noise and costs a span. Fold cold runs of 1-2 chars into the surrounding hot
 * run to keep the DOM small.
 */
function mergeTinyColdRuns(runs: Run[]): Run[] {
  if (runs.length < 3) return runs;
  const out: Run[] = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const prev = out[out.length - 1];
    const next = runs[i + 1];
    if (!r.hot && r.text.length <= 2 && prev?.hot && next?.hot) {
      prev.text += r.text + next.text;
      i++;
      continue;
    }
    if (prev && prev.hot === r.hot) {
      prev.text += r.text;
      continue;
    }
    out.push({ ...r });
  }
  return out;
}

export interface DiffusionTextProps {
  text: string;
  className?: string;
}

/**
 * Renders a noisy diffusion frame as plain pre-wrapped text. Each frame
 * replaces the whole canvas; chars that changed since the previous frame glow
 * in the primary color and settle as they stop changing.
 */
export const DiffusionText = memo(function DiffusionText({ text, className }: DiffusionTextProps) {
  // Keep the previous frame in state ("derive state from previous render"),
  // so the diff is computed once per new frame without refs in render.
  const [frames, setFrames] = useState({ prev: "", cur: text, n: 1 });
  if (frames.cur !== text) {
    setFrames({ prev: frames.cur, cur: text, n: frames.n + 1 });
  }

  const runs = useMemo(() => diffRuns(frames.prev, frames.cur), [frames]);
  const hotChars = useMemo(() => runs.reduce((a, r) => (r.hot ? a + r.text.length : a), 0), [runs]);
  const settled = frames.cur.length ? Math.max(0, Math.min(100, Math.round((1 - hotChars / frames.cur.length) * 100))) : 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs" aria-live="off">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
          <WavesIcon className="size-3 animate-pulse" />
          Diffusing
        </span>
        <span className="tabular-nums">step {frames.n}</span>
        <span aria-hidden className="relative h-1 w-20 overflow-hidden rounded-full bg-muted">
          <span
            className="brand-gradient-bg absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out"
            style={{ width: `${settled}%` }}
          />
        </span>
        <span className="tabular-nums">{frames.cur.length.toLocaleString()} chars</span>
      </div>
      <div
        className="diffusion-canvas whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-foreground/90"
        aria-busy="true"
        aria-label="Response is being generated"
      >
        {runs.map((r) =>
          r.hot ? (
            // A new key per frame remounts hot spans so the glow restarts.
            <span key={`h${frames.n}-${r.start}`} className="diffusion-hot">
              {r.text}
            </span>
          ) : (
            <span key={`c${r.start}`} className="diffusion-cold">
              {r.text}
            </span>
          ),
        )}
      </div>
    </div>
  );
});
