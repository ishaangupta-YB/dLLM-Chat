import 'server-only';
// File tools for the coding agent. They operate on a per-request copy of the
// project files sent by the browser; every mutation is streamed back as a
// `file` event so the client applies it to the project live.
import type { AgentTool, ToolContext } from '@/lib/agent/types';
import { applySearchReplace, byteLength, CODE_LIMITS, sortPaths, validateContent, validatePath } from './files';

export interface FileToolsState {
  files: Record<string, string>;
  /** Paths written or deleted during this request, in order. */
  changed: string[];
}

function markChanged(state: FileToolsState, path: string) {
  if (!state.changed.includes(path)) state.changed.push(path);
}

function fail(msg: string): never {
  throw new Error(msg);
}

const pathParam = { type: 'string', description: 'Relative path, e.g. index.html, styles.css, script.js' };

/** Create the file tools bound to `state` (mutated in place). */
export function createFileTools(state: FileToolsState): AgentTool[] {
  const write_file: AgentTool = {
    name: 'write_file',
    description:
      'Create or overwrite a file with its COMPLETE content. Use for new files and for changes touching a large part of a file. Never abbreviate or use placeholders.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'content'],
      properties: {
        path: pathParam,
        content: { type: 'string', description: 'The full file content.' },
      },
    },
    label: (a) => `Writing ${typeof a.path === 'string' ? a.path : 'file'}`,
    async execute(args, ctx: ToolContext) {
      const p = validatePath(args.path);
      if (!p.ok) fail(p.error);
      const path = (p as { path: string }).path;
      const c = validateContent(args.content);
      if (!c.ok) fail(c.error);
      const content = args.content as string;
      const exists = state.files[path] != null;
      if (!exists && Object.keys(state.files).length >= CODE_LIMITS.maxFiles) {
        fail(`The project already has ${CODE_LIMITS.maxFiles} files (the maximum). Delete or reuse a file.`);
      }
      state.files[path] = content;
      markChanged(state, path);
      ctx.emit({ t: 'file', path, content });
      const lines = content.split('\n').length;
      return {
        content: `${exists ? 'Updated' : 'Created'} ${path} (${lines} lines, ${byteLength(content)} bytes).`,
        display: `${exists ? 'Updated' : 'Created'} ${path} · ${lines} lines`,
      };
    },
  };

  const edit_file: AgentTool = {
    name: 'edit_file',
    description:
      'Replace one exact snippet in an existing file. `search` must match the current file content exactly once (whitespace included); include a few surrounding lines to make it unique. For several separate changes call edit_file several times, or use write_file.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'search', 'replace'],
      properties: {
        path: pathParam,
        search: { type: 'string', description: 'Exact text to find (must occur exactly once).' },
        replace: { type: 'string', description: 'Replacement text.' },
      },
    },
    label: (a) => `Editing ${typeof a.path === 'string' ? a.path : 'file'}`,
    async execute(args, ctx) {
      const p = validatePath(args.path);
      if (!p.ok) fail(p.error);
      const path = (p as { path: string }).path;
      const current = state.files[path];
      if (current == null) fail(`File ${path} does not exist. Use write_file to create it.`);
      if (typeof args.search !== 'string' || typeof args.replace !== 'string') fail('search and replace must be strings.');
      const r = applySearchReplace(current, args.search as string, args.replace as string);
      if (!r.ok) fail(r.error);
      const content = (r as { content: string }).content;
      const c = validateContent(content);
      if (!c.ok) fail(c.error);
      state.files[path] = content;
      markChanged(state, path);
      ctx.emit({ t: 'file', path, content });
      const delta = content.split('\n').length - current.split('\n').length;
      return {
        content: `Edited ${path}.`,
        display: `Edited ${path}${delta ? ` · ${delta > 0 ? '+' : ''}${delta} lines` : ''}`,
      };
    },
  };

  const delete_file: AgentTool = {
    name: 'delete_file',
    description: 'Delete a file from the project.',
    parameters: { type: 'object', additionalProperties: false, required: ['path'], properties: { path: pathParam } },
    label: (a) => `Deleting ${typeof a.path === 'string' ? a.path : 'file'}`,
    async execute(args, ctx) {
      const p = validatePath(args.path);
      if (!p.ok) fail(p.error);
      const path = (p as { path: string }).path;
      if (state.files[path] == null) fail(`File ${path} does not exist.`);
      delete state.files[path];
      markChanged(state, path);
      ctx.emit({ t: 'file', path, deleted: true });
      return { content: `Deleted ${path}.` };
    },
  };

  const read_file: AgentTool = {
    name: 'read_file',
    description: 'Read the current content of a project file.',
    parameters: { type: 'object', additionalProperties: false, required: ['path'], properties: { path: pathParam } },
    label: (a) => `Reading ${typeof a.path === 'string' ? a.path : 'file'}`,
    async execute(args) {
      const p = validatePath(args.path);
      if (!p.ok) fail(p.error);
      const path = (p as { path: string }).path;
      const content = state.files[path];
      if (content == null) fail(`File ${path} does not exist.`);
      return { content, display: `${path} · ${content.split('\n').length} lines` };
    },
  };

  const list_files: AgentTool = {
    name: 'list_files',
    description: 'List the project files with their sizes.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    label: () => 'Listing files',
    async execute() {
      const paths = sortPaths(Object.keys(state.files));
      if (!paths.length) return { content: 'The project is empty.' };
      return {
        content: paths.map((p) => `${p} (${byteLength(state.files[p])} bytes)`).join('\n'),
        display: `${paths.length} file${paths.length === 1 ? '' : 's'}`,
      };
    },
  };

  return [write_file, edit_file, delete_file, read_file, list_files];
}
