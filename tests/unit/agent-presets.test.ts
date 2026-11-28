import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { checkSelect, formatTable } from '@/lib/agent/presets/sql-guard';
import { runQuery } from '@/lib/agent/presets/sql';
import { businessDays, clinicTools, seedClinic } from '@/lib/agent/presets/clinic';
import { AGENT_PRESETS } from '@/lib/agent/presets-meta';

describe('SQL guard', () => {
  it.each([
    'SELECT COUNT(*) FROM orders',
    "SELECT name FROM customers WHERE name LIKE '%a%'",
    'select c.name, sum(o.total_amount) as spent from customers c join orders o on o.customer_id = c.id group by c.id order by spent desc limit 3;',
    "SELECT 'DROP TABLE x; --' AS s",
    'SELECT p.category, SUM(o.quantity) FROM orders o JOIN products p ON p.id = o.product_id GROUP BY p.category',
  ])('allows %s', (sql) => expect(checkSelect(sql).ok).toBe(true));

  it.each([
    ['DELETE FROM orders', /Only SELECT/],
    ['SELECT 1; DROP TABLE orders', /single statement/],
    ['SELECT * FROM orders -- comment', /Comments/],
    ['SELECT * FROM orders /* x */', /Comments/],
    ['WITH x AS (SELECT 1) SELECT * FROM x', /Only SELECT/],
    ['SELECT * FROM (WITH RECURSIVE c(x) AS (SELECT 1) SELECT x FROM c)', /WITH|RECURSIVE/],
    ['SELECT randomblob(1000000000)', /RANDOMBLOB|not available/i],
    ['SELECT printf("%s", 1)', /Quoted identifiers|printf/],
    ["SELECT printf('%.*c', 1000000000, 'x')", /printf/],
    ['SELECT * FROM sqlite_master', /SQLITE_MASTER/],
    ['PRAGMA table_info(orders)', /Only SELECT/],
    ['SELECT * FROM "orders"', /Quoted identifiers/],
    ['SELECT count(*) FROM orders a, orders b, orders c, orders d, orders e', /Too many table references/],
    ["SELECT 'unterminated", /Unterminated/],
    ['SELECT load_extension(\'x\')', /LOAD_EXTENSION|not available/i],
    ['', /empty/],
  ])('rejects %s', (sql, msg) => {
    const r = checkSelect(sql);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  it('formats a pipe table', () => {
    expect(formatTable(['a', 'b'], [[1, null]])).toBe('a | b\n--- | ---\n1 | NULL');
    expect(formatTable(['a'], [])).toBe('No results found.');
  });
});

describe('SQL preset engine (node:sqlite)', () => {
  it('answers a count question from the seeded DB', async () => {
    const r = await runQuery("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'");
    expect(r.content).toBe('n\n---\n3');
  });
  it('rejects writes before execution', async () => {
    expect((await runQuery('UPDATE orders SET status = 1')).content).toMatch(/^SQL Error: Only SELECT/);
  });
  it('reports SQL errors', async () => {
    expect((await runQuery('SELECT nope FROM orders')).content).toMatch(/^SQL Error: .*no such column/);
  });
});

describe('clinic preset', () => {
  const now = new Date('2026-11-27T12:00:00Z'); // a Friday
  it('generates the next five business days', () => {
    expect(businessDays(now)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04']);
  });
  it('books, reschedules and cancels deterministically', async () => {
    const st = seedClinic(now);
    expect(st.slots).toHaveLength(5 * 3 * 6);
    const tools = Object.fromEntries(clinicTools(st).map((t) => [t.name, t]));
    const ctx = { signal: new AbortController().signal, emit: () => {} };
    const run = async (name: string, args: Record<string, unknown>) => JSON.parse((await tools[name].execute(args, ctx)).content);

    const slots = await run('list_available_slots', { provider_name: 'Dr. Flossmore', date: '2026-11-30' });
    expect(slots.count).toBe(6);
    expect(slots.available_slots[0].provider).toBe('Dr. Pearl Flossmore');
    expect((await run('list_available_slots', { provider_name: 'Smith' })).error).toMatch(/No provider/);

    const booked = await run('book_appointment', { slot_id: slots.available_slots[0].id, patient_name: 'Jane Doe', patient_phone: '415-555-0199' });
    expect(booked.status).toBe('booked');
    expect((await run('book_appointment', { slot_id: slots.available_slots[0].id, patient_name: 'X', patient_phone: '4155550100' })).error).toMatch(/not available/);

    const mine = await run('get_appointments_for_patient', { phone: '(415) 555-0199' });
    expect(mine.count).toBe(1);
    const moved = await run('reschedule_appointment', { appointment_id: mine.appointments[0].id, new_slot_id: slots.available_slots[1].id });
    expect(moved.status).toBe('rescheduled');
    expect((await run('cancel_appointment', { appointment_id: moved.to_id })).status).toBe('cancelled');
    expect((await run('get_appointments_for_patient', { name: 'Jane' })).count).toBe(0);
    expect((await run('get_appointments_for_patient', { name: 'Penny' })).count).toBe(1);
  });
  it('lists four presets with tools', () => {
    expect(AGENT_PRESETS.map((p) => p.id)).toEqual(['general', 'research', 'clinic', 'sql']);
  });
});
