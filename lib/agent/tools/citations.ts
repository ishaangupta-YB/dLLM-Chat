import type { SourceRef } from '@/lib/types';

/**
 * Per-request citation numbering. A URL keeps the same [n] across every
 * search / fetch in one reply, and numbers follow first-seen order, which is
 * the order the client lists sources in (deduplicated by URL).
 */
export class CitationRegistry {
  private byUrl = new Map<string, number>();
  private list: SourceRef[] = [];

  add(src: SourceRef): number {
    const key = normalizeUrl(src.url);
    const hit = this.byUrl.get(key);
    if (hit) return hit;
    this.list.push(src);
    const n = this.list.length;
    this.byUrl.set(key, n);
    return n;
  }

  get size() {
    return this.list.length;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** Strip tags/entities from a short HTML snippet (search excerpts). */
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
