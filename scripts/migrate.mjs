#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql to the live database, in order, once
 * each. Applied files are recorded in public._migrations, the same table the
 * embedded demo database uses.
 *
 *   MIGRATION_DATABASE_URL=postgres://... npm run db:migrate
 *
 * Use Supabase's direct connection or session pooler (port 5432), not the
 * transaction pooler: migrations create functions and policies, which need a
 * session. Falls back to DATABASE_URL when MIGRATION_DATABASE_URL is unset.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set MIGRATION_DATABASE_URL (or DATABASE_URL) to your Supabase connection string.');
  process.exit(1);
}
const dir = path.join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const dryRun = process.argv.includes('--dry-run');

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.unsafe(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await sql`select name from _migrations`).map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));
  if (!pending.length) console.log('Database is up to date.');
  for (const name of pending) {
    if (dryRun) {
      console.log(`would apply ${name}`);
      continue;
    }
    const text = readFileSync(path.join(dir, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text).simple();
      await tx`insert into _migrations (name) values (${name})`;
    });
    console.log(`applied ${name}`);
  }
} catch (err) {
  console.error(`Migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
