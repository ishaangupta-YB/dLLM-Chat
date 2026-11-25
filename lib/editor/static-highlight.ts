// Read-only syntax highlighting for the streaming / pre-mount view. Uses the
// same Lezer parser and HighlightStyle as the editor, so the hand-off to
// CodeMirror is visually seamless, without creating an EditorView.
import { Language, LanguageSupport } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { highlightCode } from '@lezer/highlight';
import { canvasHighlightStyle } from './highlight-style';

export interface Token {
  text: string;
  cls: string;
}

export function languageFromExtension(ext: Extension | null): Language | null {
  if (!ext) return null;
  if (ext instanceof LanguageSupport) return ext.language;
  if (ext instanceof Language) return ext;
  return null;
}

/** Splits `code` into lines of highlighted tokens. */
export function highlightLines(code: string, language: Language | null): Token[][] {
  if (!language) return code.split('\n').map((l) => (l ? [{ text: l, cls: '' }] : []));
  const lines: Token[][] = [[]];
  const tree = language.parser.parse(code);
  highlightCode(
    code,
    tree,
    canvasHighlightStyle,
    (text, cls) => {
      lines[lines.length - 1].push({ text, cls });
    },
    () => {
      lines.push([]);
    },
  );
  return lines;
}

/** CSS rules for the HighlightStyle's generated class names. */
export const highlightCss: string = canvasHighlightStyle.module?.getRules() ?? '';
