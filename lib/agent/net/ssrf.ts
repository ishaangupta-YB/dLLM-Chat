// Pure URL / IP checks used to block server-side request forgery (SSRF).
// No `server-only` import so the rules can be unit tested directly; the
// network-level enforcement (DNS lookup at connect time) is in safe-fetch.ts.
import ipaddr from 'ipaddr.js';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/** true only for globally routable unicast addresses (IPv4 or IPv6). */
export function isPublicIp(ip: string): boolean {
  const raw = ip.replace(/^\[|\]$/g, '');
  if (!ipaddr.isValid(raw)) return false;
  let addr = ipaddr.parse(raw);
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  return addr.range() === 'unicast';
}

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|localdomain|home|lan|intranet|corp)$/i;

export interface UrlCheckOptions {
  /** Allow http:// (fetch_url only). MCP servers must be https. */
  allowHttp?: boolean;
  /** Allowed ports (empty string = scheme default). Default: 443 only for https, 80 for http. */
  ports?: string[];
}

/**
 * Validates a user-supplied URL before any request is made. Throws SsrfError
 * with a user-facing message. The DNS answer is checked again at connect time.
 */
export function checkUrl(raw: string, opts: UrlCheckOptions = {}): URL {
  if (typeof raw !== 'string' || raw.length > 2048) throw new SsrfError('The URL is missing or too long.');
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new SsrfError('That is not a valid URL.');
  }
  const okProtocol = u.protocol === 'https:' || (opts.allowHttp && u.protocol === 'http:');
  if (!okProtocol) {
    throw new SsrfError(opts.allowHttp ? 'Only http(s) URLs are allowed.' : 'Only https:// URLs are allowed.');
  }
  if (u.username || u.password) throw new SsrfError('URLs with embedded credentials are not allowed.');
  const allowedPorts = opts.ports ?? ['', u.protocol === 'https:' ? '443' : '80'];
  if (!allowedPorts.includes(u.port)) {
    throw new SsrfError(`Port ${u.port} is not allowed (use the default ${u.protocol === 'https:' ? '443' : '80'}).`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host) throw new SsrfError('The URL has no host name.');
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) throw new SsrfError('Private, loopback and link-local addresses are not allowed.');
  } else {
    // Non-canonical IPv4 forms (e.g. 2130706433, 0x7f.1) parse via ipaddr's
    // lenient IPv4 parser; WHATWG URL already normalises most of them.
    if (ipaddr.IPv4.isValid(host) && !isPublicIp(ipaddr.IPv4.parse(host).toString())) {
      throw new SsrfError('Private, loopback and link-local addresses are not allowed.');
    }
    if (!host.includes('.') || BLOCKED_HOST.test(host) || host === 'metadata.google.internal') {
      throw new SsrfError('Local or internal host names are not allowed.');
    }
  }
  u.hash = '';
  return u;
}

/** Header values we forward to custom MCP servers: printable ASCII, bounded. */
export function sanitizeAuthHeader(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (!s || s.length > 2000 || /[^\x20-\x7e]/.test(s)) return undefined;
  return s;
}
