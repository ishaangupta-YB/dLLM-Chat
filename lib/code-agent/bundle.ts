// Turns a multi-file project into one HTML document for the sandboxed preview.
//
// - <link rel="stylesheet" href="styles.css"> and <script src="script.js">
//   that point at project files are inlined (paths resolved relative to the page).
// - Classic scripts with `defer` are moved to the end of <body> so they still
//   run after the DOM is parsed (inline scripts ignore `defer`).
// - SVG references (img src, favicon, CSS url()) become data: URIs.
// - A bootstrap script runs first: console/error capture (posted to the parent),
//   in-memory storage shims (the frame has an opaque origin), fetch() of project
//   files, and in-project link navigation (posted to the parent).
import { ENTRY_FILE } from './files';

/** Resolve `ref` (as written in `fromPath`) to a project path, or null if external. */
export function resolveRef(fromPath: string, ref: string): string | null {
  let r = ref.trim();
  if (!r || r.startsWith('#') || r.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(r)) return null;
  r = r.split('#')[0].split('?')[0];
  if (!r) return null;
  const base = r.startsWith('/') ? [] : fromPath.split('/').slice(0, -1);
  for (const seg of r.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!base.length) return null;
      base.pop();
    } else base.push(seg);
  }
  try {
    return base.map((s) => decodeURIComponent(s)).join('/') || null;
  } catch {
    return null;
  }
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s*=|\\s|$)`, 'i').test(attrs);
}

function removeAttr(attrs: string, name: string): string {
  return attrs.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, 'i'), '');
}

const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Script text safe to embed inside <script>…</script>. */
const escapeScript = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const escapeStyle = (s: string) => s.replace(/<\/(style)/gi, '<\\/$1');

function inlineCssUrls(css: string, cssPath: string, files: Record<string, string>): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, _q, ref: string) => {
    const p = resolveRef(cssPath, ref);
    return p && p.endsWith('.svg') && files[p] != null ? `url("${svgDataUri(files[p])}")` : m;
  });
}

/** Files exposed to fetch() inside the preview (everything that is not inlined code). */
function fetchableFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [p, c] of Object.entries(files)) if (/\.(json|txt|md|svg|css|js|html)$/i.test(p)) out[p] = c;
  return out;
}

export function previewBootstrap(page: string, files: Record<string, string>): string {
  const data = JSON.stringify({ page, files: fetchableFiles(files) })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script data-preview-bootstrap>(function(){
var D=${data};
var post=function(m){try{parent.postMessage(Object.assign({type:'preview-log'},m),'*')}catch(_){}};
var fmt=function(a){if(typeof a==='string')return a;if(a instanceof Error)return a.name+': '+a.message;try{var s=JSON.stringify(a);return s===undefined?String(a):s}catch(_){return String(a)}};
['log','info','warn','error','debug'].forEach(function(level){var o=console[level];console[level]=function(){
try{post({level:level==='debug'?'log':level,message:[].map.call(arguments,fmt).join(' ').slice(0,4000)})}catch(_){}
return o&&o.apply(console,arguments)}});
addEventListener('error',function(e){if(e&&e.message)post({level:'error',message:e.message+(e.lineno?' (line '+e.lineno+')':'')})});
addEventListener('unhandledrejection',function(e){var r=e&&e.reason;post({level:'error',message:'Unhandled rejection: '+(r&&r.message||fmt(r))})});
function mem(){var s={};return{getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(s,k)?s[k]:null},setItem:function(k,v){s[String(k)]=String(v)},removeItem:function(k){delete s[String(k)]},clear:function(){s={}},key:function(i){return Object.keys(s)[i]||null},get length(){return Object.keys(s).length}}}
['localStorage','sessionStorage'].forEach(function(n){try{window[n].length}catch(_){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});
try{document.cookie}catch(_){try{Object.defineProperty(document,'cookie',{get:function(){return''},set:function(){},configurable:true})}catch(_){}}
function resolve(ref){if(typeof ref!=='string')return null;ref=ref.trim();if(!ref||/^[a-z][a-z0-9+.-]*:|^\\/\\//i.test(ref)||ref[0]==='#')return null;ref=ref.split('#')[0].split('?')[0];var b=ref[0]==='/'?[]:D.page.split('/').slice(0,-1);var parts=ref.split('/');for(var i=0;i<parts.length;i++){var s=parts[i];if(!s||s==='.')continue;if(s==='..'){if(!b.length)return null;b.pop()}else b.push(s)}return b.join('/')}
var types={json:'application/json',txt:'text/plain',md:'text/markdown',svg:'image/svg+xml',css:'text/css',js:'text/javascript',html:'text/html'};
var of=window.fetch;window.fetch=function(input,init){var u=typeof input==='string'?input:(input&&input.url!==undefined&&!(input instanceof Request)?String(input):null);var p=u!=null?resolve(u):null;
if(p!=null&&Object.prototype.hasOwnProperty.call(D.files,p)){var ext=p.slice(p.lastIndexOf('.')+1).toLowerCase();return Promise.resolve(new Response(D.files[p],{status:200,headers:{'Content-Type':(types[ext]||'text/plain')+'; charset=utf-8'}}))}
return of?of.call(window,input,init):Promise.reject(new Error('fetch unavailable'))};
document.addEventListener('click',function(e){if(e.defaultPrevented)return;var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a||a.target==='_blank'&&/^https?:/i.test(a.getAttribute('href')))return;var href=a.getAttribute('href')||'';
if(href[0]==='#'||/^(javascript|mailto|tel):/i.test(href))return;if(/^https?:|^\\/\\//i.test(href)){e.preventDefault();post({level:'warn',message:'External link blocked in preview: '+href});return}
e.preventDefault();var p=resolve(href);if(p&&/\\.html?$/i.test(p)&&Object.prototype.hasOwnProperty.call(D.files,p)){try{parent.postMessage({type:'preview-navigate',path:p},'*')}catch(_){}}else post({level:'warn',message:'Link target not found in project: '+href})},false);
addEventListener('load',function(){try{parent.postMessage({type:'preview-loaded'},'*')}catch(_){}});
})();<\/script>`;
}

