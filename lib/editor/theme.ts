// Editor chrome that blends with the shadcn tokens (CSS variables), so it
// follows light/dark automatically. Metrics (13px / 20px line height / 8px
// vertical padding) are mirrored by the read-only StaticCodeView so swapping
// one for the other causes no layout shift.
import { EditorView } from '@codemirror/view';
import { CANVAS_FONT, CANVAS_LINE_HEIGHT, CANVAS_VPAD } from './metrics';

const mix = (v: string, pct: number) => `color-mix(in oklab, var(${v}) ${pct}%, transparent)`;

export const canvasEditorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    color: 'var(--foreground)',
    backgroundColor: 'transparent',
    height: '100%',
    maxHeight: 'inherit',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: CANVAS_FONT,
    lineHeight: `${CANVAS_LINE_HEIGHT}px`,
    overflow: 'auto',
    overscrollBehavior: 'contain',
  },
  '.cm-content': {
    padding: `${CANVAS_VPAD}px 0`,
    caretColor: 'var(--foreground)',
  },
  '.cm-line': { padding: '0 16px 0 6px' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: mix('--muted-foreground', 70),
    border: 'none',
    paddingLeft: '4px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 12px 0 8px',
    minWidth: '32px',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-activeLine': { backgroundColor: mix('--muted', 60) },
  '&:not(.cm-focused) .cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: `${mix('--primary', 30)} !important` },
  '.cm-selectionMatch': { backgroundColor: mix('--primary', 14) },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: mix('--primary', 22),
    outline: `1px solid ${mix('--primary', 45)}`,
    borderRadius: '2px',
  },
  '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: mix('--destructive', 25) },
  '.cm-searchMatch': { backgroundColor: 'rgba(250, 204, 21, 0.28)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(250, 204, 21, 0.55)' },
  '.cm-panels': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    fontSize: '12px',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-panel.cm-search': { padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' },
  '.cm-panel.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' },
  '.cm-panel.cm-search [name=close]': { right: '8px', top: '6px', fontSize: '16px', cursor: 'pointer' },
  '.cm-textfield': {
    backgroundColor: 'var(--background)',
    border: '1px solid var(--input)',
    borderRadius: '6px',
    padding: '3px 6px',
    fontSize: '12px',
    color: 'var(--foreground)',
    outline: 'none',
  },
  '.cm-textfield:focus': { borderColor: 'var(--ring)', boxShadow: `0 0 0 2px ${mix('--ring', 35)}` },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--secondary)',
    color: 'var(--secondary-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '12px',
    textTransform: 'capitalize',
  },
  '.cm-button:active': { backgroundImage: 'none', backgroundColor: 'var(--accent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--muted)',
    border: 'none',
    color: 'var(--muted-foreground)',
    padding: '0 6px',
    borderRadius: '4px',
  },
  '.cm-specialChar': { color: 'var(--destructive)' },
});
