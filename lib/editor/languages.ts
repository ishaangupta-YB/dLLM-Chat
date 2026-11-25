// Language registry for the code canvas. The mapping helpers are pure (unit
// tested); loadLanguage() code-splits each CodeMirror grammar so a canvas only
// downloads the parser it needs.
import type { Extension } from '@codemirror/state';

export type CanvasLanguageId =
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'python'
  | 'html'
  | 'xml'
  | 'css'
  | 'json'
  | 'markdown'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'kotlin'
  | 'rust'
  | 'go'
  | 'sql'
  | 'shell'
  | 'yaml'
  | 'toml'
  | 'ruby'
  | 'swift'
  | 'lua'
  | 'dockerfile'
  | 'diff'
  | 'plaintext';

const ALIASES: Record<string, CanvasLanguageId> = {
  js: 'javascript', javascript: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  jsx: 'jsx',
  ts: 'typescript', typescript: 'typescript', mts: 'typescript', cts: 'typescript',
  tsx: 'tsx',
  py: 'python', python: 'python', python3: 'python', py3: 'python',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  xml: 'xml', svg: 'xml',
  css: 'css', scss: 'css', less: 'css',
  json: 'json', jsonc: 'json', json5: 'json',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  cs: 'csharp', csharp: 'csharp', 'c#': 'csharp',
  kt: 'kotlin', kotlin: 'kotlin', kts: 'kotlin',
  rs: 'rust', rust: 'rust',
  go: 'go', golang: 'go',
  sql: 'sql', postgres: 'sql', postgresql: 'sql', mysql: 'sql', sqlite: 'sql',
  sh: 'shell', bash: 'shell', shell: 'shell', zsh: 'shell', console: 'shell', shellscript: 'shell',
  yml: 'yaml', yaml: 'yaml',
  toml: 'toml', ini: 'toml',
  rb: 'ruby', ruby: 'ruby',
  swift: 'swift',
  lua: 'lua',
  dockerfile: 'dockerfile', docker: 'dockerfile',
  diff: 'diff', patch: 'diff',
};

/** Canonical language id for a fence info string ("TS", "py", "c++" ...). */
export function normalizeLanguage(lang: string | undefined | null): CanvasLanguageId {
  const key = (lang ?? '').trim().toLowerCase();
  return ALIASES[key] ?? 'plaintext';
}

const LABELS: Record<CanvasLanguageId, string> = {
  javascript: 'JavaScript', jsx: 'JSX', typescript: 'TypeScript', tsx: 'TSX', python: 'Python',
  html: 'HTML', xml: 'XML', css: 'CSS', json: 'JSON', markdown: 'Markdown', java: 'Java', c: 'C',
  cpp: 'C++', csharp: 'C#', kotlin: 'Kotlin', rust: 'Rust', go: 'Go', sql: 'SQL', shell: 'Shell',
  yaml: 'YAML', toml: 'TOML', ruby: 'Ruby', swift: 'Swift', lua: 'Lua', dockerfile: 'Dockerfile',
  diff: 'Diff', plaintext: 'Text',
};

/** Human label for the header badge. Unknown fence languages keep their own name. */
export function languageLabel(lang: string): string {
  const id = normalizeLanguage(lang);
  if (id === 'plaintext' && lang.trim()) return lang.trim();
  return LABELS[id];
}

/** Indentation unit: 4 spaces where the ecosystem convention says so, tabs for Go. */
export function indentUnitFor(lang: string): string {
  switch (normalizeLanguage(lang)) {
    case 'python':
    case 'java':
    case 'c':
    case 'cpp':
    case 'csharp':
    case 'kotlin':
    case 'rust':
    case 'swift':
    case 'sql':
      return '    ';
    case 'go':
      return '\t';
    default:
      return '  ';
  }
}

/** Language name sent to the FIM route (informational, max 40 chars). */
export function fimLanguageName(lang: string): string {
  const id = normalizeLanguage(lang);
  return (id === 'plaintext' ? lang.trim() || 'text' : id).slice(0, 40);
}

const cache = new Map<CanvasLanguageId, Promise<Extension | null>>();

/** Lazily loads the CodeMirror language support. Resolves null for plain text. */
export function loadLanguage(lang: string): Promise<Extension | null> {
  const id = normalizeLanguage(lang);
  let p = cache.get(id);
  if (!p) {
    p = importLanguage(id).catch(() => null);
    cache.set(id, p);
  }
  return p;
}

async function importLanguage(id: CanvasLanguageId): Promise<Extension | null> {
  const legacy = async (load: () => Promise<Parameters<typeof import('@codemirror/language').StreamLanguage.define>[0]>) => {
    const [{ StreamLanguage }, mode] = await Promise.all([import('@codemirror/language'), load()]);
    return StreamLanguage.define(mode);
  };
  switch (id) {
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'jsx':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true });
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
    case 'tsx':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true });
    case 'python':
      return (await import('@codemirror/lang-python')).python();
    case 'html':
      return (await import('@codemirror/lang-html')).html();
    case 'xml':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/xml')).xml);
    case 'css':
      return (await import('@codemirror/lang-css')).css();
    case 'json':
      return (await import('@codemirror/lang-json')).json();
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown();
    case 'java':
      return (await import('@codemirror/lang-java')).java();
    case 'c':
    case 'cpp':
      return (await import('@codemirror/lang-cpp')).cpp();
    case 'csharp':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).csharp);
    case 'kotlin':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).kotlin);
    case 'rust':
      return (await import('@codemirror/lang-rust')).rust();
    case 'go':
      return (await import('@codemirror/lang-go')).go();
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql();
    case 'shell':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell);
    case 'yaml':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/yaml')).yaml);
    case 'toml':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/toml')).toml);
    case 'ruby':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/ruby')).ruby);
    case 'swift':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/swift')).swift);
    case 'lua':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/lua')).lua);
    case 'dockerfile':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile);
    case 'diff':
      return legacy(async () => (await import('@codemirror/legacy-modes/mode/diff')).diff);
    default:
      return null;
  }
}
