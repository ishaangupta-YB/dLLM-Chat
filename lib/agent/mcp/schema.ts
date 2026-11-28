// Pure helpers that turn MCP tool definitions and results into what Mercury
// (OpenAI function calling) accepts. No server-only import: unit tested.
import type { JsonSchema } from '../types';

export const MAX_TOOL_NAME = 64;
export const MAX_DESCRIPTION_CHARS = 1000;
export const MAX_SCHEMA_CHARS = 8000;
export const MAX_RESULT_CHARS = 12_000;

function hash36(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(0, 6);
}

/** A short slug for a server id/name: [a-z0-9-], at most `max` chars. */
export function slugify(s: string, max = 20): string {
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
  return out || 'server';
}

/**
 * OpenAI-safe tool name `${server}__${tool}`: chars outside [a-zA-Z0-9_-]
 * become `_`; names over 64 chars are cut and suffixed with a stable hash.
 */
export function toolName(server: string, tool: string): string {
  const s = `${server}__${tool}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (s.length <= MAX_TOOL_NAME) return s;
  return `${s.slice(0, MAX_TOOL_NAME - 7)}_${hash36(s)}`;
}

const DROP_KEYS = new Set(['$schema', '$id', '$comment', '$defs', 'definitions', 'examples', 'default']);
type Obj = Record<string, unknown>;

/**
 * Normalise an MCP inputSchema to an OpenAI `parameters` object: inline
 * local $refs (depth- and cycle-guarded), drop $schema/$defs/x-* and other
 * noise, and guarantee a root `{type:'object', properties:{}}`.
 */
export function normalizeSchema(schema: unknown): JsonSchema {
  const root = (schema && typeof schema === 'object' ? schema : {}) as Obj;
  const defs = { ...((root.definitions as Obj) ?? {}), ...((root.$defs as Obj) ?? {}) };
  const active = new Set<string>();

  const walk = (node: unknown, depth: number): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, depth));
    if (!node || typeof node !== 'object') return node;
    const n = node as Obj;
    if (typeof n.$ref === 'string') {
      const m = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(n.$ref);
      const key = m?.[1];
      if (!key || depth > 8 || active.has(key) || !defs[key]) {
        return typeof n.description === 'string' ? { type: 'object', description: n.description } : { type: 'object' };
      }
      active.add(key);
      const resolved = walk(defs[key], depth + 1) as Obj;
      active.delete(key);
      return typeof n.description === 'string' ? { ...resolved, description: n.description } : resolved;
    }
    const out: Obj = {};
    for (const [k, v] of Object.entries(n)) {
      if (DROP_KEYS.has(k) || k.startsWith('x-')) continue;
      // `properties` maps names to schemas: keep every name, walk the values.
      if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
        const props: Obj = {};
        for (const [pk, pv] of Object.entries(v as Obj)) props[pk] = walk(pv, depth);
        out[k] = props;
        continue;
      }
      out[k] = walk(v, depth);
    }
    // Collapse anyOf [X, {type:null}] to X (optional params): more robust.
    if (Array.isArray(out.anyOf)) {
      const nonNull = (out.anyOf as Obj[]).filter((s) => !(s && s.type === 'null'));
      if (nonNull.length === 1 && out.anyOf.length === 2) {
        const { anyOf: _drop, ...rest } = out;
        void _drop;
        return { ...nonNull[0], ...rest };
      }
    }
    return out;
  };

  const out = walk(root, 0) as Obj;
  if (out.type !== 'object') {
    if (!out.properties || typeof out.properties !== 'object') {
      return { type: 'object', properties: { input: out }, required: ['input'] };
    }
    out.type = 'object';
  }
  if (!out.properties || typeof out.properties !== 'object') out.properties = {};
  if (out.required && !Array.isArray(out.required)) delete out.required;
  return out as JsonSchema;
}

/** Strip control characters and cap length (server text goes into the prompt). */
export function cleanDescription(text: unknown, max = MAX_DESCRIPTION_CHARS): string {
  const s = typeof text === 'string' ? text : '';
  const flat = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').replace(/\s{3,}/g, '\n\n').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface McpContentBlock {
  type: string;
  text?: string;
  uri?: string;
  name?: string;
  title?: string;
  resource?: { text?: string; uri?: string };
}

/** Flatten an MCP CallToolResult to text (Mercury is text-only). */
export function flattenResult(res: unknown, max = MAX_RESULT_CHARS): { text: string; isError: boolean } {
  const r = (res ?? {}) as { content?: McpContentBlock[]; structuredContent?: unknown; isError?: boolean };
  const parts = (Array.isArray(r.content) ? r.content : []).map((c) => {
    if (c.type === 'text') return c.text ?? '';
    if (c.type === 'resource_link') return `${c.title ?? c.name ?? 'link'}: ${c.uri ?? ''}`;
    if (c.type === 'resource' && typeof c.resource?.text === 'string') return c.resource.text;
    return `[${c.type} omitted]`;
  });
  let text = parts.join('\n').trim();
  if (!text && r.structuredContent !== undefined) {
    try {
      text = JSON.stringify(r.structuredContent);
    } catch {
      text = '';
    }
  }
  if (r.isError) text = `Tool error: ${text || 'unknown error'}`;
  return { text: truncateText(text, max), isError: !!r.isError };
}

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} of ${text.length} chars]`;
}

/** Delimit third-party output so the model treats it as data. */
export function wrapUntrusted(source: string, text: string): string {
  const safeSource = source.replace(/[^a-zA-Z0-9:_-]/g, '_');
  // Neutralise a closing tag inside the payload so it cannot break out.
  const body = text.replace(/<\/tool_result>/gi, '<\\/tool_result>');
  return `<tool_result source="${safeSource}" untrusted="true">\n${body}\n</tool_result>`;
}
