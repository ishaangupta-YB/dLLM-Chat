import 'server-only';
// MCP client pool for one chat request. Tool lists are cached per server in
// module scope (warm lambda, ~10 min) so most turns build `tools[]` without a
// network round trip; a server is connected lazily on its first tool call.
// Every connection opened by the pool is closed in `close()`.
import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport, type Tool } from '@modelcontextprotocol/client';
import type { AgentTool } from '../types';
import { findSsrfError, safeFetch } from '../net/safe-fetch';
import { checkUrl, sanitizeAuthHeader } from '../net/ssrf';
import { cleanDescription, flattenResult, MAX_SCHEMA_CHARS, normalizeSchema, toolName, wrapUntrusted } from './schema';

export const MAX_TOOLS_PER_SERVER = 20;
export const MAX_MCP_TOOLS_TOTAL = 40;
const LIST_TTL_MS = 10 * 60_000;
const CONNECT_TIMEOUT_MS = 8_000;
const CALL_TIMEOUT_MS = 25_000;

export interface McpServerSpec {
  /** Tool-name prefix, [a-z0-9-]. */
  prefix: string;
  /** 'mcp:<id>' (curated id or custom server id), shown in the UI. */
  source: string;
  name: string;
  url: string;
  /** User-added server: SSRF-guarded fetch, no allow-listing. */
  custom: boolean;
  authHeader?: string;
  hiddenTools?: string[];
}

interface CachedList {
  expires: number;
  tools: Tool[];
}
const listCache = new Map<string, CachedList>();

function cacheKey(spec: McpServerSpec) {
  const auth = spec.authHeader ? createHash('sha256').update(spec.authHeader).digest('hex').slice(0, 16) : '';
  return `${spec.url}#${auth}`;
}

/** User-facing error text for MCP connection failures (never echoes headers). */
export function describeMcpError(err: unknown): string {
  const ssrf = findSsrfError(err);
  if (ssrf) return ssrf.message;
  const e = err as { name?: string; message?: string; status?: number; code?: string; data?: { status?: number } };
  const status = e?.status ?? e?.data?.status;
  if (e?.name === 'UnauthorizedError' || status === 401 || status === 403) {
    return 'The server requires authentication. OAuth sign-in is not supported; add a token as the auth header.';
  }
  if (status === 404 || status === 405) return 'No MCP endpoint at that URL (check the path, often /mcp).';
  if (status === 410) return 'This endpoint is gone (legacy SSE endpoints are not supported; try /mcp).';
  if (e?.name === 'AbortError' || /timed? ?out|timeout/i.test(e?.message ?? '')) return 'The server did not respond in time.';
  const msg = (e?.message ?? 'Connection failed.').replace(/\s+/g, ' ');
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}

function authValue(raw: string | undefined): string | undefined {
  const v = sanitizeAuthHeader(raw);
  if (!v) return undefined;
  // A bare token is sent as a bearer token; "Bearer x" / "Basic x" as given.
  return /\s/.test(v) ? v : `Bearer ${v}`;
}

interface Connection {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

/** Open a connection (SSRF-checked for custom servers). */
export async function connectServer(spec: McpServerSpec, signal?: AbortSignal): Promise<Connection> {
  const url = spec.custom ? checkUrl(spec.url) : new URL(spec.url);
  const headers: Record<string, string> = {};
  const auth = spec.custom ? authValue(spec.authHeader) : undefined;
  if (auth) headers.Authorization = auth;
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
    fetch: spec.custom ? safeFetch : undefined,
    redirectPolicy: 'same-origin',
  });
  const client = new Client({ name: 'dllm-chat', version: '2.0.0' }, { versionNegotiation: { mode: 'auto' }, listMaxPages: 4 });
  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS, signal });
  } catch (err) {
    client.close().catch(() => {});
    throw err;
  }
  return { client, transport };
}

export async function closeConnection(conn: Connection) {
  await Promise.race([
    conn.transport.terminateSession().catch(() => {}),
    new Promise((r) => setTimeout(r, 1_000)),
  ]);
  await conn.client.close().catch(() => {});
}

export class McpPool {
  private conns = new Map<string, Promise<Connection>>();
  constructor(private signal: AbortSignal) {}

