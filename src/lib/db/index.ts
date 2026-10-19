import { AsyncLocalStorage } from 'node:async_hooks';
import 'server-only';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { env, mode } from '@/lib/env';

export type Row = Record<string, any>;

/** The minimal query surface the app uses. Both drivers implement it. */
export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs a multi-statement script with no parameters. */
  exec(sql: string): Promise<void>;
}

export interface Driver extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

// Embedded Postgres for demo mode and tests ----------------------------------
async function createEmbeddedDriver(dataDir?: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  let dir = dataDir;
  if (dir === undefined) {
    // PGLITE_DIR lets the browser tests run against their own copy of the demo data.
    dir = process.env.PGLITE_DIR || (process.env.VERCEL ? '/tmp/gridiron-give-pglite' : path.join(process.cwd(), '.data', 'pglite'));
  }
  if (dir !== 'memory://') mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir === 'memory://' ? undefined : dir);
  await pg.waitReady;
  const wrap = (q: any): Queryable => ({
    async query(text, params) {
      const res = await q.query(text, params as any[]);
      return res.rows as any[];
    },
    async exec(sql) {
      await q.exec(sql);
    },
  });
  const base = wrap(pg);
  return {
    ...base,
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
  };
}

// Supabase Postgres (or any Postgres) through DATABASE_URL --------------------
async function createPostgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import('postgres');
  // json/jsonb parameters: callers pass JSON.stringify(...) text, as they do
  // for PGlite. postgres.js would stringify it again and store a JSON string,
  // so text goes through as is and only objects are serialized.
  const asJson = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));
  const jsonTypes = {
    json: { to: 114, from: [114], serialize: asJson, parse: (x: string) => JSON.parse(x) },
    jsonb: { to: 3802, from: [3802], serialize: asJson, parse: (x: string) => JSON.parse(x) },
  };
  // prepare: false keeps this compatible with Supabase's transaction pooler.
  const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10, types: jsonTypes as any });
  const wrap = (s: any): Queryable => ({
    async query(text, params) {
      const rows = await s.unsafe(text, (params ?? []) as any[]);
      return Array.from(rows) as any[];
    },
    async exec(script) {
      await s.unsafe(script).simple();
    },
  });
  const base = wrap(sql);
  return {
    ...base,
    transaction: (fn) => sql.begin((tx: any) => fn(wrap(tx))) as any,
  };
}

// Migrations -----------------------------------------------------------------
function sqlDir(...parts: string[]) {
  return path.join(process.cwd(), ...parts);
}

export function migrationFiles(): { name: string; sql: string }[] {
  const dir = sqlDir('supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), 'utf8') }));
}

export async function migrate(driver: Driver, { localAuth }: { localAuth: boolean }) {
  if (localAuth) await driver.exec(readFileSync(sqlDir('db', 'local-auth.sql'), 'utf8'));
  await driver.query(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await driver.query<{ name: string }>('select name from _migrations')).map((r) => r.name));
  for (const m of migrationFiles()) {
    if (applied.has(m.name)) continue;
    await driver.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query('insert into _migrations (name) values ($1)', [m.name]);
    });
  }
}

// Singleton ------------------------------------------------------------------
type GlobalDb = { driver?: Promise<Driver> };
const g = globalThis as unknown as { __ggDb?: GlobalDb };
g.__ggDb ??= {};

async function init(): Promise<Driver> {
  if (!mode.demo && env.databaseUrl) return createPostgresDriver(env.databaseUrl);
  const driver = await createEmbeddedDriver(env.pgliteDir);
  await migrate(driver, { localAuth: true });
  const seeded = await driver.query<{ n: number }>('select count(*)::int as n from teams');
  if (seeded[0].n === 0 && process.env.GG_SKIP_DEMO_SEED !== 'true') {
    const { seedDemo } = await import('@/lib/db/demo-seed');
    await withStableIds(driver, () => seedDemo(driver));
  }
  return driver;
}

