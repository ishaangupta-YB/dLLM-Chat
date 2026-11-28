import 'server-only';
// web_search: Tavily with the user's own key (BYOK), otherwise keyless Exa
// (hosted MCP, free tier), then Wikipedia as a last resort. Results are
// numbered so the model can cite [n]; the same numbers are emitted as sources.
import type { SourceRef } from '@/lib/types';
import type { AgentTool } from '../types';
import { McpPool, type McpServerSpec } from '../mcp/client';
import { flattenResult, truncateText, wrapUntrusted } from '../mcp/schema';
import { getCuratedServer } from '../mcp/servers';
import { CitationRegistry, stripHtml } from './citations';

const RESULT_CAP = 12_000;
const SNIPPET_MODEL_CHARS = 1_400;
const SNIPPET_UI_CHARS = 280;
export const USER_AGENT = 'dLLM-Chat/2.0 (agent tools; +https://github.com)';

interface Hit {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

class SearchError extends Error {}

/** Collapse a markdown-ish excerpt to one readable line for the UI. */
function oneLine(s: string): string {
  return s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`|\\]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function tavilySearch(key: string, query: string, topic: string | undefined, signal: AbortSignal): Promise<Hit[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query: query.slice(0, 400),
      topic: topic === 'news' || topic === 'finance' ? topic : 'general',
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
    }),
  });
  if (res.status === 401 || res.status === 403) throw new SearchError('Tavily rejected the API key (check it in Settings → API keys).');
  if (res.status === 429 || res.status === 432 || res.status === 433) throw new SearchError('Tavily rate or plan limit reached.');
  if (!res.ok) throw new SearchError(`Tavily search failed (HTTP ${res.status}).`);
  const json = (await res.json()) as { results?: { title?: string; url?: string; content?: string; published_date?: string }[] };
  return (json.results ?? [])
    .filter((r) => typeof r.url === 'string')
    .map((r) => ({ title: r.title || r.url!, url: r.url!, snippet: (r.content ?? '').trim(), date: r.published_date }));
}

/** Parse Exa's text result ("Title: …\nURL: …\nPublished: …\nHighlights:\n…"). */
export function parseExaText(text: string): Hit[] {
  const blocks = text.split(/\n(?=Title: )/).map((b) => b.trim()).filter((b) => b.startsWith('Title: '));
  const hits: Hit[] = [];
  for (const b of blocks) {
    const title = /^Title: (.*)$/m.exec(b)?.[1]?.trim();
    const url = /^URL: (\S+)/m.exec(b)?.[1]?.trim();
    if (!url || !/^https?:\/\//.test(url)) continue;
    const date = /^Published: (.*)$/m.exec(b)?.[1]?.trim();
    const bodyIdx = b.search(/^(Highlights|Text|Summary):/m);
    const body = bodyIdx >= 0 ? b.slice(bodyIdx).replace(/^(Highlights|Text|Summary):\s*/, '') : '';
    hits.push({
      title: title || url,
      url,
      date: date && date !== 'N/A' ? date : undefined,
      snippet: body.replace(/\\\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    });
  }
  return hits;
}

async function exaSearch(pool: McpPool, query: string, signal: AbortSignal): Promise<Hit[]> {
  const exa = getCuratedServer('exa')!;
  const spec: McpServerSpec = { prefix: 'exa', source: 'mcp:exa', name: exa.name, url: exa.url, custom: false };
  const res = await pool.call(
    spec,
    'web_search_exa',
    { query: query.slice(0, 400), objective: `Find reliable, up-to-date sources that answer: ${query.slice(0, 400)}`, numResults: 5 },
    AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  );
  const { text, isError } = flattenResult(res, 60_000);
  if (isError) throw new SearchError(text.slice(0, 200));
  return parseExaText(text).slice(0, 5);
}

async function wikipediaSearch(query: string, signal: AbortSignal): Promise<Hit[]> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query.slice(0, 300))}&limit=5`;
  const res = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
  });
  if (!res.ok) throw new SearchError(`Wikipedia search failed (HTTP ${res.status}).`);
  const json = (await res.json()) as { pages?: { key: string; title: string; excerpt?: string; description?: string }[] };
  return (json.pages ?? []).map((p) => ({
    title: `${p.title} - Wikipedia`,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.key)}`,
    snippet: [p.description, stripHtml(p.excerpt ?? '')].filter(Boolean).join('. '),
  }));
}

export interface WebSearchOptions {
  tavilyKey?: string;
  pool: McpPool;
  citations: CitationRegistry;
}

export function webSearchTool({ tavilyKey, pool, citations }: WebSearchOptions): AgentTool {
  return {
    name: 'web_search',
    description:
      'Search the web for current or factual information. Returns numbered sources [n] with title, URL and snippet; ' +
      'cite them inline as [n](url). Use focused keyword queries; call again with a different query if results are weak.',
    source: 'builtin',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keywords, 2-12 words)' },
        topic: { type: 'string', enum: ['general', 'news', 'finance'], description: 'Optional: news for recent events' },
      },
      required: ['query'],
    },
    timeoutMs: 30_000,
    label: (args) => `Searching the web for “${String(args.query ?? '').slice(0, 80)}”`,
    execute: async (args, ctx) => {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) return { content: 'Error: query is required.' };
      const topic = typeof args.topic === 'string' ? args.topic : undefined;

      let hits: Hit[] = [];
      let provider = '';
      const notes: string[] = [];
      if (tavilyKey) {
        try {
          hits = await tavilySearch(tavilyKey, query, topic, ctx.signal);
          provider = 'Tavily';
        } catch (err) {
          if (ctx.signal.aborted) throw err;
          notes.push((err as Error).message);
        }
      }
      if (!hits.length) {
        try {
          hits = await exaSearch(pool, query, ctx.signal);
          provider = 'Exa';
        } catch (err) {
          if (ctx.signal.aborted) throw err;
          notes.push('Exa search unavailable.');
        }
      }
      if (!hits.length) {
        hits = await wikipediaSearch(query, ctx.signal);
        provider = 'Wikipedia';
      }
      if (!hits.length) {
        return { content: `No results for "${query}".${notes.length ? ` (${notes.join(' ')})` : ''}`, display: 'No results' };
      }

      const sources: SourceRef[] = [];
      const lines: string[] = [];
      const blocks = hits.map((h) => {
        const src: SourceRef = { title: h.title.slice(0, 200), url: h.url, snippet: oneLine(h.snippet).slice(0, SNIPPET_UI_CHARS) };
        const n = citations.add(src);
        sources.push(src);
        lines.push(`[${n}] ${h.title} — ${h.url}`);
        return `[${n}] ${h.title}\nURL: ${h.url}${h.date ? `\nPublished: ${h.date}` : ''}\n${h.snippet.slice(0, SNIPPET_MODEL_CHARS)}`;
      });
      const header = `Search results for "${query}" (via ${provider}). Cite as [n](URL).`;
      const body = truncateText(`${header}\n\n${blocks.join('\n\n')}`, RESULT_CAP);
      const display = lines.join('\n');
      return { content: wrapUntrusted(`web:${provider.toLowerCase()}`, body), display, sources };
    },
  };
}
