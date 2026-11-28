import { describe, expect, it } from 'vitest';
import { buildPreviewDocument, pickPage, resolveRef } from '@/lib/code-agent/bundle';

describe('resolveRef', () => {
  it('resolves relative paths against the page', () => {
    expect(resolveRef('index.html', 'styles.css')).toBe('styles.css');
    expect(resolveRef('index.html', './js/app.js?v=2#x')).toBe('js/app.js');
    expect(resolveRef('pages/about.html', '../styles.css')).toBe('styles.css');
    expect(resolveRef('pages/about.html', '/styles.css')).toBe('styles.css');
  });
  it('ignores external and fragment refs', () => {
    for (const r of ['https://cdn.jsdelivr.net/x.js', '//cdn.x/y.js', 'data:text/css,a', '#top', 'mailto:a@b.c', '../../x.js']) {
      expect(resolveRef('index.html', r)).toBeNull();
    }
  });
});

describe('pickPage', () => {
  it('prefers the requested page, then index.html, then the first html', () => {
    expect(pickPage({ 'index.html': '', 'about.html': '' }, 'about.html')).toBe('about.html');
    expect(pickPage({ 'index.html': '', 'about.html': '' }, 'missing.html')).toBe('index.html');
    expect(pickPage({ 'b.html': '', 'a.html': '' })).toBe('a.html');
    expect(pickPage({ 'app.js': '' })).toBeNull();
  });
});

describe('buildPreviewDocument', () => {
  const files = {
    'index.html': `<!DOCTYPE html>
<html><head><title>T</title>
<link rel="stylesheet" href="styles.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<link rel="icon" href="logo.svg">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script src="./script.js" defer></script>
<script type="module" src="js/mod.js"></script>
</head><body><img src="logo.svg" alt=""><button id="b">0</button></body></html>`,
    'styles.css': 'body{background:url(logo.svg)} .x{color:red}',
    'script.js': 'document.getElementById("b").onclick=()=>{}; const s = "</script>";',
    'js/mod.js': 'export const a = 1;',
    'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  };

  it('returns null without an HTML page', () => {
    expect(buildPreviewDocument({ 'app.js': '1' })).toBeNull();
  });

  it('inlines local CSS and JS, keeps CDN references', () => {
    const { html, page } = buildPreviewDocument(files)!;
    expect(page).toBe('index.html');
    expect(html).toContain('<style data-file="styles.css">');
    expect(html).toContain('.x{color:red}');
    expect(html).not.toMatch(/href="styles.css"/);
    expect(html).toContain('https://fonts.googleapis.com/css2?family=Inter');
    expect(html).toContain('src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"');
    expect(html).toContain('<script type="module" data-file="js/mod.js">export const a = 1;');
    expect(html).not.toMatch(/src="\.\/script.js"/);
  });

  it('escapes </script> inside inlined code', () => {
    const { html } = buildPreviewDocument(files)!;
    expect(html).toContain('const s = "<\\/script>"');
  });

  it('moves deferred classic scripts to the end of body', () => {
    const { html } = buildPreviewDocument(files)!;
    const scriptAt = html.indexOf('data-file="script.js"');
    expect(scriptAt).toBeGreaterThan(html.indexOf('<button id="b">'));
    expect(scriptAt).toBeLessThan(html.indexOf('</body>'));
    expect(html.slice(scriptAt - 40, scriptAt)).not.toMatch(/defer/);
  });

  it('turns SVG references into data URIs (img, icon, css url)', () => {
    const { html } = buildPreviewDocument(files)!;
    expect(html).not.toMatch(/src="logo.svg"/);
    expect(html).not.toMatch(/href="logo.svg"/);
    expect(html.match(/data:image\/svg\+xml/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('injects the bootstrap first in <head> without breaking the doctype', () => {
    const { html } = buildPreviewDocument(files)!;
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    const boot = html.indexOf('data-preview-bootstrap');
    expect(boot).toBeGreaterThan(html.indexOf('<head>'));
    expect(boot).toBeLessThan(html.indexOf('<title>'));
  });

  it('handles documents without head/html', () => {
    const a = buildPreviewDocument({ 'index.html': '<!doctype html><p>hi</p>' })!.html;
    expect(a.startsWith('<!doctype html><script data-preview-bootstrap>')).toBe(true);
    const b = buildPreviewDocument({ 'index.html': '<p>hi</p>' })!.html;
    expect(b.startsWith('<!doctype html><script data-preview-bootstrap>')).toBe(true);
    const c = buildPreviewDocument({ 'index.html': '<html lang="en"><body>x</body></html>' })!.html;
    expect(c).toMatch(/^<html lang="en"><head><script data-preview-bootstrap>/);
  });

  it('embeds project files for fetch() safely (no raw </script>)', () => {
    const { html } = buildPreviewDocument({ 'index.html': '<head></head>', 'data.json': '{"a":"</script><b>"}' })!;
    const boot = html.slice(html.indexOf('<script data-preview-bootstrap>'), html.indexOf('<\/script>', html.indexOf('data-preview-bootstrap')));
    expect(boot).toContain('data.json');
    expect(boot).not.toContain('</script><b>');
  });

  it('drops references to local files that do not exist yet', () => {
    const { html } = buildPreviewDocument({
      'index.html': '<head><link rel="stylesheet" href="styles.css"><script src="script.js"></script><script src="https://unpkg.com/x.js"></script></head>',
    })!;
    expect(html).not.toMatch(/href="styles.css"/);
    expect(html).not.toMatch(/src="script.js"/);
    expect(html).toContain('<!-- missing stylesheet: styles.css -->');
    expect(html).toContain('src="https://unpkg.com/x.js"');
  });

  it('renders the requested page with paths relative to it', () => {
    const { html, page } = buildPreviewDocument(
      { 'index.html': '<p>home</p>', 'pages/about.html': '<head><link rel="stylesheet" href="../styles.css"></head><p>about</p>', 'styles.css': 'p{}' },
      'pages/about.html',
    )!;
    expect(page).toBe('pages/about.html');
    expect(html).toContain('<style data-file="styles.css">p{}</style>');
  });
});
