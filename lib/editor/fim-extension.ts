// CodeMirror 6 extension: FIM ghost-text autocomplete backed by /api/fim
// (Mercury Edit). Pure decisions live in ./fim-logic.ts.
//
//   ghostField     StateField<{pos,text}|null>, consumed as the user types matching chars
//   decorations    inline widget for the first line + block widget for the remaining lines
//   FimPlugin      debounced fetch after user input, AbortController, stale-response guard,
//                  error back-off, status reporting
//   keymap         Tab accept / Mod-Right accept word / Esc dismiss / Alt-\ trigger
import {
  Annotation,
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { fetchFimCompletion, type FimFetcher } from './fim-client';
import {
  FIM_DEBOUNCE_MS,
  backoffMs,
  consumeTyped,
  fimErrorLabel,
  fimSkipReason,
  nextWordChunk,
  planFimRequest,
  postProcessSuggestion,
  type FimErrorInfo,
  type FimStatus,
} from './fim-logic';

export interface Ghost {
  pos: number;
  text: string;
}

/** Marks programmatic changes (external sync, reset) that must never trigger autocomplete. */
export const programmaticChange = Annotation.define<boolean>();

/** Sets or clears the ghost suggestion (exported for tests). */
export const setGhost = StateEffect.define<Ghost | null>();

export const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value;
    if (!value) return null;
    if (tr.docChanged) {
      if (tr.annotation(programmaticChange)) return null;
      // Keep the suggestion only if the change is a single pure insertion at the
      // ghost position that matches the suggestion's next characters.
      const acc = { typed: null as string | null, ok: true };
      tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        if (acc.typed !== null || fromA !== value.pos || toA !== fromA) acc.ok = false;
        else acc.typed = inserted.toString();
      });
      if (!acc.ok || acc.typed === null) return null;
      const rest = consumeTyped(value.text, acc.typed);
      if (!rest) return null;
      const pos = value.pos + acc.typed.length;
      const sel = tr.state.selection.main;
      if (!sel.empty || sel.head !== pos || tr.state.selection.ranges.length > 1) return null;
      return { pos, text: rest };
    }
    if (tr.selection) {
      const sel = tr.state.selection.main;
      if (!sel.empty || sel.head !== value.pos) return null;
    }
    return value;
  },
});

export function currentGhost(state: EditorState): Ghost | null {
  return state.field(ghostField, false) ?? null;
}

// ---------------------------------------------------------------- widgets

const isTouch = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

function hintPill(view: EditorView): HTMLElement {
  const pill = document.createElement('span');
  pill.className = 'cm-fim-hint';
  pill.setAttribute('aria-hidden', 'true');
  pill.textContent = isTouch() ? 'Accept' : 'Tab';
  pill.title = 'Accept suggestion (Tab)';
  // Keep editor focus; accept on press (works for mouse and touch).
  pill.addEventListener('mousedown', (e) => e.preventDefault());
  pill.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    acceptGhost(view);
    view.focus();
  });
  return pill;
}

class InlineGhostWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly withHint: boolean,
  ) {
    super();
  }
  eq(other: InlineGhostWidget) {
    return other.text === this.text && other.withHint === this.withHint;
  }
  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = 'cm-fim-ghost';
    span.setAttribute('aria-hidden', 'true');
    span.setAttribute('data-testid', 'fim-ghost');
    span.textContent = this.text;
    if (this.withHint) span.appendChild(hintPill(view));
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

