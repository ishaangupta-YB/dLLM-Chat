import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state';
import { ghostField, programmaticChange, setGhost } from '@/lib/editor/fim-extension';

function stateWithGhost(doc: string, pos: number, text: string) {
  const s = EditorState.create({ doc, selection: EditorSelection.cursor(pos), extensions: [ghostField] });
  return s.update({ effects: setGhost.of({ pos, text }) }).state;
}

describe('ghostField', () => {
  it('consumes typed characters that match the suggestion', () => {
    const s = stateWithGhost('print(', 6, '"hi")');
    const tr = s.update({ changes: { from: 6, insert: '"' }, selection: EditorSelection.cursor(7), userEvent: 'input.type' });
    expect(tr.state.field(ghostField)).toEqual({ pos: 7, text: 'hi")' });
  });
  it('clears on a non-matching character', () => {
    const s = stateWithGhost('print(', 6, '"hi")');
    const tr = s.update({ changes: { from: 6, insert: 'x' }, selection: EditorSelection.cursor(7) });
    expect(tr.state.field(ghostField)).toBeNull();
  });
  it('clears when fully typed', () => {
    const s = stateWithGhost('a', 1, 'b');
    const tr = s.update({ changes: { from: 1, insert: 'b' }, selection: EditorSelection.cursor(2) });
    expect(tr.state.field(ghostField)).toBeNull();
  });
  it('clears on cursor movement and programmatic changes', () => {
    const s = stateWithGhost('abc', 3, 'def');
    expect(s.update({ selection: EditorSelection.cursor(1) }).state.field(ghostField)).toBeNull();
    const tr = s.update({ changes: { from: 3, insert: 'd' }, annotations: programmaticChange.of(true) });
    expect(tr.state.field(ghostField)).toBeNull();
  });
  it('survives unrelated effects', () => {
    const s = stateWithGhost('abc', 3, 'def');
    const other = StateEffect.define<number>();
    expect(s.update({ effects: other.of(1) }).state.field(ghostField)).toEqual({ pos: 3, text: 'def' });
  });
});
