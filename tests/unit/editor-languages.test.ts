import { describe, expect, it } from 'vitest';
import { fimLanguageName, indentUnitFor, languageLabel, loadLanguage, normalizeLanguage } from '@/lib/editor/languages';
import { clampHeight, contentHeight } from '@/lib/editor/metrics';
import { createStatusStore } from '@/lib/editor/status-store';

describe('languages', () => {
  it('normalises aliases', () => {
    expect(normalizeLanguage('TS')).toBe('typescript');
    expect(normalizeLanguage('tsx')).toBe('tsx');
    expect(normalizeLanguage('py')).toBe('python');
    expect(normalizeLanguage('c++')).toBe('cpp');
    expect(normalizeLanguage('rs')).toBe('rust');
    expect(normalizeLanguage('bash')).toBe('shell');
    expect(normalizeLanguage('yml')).toBe('yaml');
    expect(normalizeLanguage('md')).toBe('markdown');
    expect(normalizeLanguage('')).toBe('plaintext');
    expect(normalizeLanguage('brainfuck')).toBe('plaintext');
  });
  it('labels languages', () => {
    expect(languageLabel('py')).toBe('Python');
    expect(languageLabel('')).toBe('Text');
    expect(languageLabel('elixir')).toBe('elixir');
  });
  it('picks indentation by convention', () => {
    expect(indentUnitFor('python')).toBe('    ');
    expect(indentUnitFor('ts')).toBe('  ');
    expect(indentUnitFor('go')).toBe('\t');
  });
  it('names the FIM language', () => {
    expect(fimLanguageName('py')).toBe('python');
    expect(fimLanguageName('')).toBe('text');
  });
  it('loads language support for known languages and null for plain text', async () => {
    expect(await loadLanguage('python')).not.toBeNull();
    expect(await loadLanguage('bash')).not.toBeNull();
    expect(await loadLanguage('whatever')).toBeNull();
  });
});

describe('metrics', () => {
  it('computes content height', () => {
    expect(contentHeight(3)).toBe(3 * 20 + 16);
    expect(contentHeight(0)).toBe(20 + 16);
  });
  it('clamps dragged heights', () => {
    expect(clampHeight(50, 1000)).toBe(120);
    expect(clampHeight(500, 1000)).toBe(500);
    expect(clampHeight(5000, 1000)).toBe(800);
  });
});

describe('status store', () => {
  it('notifies only on change', () => {
    const s = createStatusStore();
    let n = 0;
    const off = s.subscribe(() => n++);
    s.set({ line: 1 });
    expect(n).toBe(0);
    s.set({ line: 2, col: 3 });
    expect(n).toBe(1);
    expect(s.get()).toMatchObject({ line: 2, col: 3 });
    off();
    s.set({ line: 9 });
    expect(n).toBe(1);
  });
});
