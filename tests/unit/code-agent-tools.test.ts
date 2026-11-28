import { describe, expect, it, vi } from 'vitest';
import type { ChatStreamEvent } from '@/lib/chat/protocol';

vi.mock('server-only', () => ({}));

const { createFileTools } = await import('@/lib/code-agent/tools');
const { CODE_LIMITS } = await import('@/lib/code-agent/files');

function setup(files: Record<string, string> = {}) {
  const state = { files: { ...files }, changed: [] as string[] };
  const events: ChatStreamEvent[] = [];
  const tools = Object.fromEntries(createFileTools(state).map((t) => [t.name, t]));
  const ctx = { signal: new AbortController().signal, emit: (e: ChatStreamEvent) => events.push(e) };
  const run = (name: string, args: Record<string, unknown>) => tools[name].execute(args, ctx);
  return { state, events, run, tools };
}

describe('file tools', () => {
  it('exposes the expected tools with valid names', () => {
    const { tools } = setup();
    expect(Object.keys(tools).sort()).toEqual(['delete_file', 'edit_file', 'list_files', 'read_file', 'write_file']);
  });

  it('write_file creates and emits a file event', async () => {
    const { state, events, run } = setup();
    const r = await run('write_file', { path: './index.html', content: '<h1>Hi</h1>' });
    expect(r.content).toMatch(/Created index.html/);
    expect(state.files['index.html']).toBe('<h1>Hi</h1>');
    expect(state.changed).toEqual(['index.html']);
    expect(events).toEqual([{ t: 'file', path: 'index.html', content: '<h1>Hi</h1>' }]);
  });

  it('write_file rejects bad paths and oversize files', async () => {
    const { run, events } = setup();
    await expect(run('write_file', { path: '../x.html', content: '' })).rejects.toThrow(/\.\./);
    await expect(run('write_file', { path: 'x.php', content: '' })).rejects.toThrow(/Unsupported/);
    await expect(run('write_file', { path: 'x.js', content: 'a'.repeat(CODE_LIMITS.maxFileBytes + 1) })).rejects.toThrow(/larger/);
    expect(events).toHaveLength(0);
  });

  it('write_file enforces the file count limit (overwrites allowed)', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < CODE_LIMITS.maxFiles; i++) files[`f${i}.js`] = '';
    const { run } = setup(files);
    await expect(run('write_file', { path: 'new.js', content: '' })).rejects.toThrow(/maximum/);
    await expect(run('write_file', { path: 'f1.js', content: 'ok' })).resolves.toBeTruthy();
  });

  it('edit_file applies a unique search/replace', async () => {
    const { state, events, run } = setup({ 'app.js': 'let n = 0;\nn++;\n' });
    await run('edit_file', { path: 'app.js', search: 'let n = 0;', replace: 'let n = 10;' });
    expect(state.files['app.js']).toBe('let n = 10;\nn++;\n');
    expect(events[0]).toEqual({ t: 'file', path: 'app.js', content: 'let n = 10;\nn++;\n' });
  });

  it('edit_file fails on missing file, no match and ambiguous match without changing anything', async () => {
    const { state, events, run } = setup({ 'a.css': '.x{}\n.x{}\n' });
    await expect(run('edit_file', { path: 'b.css', search: 'a', replace: 'b' })).rejects.toThrow(/does not exist/);
    await expect(run('edit_file', { path: 'a.css', search: '.y{}', replace: '' })).rejects.toThrow(/not found/);
    await expect(run('edit_file', { path: 'a.css', search: '.x{}', replace: '' })).rejects.toThrow(/more than once/);
    expect(state.files['a.css']).toBe('.x{}\n.x{}\n');
    expect(events).toHaveLength(0);
  });

  it('delete_file removes and emits deleted', async () => {
    const { state, events, run } = setup({ 'a.js': '1' });
    await run('delete_file', { path: 'a.js' });
    expect(state.files).toEqual({});
    expect(events).toEqual([{ t: 'file', path: 'a.js', deleted: true }]);
    await expect(run('delete_file', { path: 'a.js' })).rejects.toThrow(/does not exist/);
  });

  it('read_file and list_files', async () => {
    const { run } = setup({ 'styles.css': 'body{}', 'index.html': '<p>' });
    expect((await run('read_file', { path: 'styles.css' })).content).toBe('body{}');
    const list = (await run('list_files', {})).content;
    expect(list.split('\n')[0]).toMatch(/^index.html/);
    await expect(setup().run('list_files', {})).resolves.toMatchObject({ content: 'The project is empty.' });
  });
});
