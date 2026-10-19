import { describe, it, expect } from 'vitest';
import { __createEmbeddedDriver, migrate, withStableIds, type Driver } from '@/lib/db';
import { seedDemo } from '@/lib/db/demo-seed';

async function seededCopy(): Promise<Driver> {
  const db = await __createEmbeddedDriver('memory://');
  await migrate(db, { localAuth: true });
  await withStableIds(db, () => seedDemo(db));
  return db;
}

const snapshot = async (db: Driver) => ({
  teams: await db.query(`select id, slug from teams order by slug`),
  athletes: await db.query(`select id, slug, share_token from athletes order by slug`),
  users: await db.query(`select id, email from profiles order by email`),
  needs: await db.query(`select id from needs order by id`),
});

describe('hosted demo copies', () => {
  it('two separately seeded copies agree on every id, so links and sign-in work on any server instance', async () => {
    const [a, b] = [await seededCopy(), await seededCopy()];
    expect(await snapshot(a)).toEqual(await snapshot(b));
  });

  it('puts random ids back after seeding', async () => {
    const db = await seededCopy();
    const [d] = await db.query<{ d: string }>(`select column_default as d from information_schema.columns where table_name = 'teams' and column_name = 'id'`);
    expect(d.d).toBe('gen_random_uuid()');
  });
});

describe('stable demo ids', () => {
  it('look like version 4 UUIDs, which request validation expects', async () => {
    const db = await seededCopy();
    const ids = await db.query<{ id: string }>(`select id::text from teams union all select id::text from athletes`);
    for (const { id } of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