/** Pick the page to render: the requested one, else index.html, else the first .html file. */
export function pickPage(files: Record<string, string>, page?: string): string | null {
  if (page && /\.html?$/i.test(page) && files[page] != null) return page;
  if (files[ENTRY_FILE] != null) return ENTRY_FILE;
  return Object.keys(files).filter((p) => /\.html?$/i.test(p)).sort()[0] ?? null;
}

/**
 * Bundle `page` (default index.html) and its local CSS/JS into one document.
 * Returns null when the project has no HTML page.
 */
export function buildPreviewDocument(files: Record<string, string>, page?: string): { html: string; page: string } | null {
  const entry = pickPage(files, page);
  if (!entry) return null;
  let html = files[entry];

  // Stylesheets
  html = html.replace(/<link\b([^>]*)>/gi, (m, attrs: string) => {
    const rel = (attr(attrs, 'rel') ?? '').toLowerCase();
    const href = attr(attrs, 'href');
    if (!href) return m;
    const p = resolveRef(entry, href);
    // A local stylesheet that does not exist (yet, while streaming): drop it
    // rather than letting the preview request the app origin.
    if (p && files[p] == null && rel.split(/\s+/).includes('stylesheet')) return `<!-- missing stylesheet: ${p.replace(/--/g, '')} -->`;
    if (!p || files[p] == null) return m;
    if (rel.split(/\s+/).includes('stylesheet') && p.endsWith('.css')) {
      const media = attr(attrs, 'media');
      return `<style data-file="${p}"${media ? ` media="${media.replace(/"/g, '&quot;')}"` : ''}>${escapeStyle(inlineCssUrls(files[p], p, files))}</style>`;
    }
    if (p.endsWith('.svg')) return m.replace(href, svgDataUri(files[p]));
    return m;
  });

  // Scripts with src
  const deferred: string[] = [];
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (m, attrs: string, body: string) => {
    const src = attr(attrs, 'src');
    if (!src || body.trim()) return m;
    const p = resolveRef(entry, src);
    if (p && files[p] == null) return `<!-- missing script: ${p.replace(/--/g, '')} -->`;
    if (!p || !p.endsWith('.js')) return m;
    let a = removeAttr(attrs, 'src');
    const isModule = (attr(attrs, 'type') ?? '').toLowerCase() === 'module';
    const defer = !isModule && hasAttr(attrs, 'defer');
    a = removeAttr(a, 'defer').replace(/\sdefer\b/i, '').replace(/\sasync\b/i, '');
    const tag = `<script${a} data-file="${p}">${escapeScript(files[p])}\n</script>`;
    if (defer) {
      deferred.push(tag);
      return '';
    }
    return tag;
  });
  if (deferred.length) {
    html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, (b) => deferred.join('\n') + b) : html + deferred.join('\n');
  }

  // Inline <style> blocks: svg url() refs
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_m, a: string, css: string, b: string) => a + inlineCssUrls(css, entry, files) + b);

  // SVG images
  html = html.replace(/(\s(?:src|href)\s*=\s*)(["'])([^"']+\.svg)\2/gi, (m, pre: string, q: string, ref: string) => {
    const p = resolveRef(entry, ref);
    return p && files[p] != null ? `${pre}${q}${svgDataUri(files[p])}${q}` : m;
  });

  // Bootstrap must run before anything else, without breaking the doctype.
  const boot = previewBootstrap(entry, files);
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (h) => h + boot);
  else if (/<html\b[^>]*>/i.test(html)) html = html.replace(/<html\b[^>]*>/i, (h) => h + '<head>' + boot + '</head>');
  else if (/<!doctype[^>]*>/i.test(html)) html = html.replace(/<!doctype[^>]*>/i, (d) => d + boot);
  else html = '<!doctype html>' + boot + html;

  return { html, page: entry };
}
