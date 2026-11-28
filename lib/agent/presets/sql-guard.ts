// Static guard for the SQL analyst preset. SQLite (node:sqlite) cannot be
// interrupted from JS, so besides opening the demo DB with query_only we only
// run queries whose cost is bounded by construction:
//   - one plain SELECT (no WITH / RECURSIVE, no second statement, no comments)
//   - only allow-listed functions (no randomblob/zeroblob/printf/replace/json_*)
//   - at most MAX_TABLE_REFS base-table references (tables have <= 12 rows,
//     so the worst case is a 12^4 row join)
// Pure module so it can be unit tested.

export const SQL_TABLES = ['customers', 'products', 'orders'] as const;
export const MAX_TABLE_REFS = 4;
export const MAX_SQL_CHARS = 2000;

const FORBIDDEN = [
  'insert', 'update', 'delete', 'drop', 'alter', 'create', 'replace', 'attach', 'detach', 'pragma', 'vacuum',
  'reindex', 'analyze', 'with', 'recursive', 'into', 'begin', 'commit', 'rollback', 'savepoint', 'release',
  'transaction', 'load_extension', 'sqlite_master', 'sqlite_schema', 'sqlite_temp_master', 'randomblob', 'zeroblob',
];

const ALLOWED_FUNCS = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'total', 'group_concat', 'round', 'abs', 'lower', 'upper', 'length', 'substr',
  'substring', 'trim', 'ltrim', 'rtrim', 'coalesce', 'ifnull', 'nullif', 'iif', 'date', 'time', 'datetime',
  'strftime', 'julianday', 'cast', 'instr', 'typeof', 'unixepoch',
]);
// Keywords that may legitimately be followed by "(".
const PAREN_KEYWORDS = new Set([
  'in', 'exists', 'and', 'or', 'not', 'on', 'from', 'join', 'select', 'as', 'over', 'filter', 'then', 'else', 'when',
  'where', 'by', 'having', 'like', 'between', 'is', 'distinct', 'all', 'union', 'except', 'intersect', 'case',
  'using', 'limit', 'offset', 'values', 'end',
]);

export type SqlCheck = { ok: true; sql: string } | { ok: false; error: string };

export function checkSelect(input: unknown): SqlCheck {
  if (typeof input !== 'string') return { ok: false, error: 'query must be a string.' };
  const sql = input.trim().replace(/;+\s*$/, '');
  if (!sql) return { ok: false, error: 'The query is empty.' };
  if (sql.length > MAX_SQL_CHARS) return { ok: false, error: `The query is longer than ${MAX_SQL_CHARS} characters.` };

  // Remove string literals ('' escapes) before looking at structure.
  const unterminated = (sql.match(/'/g)?.length ?? 0) % 2 === 1;
  if (unterminated) return { ok: false, error: 'Unterminated string literal.' };
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''").toLowerCase();

  if (/;/.test(bare)) return { ok: false, error: 'Only a single statement is allowed.' };
  if (/--|\/\*/.test(bare)) return { ok: false, error: 'Comments are not allowed.' };
  if (/["`[\]]/.test(bare)) return { ok: false, error: 'Quoted identifiers are not allowed; use plain table and column names.' };
  if (!/^select\b/.test(bare)) return { ok: false, error: 'Only SELECT queries are allowed (read-only database).' };

  for (const word of FORBIDDEN) {
    if (new RegExp(`\\b${word}\\b`).test(bare)) {
      return { ok: false, error: `"${word.toUpperCase()}" is not allowed. Only plain read-only SELECT queries can run.` };
    }
  }
  for (const m of bare.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/g)) {
    const name = m[1];
    if (!ALLOWED_FUNCS.has(name) && !PAREN_KEYWORDS.has(name)) {
      return { ok: false, error: `Function ${name}() is not available in this sandbox.` };
    }
  }
  const refs = [...bare.matchAll(new RegExp(`\\b(${SQL_TABLES.join('|')})\\b(?!\\s*\\.)`, 'g'))].length;
  if (refs > MAX_TABLE_REFS) {
    return { ok: false, error: `Too many table references (${refs}); use at most ${MAX_TABLE_REFS} (joins and subqueries).` };
  }
  return { ok: true, sql };
}

/** Pipe-delimited table like the cookbook's executor. */
export function formatTable(columns: string[], rows: unknown[][], truncated = false): string {
  if (!rows.length) return 'No results found.';
  const cell = (v: unknown) => (v === null || v === undefined ? 'NULL' : String(v)).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [columns.join(' | '), columns.map(() => '---').join(' | '), ...rows.map((r) => r.map(cell).join(' | '))];
  if (truncated) lines.push(`… (only the first ${rows.length} rows are shown)`);
  return lines.join('\n');
}
