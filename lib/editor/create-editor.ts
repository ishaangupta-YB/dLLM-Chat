// Imperative CodeMirror factory for the code canvas. Loaded with a dynamic
// import (client only), so CodeMirror never ships in the initial chat bundle
// and never runs during SSR. The canvas owns the returned view's DOM node and
// can move it between the inline card and the maximized overlay without
// losing state (history, selection, ghost text).
import { indentLess, indentMore } from '@codemirror/commands';
import { indentUnit, syntaxHighlighting } from '@codemirror/language';
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  Transaction,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup';
import type { FimFetcher } from './fim-client';
import { fimExtension, programmaticChange } from './fim-extension';
import type { FimStatus } from './fim-logic';
import { canvasHighlightStyle } from './highlight-style';
import { fimLanguageName, indentUnitFor } from './languages';
import { canvasEditorTheme } from './theme';

export interface CanvasEditorOptions {
  doc: string;
  language: string;
  languageExtension: Extension | null;
  dark: boolean;
  fimEnabled: boolean;
  fetcher?: FimFetcher;
  onDocChange?: () => void;
  onSave?: () => void;
  onCursor?: (line: number, col: number) => void;
  onFimStatus?: (s: FimStatus) => void;
  onGhostChange?: (visible: boolean) => void;
}

export interface CanvasEditor {
  view: EditorView;
  getText(): string;
  /** Replace the document programmatically (never triggers autocomplete). */
  setText(text: string, opts?: { undoable?: boolean }): void;
  setDark(dark: boolean): void;
  setFimEnabled(enabled: boolean): void;
  focus(): void;
  destroy(): void;
}

/** Tab: indent selection, or insert one indent unit at each cursor. */
function insertIndent(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly) return false;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  const unit = state.facet(indentUnit);
  view.dispatch(
    state.changeByRange((range) => {
      let insert = unit;
      if (unit !== '\t') {
        // Align to the next tab stop.
        const line = state.doc.lineAt(range.head);
        const col = range.head - line.from;
        insert = ' '.repeat(unit.length - (col % unit.length));
      }
      return {
        changes: { from: range.head, insert },
        range: EditorSelection.cursor(range.head + insert.length),
      };
    }),
    { userEvent: 'input.indent', scrollIntoView: true },
  );
  return true;
}

export function createCanvasEditor(opts: CanvasEditorOptions): CanvasEditor {
  const themeComp = new Compartment();
  const fimComp = new Compartment();
  const unit = indentUnitFor(opts.language);
  const fimLanguage = fimLanguageName(opts.language);

  const fim = () =>
    fimExtension({
      language: fimLanguage,
      fetcher: opts.fetcher,
      onStatus: opts.onFimStatus,
      onGhostChange: opts.onGhostChange,
    });

  const state = EditorState.create({
    doc: opts.doc,
    extensions: [
      basicSetup({
        foldGutter: false,
        autocompletion: false,
        completionKeymap: false,
        lintKeymap: false,
        crosshairCursor: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        tabSize: unit === '\t' ? 4 : unit.length,
      }),
      Prec.high(indentUnit.of(unit)),
      EditorState.tabSize.of(unit === '\t' ? 4 : unit.length),
      syntaxHighlighting(canvasHighlightStyle),
      canvasEditorTheme,
      themeComp.of(EditorView.darkTheme.of(opts.dark)),
      opts.languageExtension ?? [],
      fimComp.of(opts.fimEnabled ? fim() : []),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              opts.onSave?.();
              return true;
            },
          },
        ]),
      ),
      keymap.of([
        { key: 'Tab', run: insertIndent },
        { key: 'Shift-Tab', run: indentLess },
      ]),
      EditorView.contentAttributes.of({
        'aria-label': 'Code editor',
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
        translate: 'no',
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) opts.onDocChange?.();
        if ((u.docChanged || u.selectionSet) && opts.onCursor) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          opts.onCursor(line.number, head - line.from + 1);
        }
      }),
    ],
  });

  const view = new EditorView({ state });
  let fimOn = opts.fimEnabled;

  return {
    view,
    getText: () => view.state.doc.toString(),
    setText(text, o) {
      const cur = view.state.doc.toString();
      if (cur === text) return;
      // Minimal replacement keeps the cursor and scroll position stable.
      let start = 0;
      const max = Math.min(cur.length, text.length);
      while (start < max && cur.charCodeAt(start) === text.charCodeAt(start)) start++;
      let endCur = cur.length;
      let endNew = text.length;
      while (endCur > start && endNew > start && cur.charCodeAt(endCur - 1) === text.charCodeAt(endNew - 1)) {
        endCur--;
        endNew--;
      }
      view.dispatch({
        changes: { from: start, to: endCur, insert: text.slice(start, endNew) },
        annotations: [programmaticChange.of(true), Transaction.addToHistory.of(o?.undoable ?? false)],
      });
    },
    setDark(dark) {
      view.dispatch({ effects: themeComp.reconfigure(EditorView.darkTheme.of(dark)) });
    },
    setFimEnabled(enabled) {
      if (enabled === fimOn) return;
      fimOn = enabled;
      view.dispatch({ effects: fimComp.reconfigure(enabled ? fim() : []) });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