class BlockGhostWidget extends WidgetType {
  constructor(readonly lines: string[]) {
    super();
  }
  eq(other: BlockGhostWidget) {
    return other.lines.length === this.lines.length && other.lines.every((l, i) => l === this.lines[i]);
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-fim-ghost-block';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.setAttribute('data-testid', 'fim-ghost-block');
    this.lines.forEach((line, i) => {
      const div = document.createElement('div');
      div.className = 'cm-fim-ghost-line';
      div.textContent = line || '​';
      if (i === this.lines.length - 1) div.appendChild(hintPill(view));
      wrap.appendChild(div);
    });
    return wrap;
  }
  get estimatedHeight() {
    return this.lines.length * 20;
  }
  ignoreEvent() {
    return true;
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const g = currentGhost(state);
  if (!g || g.pos > state.doc.length) return Decoration.none;
  const [first, ...rest] = g.text.split('\n');
  const ranges: Range<Decoration>[] = [];
  const line = state.doc.lineAt(g.pos);
  // The clickable hint pill only at line end, so it never splits existing text.
  const atLineEnd = !state.sliceDoc(g.pos, line.to).trim();
  if (first) {
    ranges.push(
      Decoration.widget({ widget: new InlineGhostWidget(first, rest.length === 0 && atLineEnd), side: 1 }).range(g.pos),
    );
  }
  if (rest.length) {
    ranges.push(
      Decoration.widget({ widget: new BlockGhostWidget(rest), side: 1, block: true }).range(line.to),
    );
  }
  return Decoration.set(ranges, true);
}

const ghostDecorations = EditorView.decorations.compute([ghostField], buildDecorations);

// ---------------------------------------------------------------- commands

export function acceptGhost(view: EditorView): boolean {
  const g = currentGhost(view.state);
  if (!g) return false;
  view.dispatch({
    changes: { from: g.pos, insert: g.text },
    selection: EditorSelection.cursor(g.pos + g.text.length),
    effects: setGhost.of(null),
    userEvent: 'input.complete',
    scrollIntoView: true,
  });
  return true;
}

export function acceptGhostWord(view: EditorView): boolean {
  const g = currentGhost(view.state);
  if (!g) return false;
  const chunk = nextWordChunk(g.text);
  if (!chunk) return false;
  // The ghost field consumes the inserted prefix and keeps the remainder visible.
  view.dispatch({
    changes: { from: g.pos, insert: chunk },
    selection: EditorSelection.cursor(g.pos + chunk.length),
    userEvent: 'input.complete',
    scrollIntoView: true,
  });
  return true;
}

export function dismissGhost(view: EditorView): boolean {
  if (!currentGhost(view.state)) return false;
  view.dispatch({ effects: setGhost.of(null) });
  return true;
}

// ---------------------------------------------------------------- plugin

export interface FimConfig {
  /** Language name sent to the API (informational). */
  language: string;
  fetcher?: FimFetcher;
  debounceMs?: number;
  onStatus?: (status: FimStatus) => void;
  onGhostChange?: (visible: boolean) => void;
}

function isUserEdit(u: ViewUpdate): boolean {
  return u.transactions.some(
    (tr) =>
      tr.docChanged &&
      !tr.annotation(programmaticChange) &&
      (tr.isUserEvent('input') || tr.isUserEvent('delete')),
  );
}

/** Per-plugin trigger hook so the Alt-\ command can reach the instance. */
const triggers = new WeakMap<EditorView, () => void>();

class FimPlugin {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private latencyMs: number | undefined;
  private consecutiveErrors = 0;
  private backoffUntil = 0;
  private ghostVisible = false;
  private destroyed = false;