  private connect(spec: McpServerSpec): Promise<Connection> {
    const key = cacheKey(spec);
    let p = this.conns.get(key);
    if (!p) {
      p = connectServer(spec, this.signal);
      // Forget failed attempts so a later call can retry.
      p.catch(() => this.conns.delete(key));
      this.conns.set(key, p);
    }
    return p;
  }

  async listTools(spec: McpServerSpec): Promise<Tool[]> {
    const key = cacheKey(spec);
    const hit = listCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.tools;
    const { client } = await this.connect(spec);
    const res = await client.listTools(undefined, { timeout: CONNECT_TIMEOUT_MS, signal: this.signal });
    const tools = (res.tools ?? []) as Tool[];
    listCache.set(key, { expires: Date.now() + LIST_TTL_MS, tools });
    if (listCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of listCache) if (v.expires <= now) listCache.delete(k);
    }
    return tools;
  }

  async call(spec: McpServerSpec, name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const { client } = await this.connect(spec);
    return client.callTool({ name, arguments: args }, { timeout: CALL_TIMEOUT_MS, signal });
  }

  async close() {
    const all = [...this.conns.values()];
    this.conns.clear();
    await Promise.allSettled(
      all.map(async (p) => {
        const c = await p;
        await closeConnection(c);
      }),
    );
  }
}

function humanize(name: string) {
  return name.replace(/[_-]+/g, ' ').trim();
}

/** Convert one server's MCP tools to AgentTools routed through the pool. */
export function toAgentTools(
  spec: McpServerSpec,
  tools: Tool[],
  pool: McpPool,
  taken: Set<string>,
  exclude: Set<string> = new Set(),
): AgentTool[] {
  const out: AgentTool[] = [];
  const hidden = new Set(spec.hiddenTools ?? []);
  for (const t of tools) {
    if (out.length >= MAX_TOOLS_PER_SERVER) break;
    if (!t?.name || hidden.has(t.name) || exclude.has(t.name)) continue;
    const name = toolName(spec.prefix, t.name);
    if (taken.has(name)) continue;
    const parameters = normalizeSchema(t.inputSchema);
    if (JSON.stringify(parameters).length > MAX_SCHEMA_CHARS) continue;
    taken.add(name);
    const mcpName = t.name;
    const title = (t as { title?: string }).title || t.annotations?.title || humanize(mcpName);
    out.push({
      name,
      description: `[${spec.name}] ${cleanDescription(t.description)}`,
      parameters,
      source: spec.source,
      timeoutMs: CALL_TIMEOUT_MS + 2_000,
      label: (args) => {
        const q = ['question', 'query', 'libraryName', 'repoName', 'url'].map((k) => args[k]).find((v) => typeof v === 'string');
        return q ? `${spec.name}: ${title} · “${String(q).slice(0, 60)}”` : `${spec.name}: ${title}`;
      },
      execute: async (args, ctx) => {
        let res: unknown;
        try {
          res = await pool.call(spec, mcpName, args, ctx.signal);
        } catch (err) {
          throw new Error(`${spec.name}: ${describeMcpError(err)}`);
        }
        const { text, isError } = flattenResult(res);
        if (isError) throw new Error(text.slice(0, 300));
        return { content: wrapUntrusted(spec.source, text), display: text };
      },
    });
  }
  return out;
}

export interface InspectResult {
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
  tools: { name: string; description: string }[];
}

/** Connect to a custom server, list its tools, disconnect (used by /api/mcp/inspect). */
export async function inspectServer(url: string, authHeader: string | undefined, signal: AbortSignal): Promise<InspectResult> {
  const spec: McpServerSpec = { prefix: 'inspect', source: 'mcp:inspect', name: 'inspect', url, custom: true, authHeader };
  const conn = await connectServer(spec, signal);
  try {
    const res = await conn.client.listTools(undefined, { timeout: CONNECT_TIMEOUT_MS, signal });
    const info = conn.client.getServerVersion();
    return {
      serverName: info?.name,
      serverVersion: info?.version,
      protocolVersion: (conn.transport as unknown as { protocolVersion?: string }).protocolVersion,
      tools: ((res.tools ?? []) as Tool[]).slice(0, 100).map((t) => ({
        name: t.name,
        description: cleanDescription(t.description, 300),
      })),
    };
  } finally {
    await closeConnection(conn);
  }
}
