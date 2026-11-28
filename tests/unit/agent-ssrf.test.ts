import { describe, expect, it } from 'vitest';
import { checkUrl, isPublicIp, sanitizeAuthHeader } from '@/lib/agent/net/ssrf';

describe('isPublicIp', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', '::ffff:127.0.0.1', '::ffff:169.254.169.254', 'fc00::1', 'fe80::1', '224.0.0.1', 'not-an-ip'])(
    'blocks %s',
    (ip) => expect(isPublicIp(ip)).toBe(false),
  );
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => expect(isPublicIp(ip)).toBe(true));
});

describe('checkUrl', () => {
  const blocked: [string, RegExp][] = [
    ['https://127.0.0.1/mcp', /Private/],
    ['https://10.0.0.8/mcp', /Private/],
    ['https://169.254.169.254/latest/meta-data', /Private/],
    ['https://[::1]/mcp', /Private/],
    ['https://[::ffff:127.0.0.1]/mcp', /Private/],
    ['https://[::ffff:169.254.169.254]/', /Private/],
    ['https://2130706433/', /Private/], // 127.0.0.1 as an integer
    ['https://0x7f.1/', /Private/],
    ['http://example.com/mcp', /https/],
    ['ftp://example.com/', /https/],
    ['https://user:pass@example.com/mcp', /credentials/],
    ['https://example.com:8443/mcp', /Port/],
    ['https://localhost/mcp', /Local or internal/],
    ['https://foo.localhost/', /Local or internal/],
    ['https://metadata.google.internal/', /Local or internal/],
    ['https://printer.local/', /Local or internal/],
    ['https://intranet/', /Local or internal/],
    ['not a url', /valid URL/],
  ];
  it.each(blocked)('rejects %s', (url, msg) => expect(() => checkUrl(url)).toThrow(msg));

  it('accepts public https URLs and strips the fragment', () => {
    expect(checkUrl('https://mcp.deepwiki.com/mcp#x').toString()).toBe('https://mcp.deepwiki.com/mcp');
    expect(checkUrl('https://example.com:443/mcp').host).toBe('example.com');
  });
  it('allows http only when asked (fetch_url)', () => {
    expect(checkUrl('http://example.com/page', { allowHttp: true }).protocol).toBe('http:');
    expect(() => checkUrl('http://127.0.0.1/', { allowHttp: true })).toThrow(/Private/);
    expect(() => checkUrl('http://example.com:8080/', { allowHttp: true })).toThrow(/Port/);
  });
});

describe('sanitizeAuthHeader', () => {
  it('rejects control characters and empties', () => {
    expect(sanitizeAuthHeader('Bearer abc')).toBe('Bearer abc');
    expect(sanitizeAuthHeader('abc\r\nX-Evil: 1')).toBeUndefined();
    expect(sanitizeAuthHeader('   ')).toBeUndefined();
  });
});
