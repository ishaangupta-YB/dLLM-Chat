// Sandboxed preview document for the coding agent.
//
// Security model (see research_notes/v2/agent_ui_preview.md §3):
// - This route is excluded from the app's global headers (next.config.ts) and
//   sends its own CSP. The `sandbox` CSP directive gives the document an opaque
//   origin even when opened top-level, so generated code can never read the
//   app's localStorage, cookies or DOM. The parent iframe adds the same sandbox
//   attribute (never allow-same-origin).
// - Scripts may only load from the CDN allowlist; network access is limited to
//   the same hosts; forms cannot navigate; it can only be framed by this app.
// - The shell renders one document: received by postMessage from the parent
//   (source-checked), or carried in the URL fragment for "Open in new tab"
//   (the fragment never reaches the server).
import { PREVIEW_CDN_HOSTS } from '@/lib/code-agent/prompt';

export const dynamic = 'force-static';

const CDN = PREVIEW_CDN_HOSTS.join(' ');

const PREVIEW_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${CDN}`,
  `style-src 'unsafe-inline' ${CDN} https://fonts.googleapis.com`,
  `font-src data: ${CDN} https://fonts.gstatic.com`,
  'img-src data: blob: https:',
  'media-src data: blob: https:',
  `connect-src ${CDN} https://fonts.googleapis.com https://fonts.gstatic.com`,
  'worker-src blob:',
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  'sandbox allow-scripts allow-forms allow-modals',
].join('; ');

const SHELL = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Preview</title></head><body>
<script>
(function () {
  function render(html) { document.open(); document.write(html); document.close(); }
  if (location.hash.indexOf('#doc=') === 0) {
    try {
      var b64 = location.hash.slice(5).replace(/-/g, '+').replace(/_/g, '/');
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')))
        .text().then(render, function () { document.body.textContent = 'Could not open this preview.'; });
    } catch (e) { document.body.textContent = 'Could not open this preview.'; }
    return;
  }
  if (parent === window) { document.body.textContent = 'Nothing to preview.'; return; }
  addEventListener('message', function onMsg(e) {
    if (e.source !== parent || !e.data || e.data.type !== 'render' || typeof e.data.html !== 'string') return;
    removeEventListener('message', onMsg);
    render(e.data.html);
  });
  parent.postMessage({ type: 'preview-ready' }, '*');
})();
</script></body></html>`;

export function GET() {
  return new Response(SHELL, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': PREVIEW_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'public, max-age=300',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
    },
  });
}
