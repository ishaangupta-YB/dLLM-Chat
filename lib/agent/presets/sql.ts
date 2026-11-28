import 'server-only';
// Natural Language SQL Agent cookbook: run_sql_query over a small seeded
// in-memory SQLite database (node:sqlite, built into Node >= 22.13, so no
// native addon to bundle on Vercel). The DB is opened once per server
// instance and switched to query_only after seeding; queries also pass the
// static guard in sql-guard.ts, which bounds their cost.
import type { AgentTool } from '../types';
import { checkSelect, formatTable } from './sql-guard';

export const SQL_SCHEMA = `CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  signup_date TEXT NOT NULL -- YYYY-MM-DD
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  total_amount REAL NOT NULL,
  status TEXT NOT NULL, -- 'delivered' | 'shipped' | 'pending'
  order_date TEXT NOT NULL -- YYYY-MM-DD
);`;

const SEED = `
INSERT INTO customers VALUES
 (1,'Alice Johnson','alice@example.com','2025-01-15'),
 (2,'Bob Smith','bob@example.com','2025-02-20'),
 (3,'Sarah Lee','sarah@example.com','2025-03-10'),
 (4,'Mike Chen','mike@example.com','2025-04-05'),
 (5,'Emma Wilson','emma@example.com','2025-05-12');
INSERT INTO products VALUES
 (1,'Laptop Pro 14','Electronics',1299.00,15),
 (2,'Wireless Mouse','Electronics',29.99,150),
 (3,'Standing Desk','Furniture',549.00,20),
 (4,'Ergonomic Chair','Furniture',399.00,25),
 (5,'Noise-Cancelling Headphones','Electronics',249.00,40),
 (6,'Coffee Maker','Appliances',89.99,60),
 (7,'Desk Lamp','Furniture',45.00,80),
 (8,'Mechanical Keyboard','Electronics',129.00,70);
INSERT INTO orders VALUES
 (1,1,1,1,1299.00,'delivered','2025-06-01'),
 (2,1,2,2,59.98,'delivered','2025-06-01'),
 (3,2,3,1,549.00,'shipped','2025-06-15'),
 (4,3,5,1,249.00,'delivered','2025-06-20'),
 (5,3,8,1,129.00,'pending','2025-07-02'),
 (6,4,4,2,798.00,'delivered','2025-07-05'),
 (7,5,6,1,89.99,'shipped','2025-07-10'),
 (8,2,7,3,135.00,'delivered','2025-07-12'),
 (9,4,1,1,1299.00,'pending','2025-07-20'),
 (10,5,2,1,29.99,'delivered','2025-07-22'),
 (11,3,4,1,399.00,'shipped','2025-08-01'),
 (12,1,8,1,129.00,'pending','2025-08-03');`;

const MAX_ROWS = 200;
const DEADLINE_MS = 2_000;

interface Db {
  prepare: (sql: string) => {
    iterate: () => Iterable<unknown[]>;
    columns: () => { name: string }[];
    setReturnArrays: (v: boolean) => void;
  };
}

let dbPromise: Promise<Db> | null = null;
async function getDb(): Promise<Db> {
  dbPromise ??= (async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec(SQL_SCHEMA);
    db.exec(SEED);
    db.exec('PRAGMA query_only = ON');
    return db as unknown as Db;
  })();
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export async function runQuery(query: unknown): Promise<{ content: string; display?: string }> {
  const check = checkSelect(query);
  if (!check.ok) return { content: `SQL Error: ${check.error}` };
  let db: Db;
  try {
    db = await getDb();
  } catch {
    return { content: 'SQL Error: the SQL engine is not available on this server.' };
  }
  try {
    const stmt = db.prepare(check.sql);
    stmt.setReturnArrays(true);
    const columns = stmt.columns().map((c) => c.name);
    const rows: unknown[][] = [];
    const started = Date.now();
    let truncated = false;
    for (const row of stmt.iterate()) {
      if (rows.length >= MAX_ROWS || Date.now() - started > DEADLINE_MS) {
        truncated = true;
        break;
      }
      rows.push(row);
    }
    const table = formatTable(columns, rows, truncated);
    return { content: table, display: `${check.sql}\n\n${table}` };
  } catch (err) {
    return { content: `SQL Error: ${(err as Error).message}` };
  }
}

export function sqlTools(): AgentTool[] {
  return [
    {
      name: 'run_sql_query',
      description: `Execute a read-only SQL query against the SQLite database. Schema:\n${SQL_SCHEMA}`,
      source: 'preset:sql',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The SQL SELECT query to execute' } },
        required: ['query'],
      },
      label: () => 'Running SQL query',
      execute: async (args) => runQuery(args.query),
    },
  ];
}

export const SQL_SYSTEM_PROMPT = `You are a data analyst for a small online shop (demo data). Answer questions about its database by calling run_sql_query with one SQLite SELECT statement, then explain the result in plain language.
- Use only the tables and columns in the tool's schema. Money columns are in USD.
- Prefer a single query with JOINs and aggregates. Plain SELECT only (no WITH/CTEs), at most 4 table references.
- If the tool returns "SQL Error", fix the query and try again.
- Show the SQL you ran in a \`\`\`sql code block, then the answer. Use a markdown table when listing several rows.`;
