// Shared editor metrics (no CodeMirror imports, safe for the light static view).
export const CANVAS_LINE_HEIGHT = 20;
export const CANVAS_VPAD = 8;
export const CANVAS_FONT =
  'var(--font-geist-mono), ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
/** Auto height cap before the user resizes. */
export const CANVAS_AUTO_MAX_HEIGHT = 420;
export const CANVAS_MIN_HEIGHT = 120;

/** Natural height of `lineCount` lines including vertical padding. */
export function contentHeight(lineCount: number): number {
  return Math.max(1, lineCount) * CANVAS_LINE_HEIGHT + CANVAS_VPAD * 2;
}

/** Clamp a dragged height to [min, 80% of the viewport]. */
export function clampHeight(h: number, viewportHeight: number): number {
  const max = Math.max(CANVAS_MIN_HEIGHT, Math.round(viewportHeight * 0.8));
  return Math.round(Math.min(max, Math.max(CANVAS_MIN_HEIGHT, h)));
}