  constructor(
    private readonly view: EditorView,
    private readonly cfg: FimConfig,
    initialLatency: number | undefined,
  ) {
    this.latencyMs = initialLatency;
    this.emit({ kind: 'idle', latencyMs: this.latencyMs });
    triggers.set(view, () => this.run(true));
  }

  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet || (u.focusChanged && !u.view.hasFocus)) {
      this.cancel();
    }
    const ghost = currentGhost(u.state);
    const visible = ghost !== null;
    if (visible !== this.ghostVisible) {
      this.ghostVisible = visible;
      this.cfg.onGhostChange?.(visible);
    }
    if (u.focusChanged && !u.view.hasFocus && ghost) {
      // Dispatching inside an update is not allowed; defer.
      setTimeout(() => {
        if (!this.destroyed) dismissGhost(this.view);
      }, 0);
      return;
    }
    if (isUserEdit(u) && !ghost) this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run(false);
    }, this.cfg.debounceMs ?? FIM_DEBOUNCE_MS);
  }

  private cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
      this.emitIdle();
    }
  }

  private run(explicit: boolean) {
    if (this.destroyed) return;
    const { view } = this;
    const state = view.state;
    const sel = state.selection.main;
    const reason = fimSkipReason({
      enabled: true,
      focused: view.hasFocus,
      selectionEmpty: sel.empty && state.selection.ranges.length === 1,
      docLength: state.doc.length,
      charAfter: explicit ? '' : state.sliceDoc(sel.head, sel.head + 1),
      backoffUntil: explicit ? 0 : this.backoffUntil,
      now: Date.now(),
      composing: view.composing,
    });
    if (reason) return;

    this.cancel();
    const reqDoc = state.doc;
    const reqPos = sel.head;
    const plan = planFimRequest({ doc: state.doc.toString(), pos: reqPos });
    const controller = new AbortController();
    this.controller = controller;
    const started = performance.now();
    this.emit({ kind: 'loading', latencyMs: this.latencyMs });

    const fetcher = this.cfg.fetcher ?? fetchFimCompletion;
    fetcher(
      { prompt: plan.prompt, suffix: plan.suffix, language: this.cfg.language, maxTokens: plan.maxTokens, ...(plan.mode === 'inline' ? { stop: ['\n'] } : {}) },
      controller.signal,
    ).then(
      (res) => {
        if (this.destroyed || controller.signal.aborted || this.controller !== controller) return;
        this.controller = null;
        this.consecutiveErrors = 0;
        this.latencyMs = Math.round(performance.now() - started);
        this.emitIdle();
        // Stale guard: the document or cursor moved while the request was in flight.
        if (view.state.doc !== reqDoc || view.state.selection.main.head !== reqPos) return;
        if (!view.hasFocus) return;
        const text = postProcessSuggestion(res.text, {
          suffix: plan.suffix,
          lineAfter: plan.lineAfter,
          mode: plan.mode,
        });
        if (!text) return;
        view.dispatch({ effects: setGhost.of({ pos: reqPos, text }) });
      },
      (err: unknown) => {
        if (this.destroyed || controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (this.controller !== controller) return;
        this.controller = null;
        this.consecutiveErrors++;
        const info: FimErrorInfo =
          err && typeof err === 'object' && 'status' in err
            ? (err as FimErrorInfo)
            : { status: 0 };
        const ms = backoffMs(info, this.consecutiveErrors);
        this.backoffUntil = Date.now() + ms;
        this.emit({ kind: 'error', message: fimErrorLabel(info), until: this.backoffUntil, latencyMs: this.latencyMs });
        if (this.statusTimer) clearTimeout(this.statusTimer);
        this.statusTimer = setTimeout(() => this.emitIdle(), ms);
      },
    );
  }

  private emitIdle() {
    if (Date.now() < this.backoffUntil) return; // keep showing the error state
    this.emit({ kind: 'idle', latencyMs: this.latencyMs });
  }

  private emit(s: FimStatus) {
    if (!this.destroyed) this.cfg.onStatus?.(s);
  }

  get lastLatency() {
    return this.latencyMs;
  }

  destroy() {
    this.cancel();
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.destroyed = true;
    triggers.delete(this.view);
    if (this.ghostVisible) this.cfg.onGhostChange?.(false);
  }
}

function triggerFim(view: EditorView): boolean {
  const t = triggers.get(view);
  if (!t) return false;
  t();
  return true;
}

const ghostTheme = EditorView.baseTheme({
  '.cm-fim-ghost, .cm-fim-ghost-line': {
    color: 'color-mix(in oklab, var(--muted-foreground) 88%, transparent)',
    fontStyle: 'italic',
    pointerEvents: 'none',
    whiteSpace: 'pre',
  },
  '.cm-fim-ghost-block': {
    padding: '0 16px 0 6px',
    animation: 'cm-fim-in 120ms ease-out',
  },
  '.cm-fim-ghost': { animation: 'cm-fim-in 120ms ease-out' },
  '.cm-fim-hint': {
    pointerEvents: 'auto',
    cursor: 'pointer',
    display: 'inline-block',
    marginLeft: '8px',
    padding: '0 5px',
    fontStyle: 'normal',
    fontSize: '10px',
    lineHeight: '15px',
    verticalAlign: '1px',
    fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    color: 'var(--muted-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    backgroundColor: 'var(--background)',
    userSelect: 'none',
  },
  '.cm-fim-hint:hover': { color: 'var(--foreground)', borderColor: 'var(--ring)' },
  '@keyframes cm-fim-in': { from: { opacity: '0' }, to: { opacity: '1' } },
});

/** Shared across plugin instances so re-enabling keeps the last latency. */
let sharedLastLatency: number | undefined;

/** Full FIM extension. Put it in a Compartment to toggle it live. */
export function fimExtension(cfg: FimConfig): Extension {
  return [
    ghostField,
    ghostDecorations,
    ghostTheme,
    ViewPlugin.define((view) => {
      const p = new FimPlugin(view, {
        ...cfg,
        onStatus: (s) => {
          if (s.kind !== 'off' && s.latencyMs !== undefined) sharedLastLatency = s.latencyMs;
          cfg.onStatus?.(s);
        },
      }, sharedLastLatency);
      return p;
    }),
    Prec.highest(
      keymap.of([
        { key: 'Tab', run: acceptGhost },
        { key: 'Mod-ArrowRight', run: acceptGhostWord },
        { key: 'Escape', run: dismissGhost },
        { key: 'Alt-\\', run: triggerFim },
      ]),
    ),
  ];
}
