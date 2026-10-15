#!/usr/bin/env node
/**
 * Deletes the embedded demo database so the next server start recreates it
 * from the migrations and the demo seed. Only touches .data/pglite (or PGLITE_DIR); a live
 * Supabase database is never affected.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';

if (process.env.DATABASE_URL) {
  console.error('DATABASE_URL is set. This script only resets the embedded demo database; unset it to continue.');
  process.exit(1);
}
const dir = process.env.PGLITE_DIR || path.join(process.cwd(), '.data', 'pglite');
await rm(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. Start the app (npm run dev) to recreate the demo data.`);