/**
 * Runs the demo seed with predictable ids. A hosted demo can run on several
 * server instances, each with its own embedded copy of the data, and links
 * and sign-in cookies carry ids, so every copy has to agree on them. The
 * seed's other values already come from a fixed random seed. The ids are
 * shaped like version 4 UUIDs, since request validation checks that.
 */
export async function withStableIds(driver: Driver, fn: () => Promise<void>) {
  const cols = await driver.query<{ s: string; t: string; c: string }>(
    `select table_schema as s, table_name as t, column_name as c from information_schema.columns where column_default = 'gen_random_uuid()'`,
  );
  const setDefault = (expr: string) => cols.map((x) => `alter table "${x.s}"."${x.t}" alter column "${x.c}" set default ${expr};`).join('\n');
  await driver.exec(`create sequence if not exists _demo_ids;
    grant usage on sequence _demo_ids to public;
    create or replace function _demo_uuid() returns uuid language sql as $$ select overlay(overlay(md5('gg-demo-' || nextval('_demo_ids')) placing '4' from 13) placing '8' from 17)::uuid $$;
    ${setDefault('_demo_uuid()')}`);
  try {
    await fn();
  } finally {
    await driver.exec(setDefault('gen_random_uuid()'));
  }
}

function driver(): Promise<Driver> {
  g.__ggDb!.driver ??= init().catch((err) => {
    g.__ggDb!.driver = undefined;
    throw err;
  });
  return g.__ggDb!.driver;
}

/** For tests: swap in a driver (for example an in-memory PGlite). */
export function __setDriverForTests(d: Driver | undefined) {
  g.__ggDb!.driver = d ? Promise.resolve(d) : undefined;
}
export { createEmbeddedDriver as __createEmbeddedDriver, createPostgresDriver as __createPostgresDriver };

// Public API -----------------------------------------------------------------

/**
 * System access: runs as the database owner, so row level security does not
 * apply. Use only in code that decides access itself (public pages behind the
 * team code, webhooks, invites, cron jobs) and select only what it needs.
 */
/**
 * Marks code running inside a user transaction. The embedded database has a
 * single connection, so a system query issued from inside a transaction
 * would wait for that same transaction to finish. In development we fail
 * fast instead of hanging.
 */
const inUserTx = new AsyncLocalStorage<boolean>();
function assertNotNested() {
  if (process.env.NODE_ENV !== 'production' && inUserTx.getStore()) {
    throw new Error('sys.* was called inside asUser(). Run system queries before or after the user transaction.');
  }
}

export const sys = {
  async query<T = Row>(text: string, params?: unknown[]): Promise<T[]> {
    assertNotNested();
    return (await driver()).query<T>(text, params);
  },
  async one<T = Row>(text: string, params?: unknown[]): Promise<T | null> {
    assertNotNested();
    const rows = await (await driver()).query<T>(text, params);
    return rows[0] ?? null;
  },
  async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    assertNotNested();
    return (await driver()).transaction((q) => fn(toTx(q)));
  },
};

export interface Tx extends Queryable {
  one<T = Row>(text: string, params?: unknown[]): Promise<T | null>;
}

function toTx(q: Queryable): Tx {
  return {
    query: q.query,
    exec: q.exec,
    async one(text, params) {
      const rows = await q.query<any>(text, params);
      return rows[0] ?? null;
    },
  };
}

/**
 * Signed-in access: runs inside a transaction as gg_user with the person's id
 * in the JWT claims, so every row level security policy applies.
 */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await driver()).transaction(async (q) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await q.query(
      `select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('role', 'gg_user', true)`,
      [claims, userId],
    );
    return inUserTx.run(true, () => fn(toTx(q)));
  });
}

/** Turns a database permission error into a readable message. */
export function dbErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === '42501') return e.message?.includes('row-level security') ? "You don't have access to do that." : (e.message ?? "You don't have access to do that.");
  if (e?.code === '23505') return 'That already exists.';
  if (e?.code === '23514') return 'One of the values is out of range.';
  return 'Something went wrong. Try again.';
}
