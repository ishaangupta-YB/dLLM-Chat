import 'server-only';
// fetch_url: readable text of a web page. Jina Reader (r.jina.ai, keyless,
// 20 req/min) first, then a direct fetch through the SSRF-guarded agent.
// The target URL is checked (scheme, port, credentials, DNS -> public IPs)
// before either path, so the tool cannot be pointed at internal hosts.
import dns from 'node:dns/promises';
import type { AgentTool } from '../types';
import { readCapped, safeFetch } from '../net/safe-fetch';
import { checkUrl, isPublicIp, SsrfError } from '../net/ssrf';
import { truncateText, wrapUntrusted } from '../mcp/schema';
import { CitationRegistry } from './citations';
import { USER_AGENT } from './web-search';

const DEFAULT_CHARS = 10_000;
const MAX_CHARS = 12_000;
const MAX_BYTES = 1_500_000;

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = await dns.lookup(host, { all: true, verbatim: true }).catch(() => {
    throw new SsrfError(`Could not resolve ${host}.`);
  });
  if (!addrs.length || addrs.some((a) => !isPublicIp(a.address))) {
    throw new SsrfError(`Blocked: ${host} resolves to a private or local address.`);
  }
}

/** Very small HTML -> text conversion for the direct-fetch fallback. */
export function htmlToText(html: string): { title?: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim();
  const text = html
    .replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|pre|blockquote|table|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
  return { title, text };
}

async function viaJina(url: URL, signal: AbortSignal): Promise<{ title?: string; text: string } | null> {
  const res = await fetch(`https://r.jina.ai/${url.toString()}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    headers: { accept: 'text/plain', 'x-return-format': 'markdown', 'user-agent': USER_AGENT },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const { text } = await readCapped(res, MAX_BYTES);
  if (!text.trim()) return null;
  const title = /^Title: (.*)$/m.exec(text)?.[1]?.trim();
  const mdIdx = text.indexOf('Markdown Content:');
  return { title, text: (mdIdx >= 0 ? text.slice(mdIdx + 'Markdown Content:'.length) : text).trim() };
}

async function direct(url: URL, signal: AbortSignal): Promise<{ title?: string; text: string }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = await safeFetch(current, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      res.body?.cancel().catch(() => {});
      if (!loc) throw new Error(`Redirect without a location (HTTP ${res.status}).`);
      current = checkUrl(new URL(loc, current).toString(), { allowHttp: true });
      continue;
    }
    if (!res.ok) throw new Error(`The page returned HTTP ${res.status}.`);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/|json|xml|javascript/.test(type) && type) {
      res.body?.cancel().catch(() => {});
      throw new Error(`Unsupported content type (${type.split(';')[0]}).`);
    }
    const { text } = await readCapped(res, MAX_BYTES);
    return /html/.test(type) ? htmlToText(text) : { text };
  }
  throw new Error('Too many redirects.');
}

export function fetchUrlTool(citations: CitationRegistry): AgentTool {
  return {
    name: 'fetch_url',
    description:
      'Fetch a public web page and return its readable text (markdown). Use it to read a search result in full ' +
      'or a URL the user gave. The page gets a source number [n] you can cite.',
    source: 'builtin',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL' },
        max_chars: { type: 'integer', description: `Characters to return (default ${DEFAULT_CHARS}, max ${MAX_CHARS})` },
      },
      required: ['url'],
    },
    timeoutMs: 30_000,
    label: (args) => {
      try {
        return `Reading ${new URL(String(args.url)).hostname}`;
      } catch {
        return 'Reading a web page';
      }
    },
    execute: async (args, ctx) => {
      const raw = typeof args.url === 'string' ? args.url : '';
      const url = checkUrl(raw, { allowHttp: true });
      await assertPublicHost(url);
      const max = Math.min(MAX_CHARS, Math.max(500, Number(args.max_chars) || DEFAULT_CHARS));
      const page = (await viaJina(url, ctx.signal)) ?? (await direct(url, ctx.signal));
      const text = page.text.trim();
      if (!text) return { content: 'The page has no readable text.' };
      const title = page.title || url.hostname;
      const n = citations.add({ title, url: url.toString(), snippet: text.slice(0, 200) });
      const body = truncateText(text, max);
      return {
        content: wrapUntrusted('web:fetch', `[${n}] ${title}\nURL: ${url.toString()}\n\n${body}`),
        display: `${title}\n${url.toString()}\n\n${text.slice(0, 600)}`,
        sources: [{ title, url: url.toString(), snippet: text.slice(0, 200).replace(/\s+/g, ' ') }],
      };
    },
  };
}
