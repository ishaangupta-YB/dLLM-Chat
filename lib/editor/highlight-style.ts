// Syntax colors for the code canvas. Colors are CSS variables (--cm-*) set on
// the canvas container for light and dark mode (GitHub Primer palette), so a
// theme switch is a pure CSS change and the editor never reconfigures. The same
// HighlightStyle colors the read-only streaming view.
import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const canvasHighlightStyle = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.moduleKeyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.modifier,
      t.self,
    ],
    color: 'var(--cm-kw)',
  },
  { tag: [t.string, t.special(t.string), t.character, t.docString], color: 'var(--cm-str)' },
  { tag: [t.regexp, t.escape], color: 'var(--cm-re)' },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: 'var(--cm-com)',
    fontStyle: 'italic',
  },
  {
    tag: [
      t.number,
      t.integer,
      t.float,
      t.bool,
      t.null,
      t.atom,
      t.constant(t.variableName),
      t.constant(t.name),
      t.standard(t.variableName),
      t.unit,
    ],
    color: 'var(--cm-num)',
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
      t.macroName,
    ],
    color: 'var(--cm-fn)',
  },
  {
    tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName), t.standard(t.typeName)],
    color: 'var(--cm-type)',
  },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--cm-prop)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--cm-tag)' },
  { tag: [t.meta, t.annotation, t.processingInstruction, t.documentMeta], color: 'var(--cm-meta)' },
  { tag: t.heading, color: 'var(--cm-kw)', fontWeight: '600' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--cm-str)', textDecoration: 'underline' },
  { tag: t.inserted, color: 'var(--cm-ins)' },
  { tag: [t.deleted, t.invalid], color: 'var(--cm-del)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: 'var(--cm-punct)' },
]);
