import { vi } from 'vitest';
import { __createEmbeddedDriver, __createPostgresDriver, __setDriverForTests, migrate, type Driver } from '@/lib/db';
import { seedDemo } from '@/lib/db/demo-seed';

// next/headers is only available inside a request. Tests get an in-memory cookie jar.
export const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
  headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.9' }),
}));

let driver: Driver | undefined;

/**
 * Set TEST_DATABASE_URL (a Postgres server you can create databases on) to
 * run the suite against real Postgres instead of PGlite. Each test file gets
 * its own new database, named gg_test_<random>.
 */
async function postgresDriver(url: string): Promise<Driver> {
  const admin = await __createPostgresDriver(url);
  const name = `gg_test_${Math.random().toString(36).slice(2, 10)}`;
  await admin.query(`create database ${name}`);
  const u = new URL(url);
  u.pathname = `/${name}`;
  return __createPostgresDriver(u.toString());
}

/** A fresh database with every migration and the demo data (in memory unless TEST_DATABASE_URL is set). */
export async function freshDb({ seed = true } = {}): Promise<Driver> {
  driver = process.env.TEST_DATABASE_URL ? await postgresDriver(process.env.TEST_DATABASE_URL) : await __createEmbeddedDriver('memory://');
  await migrate(driver, { localAuth: true });
  if (seed) await seedDemo(driver);
  __setDriverForTests(driver);
  return driver;
}

export async function userId(email: string): Promise<string> {
  const rows = await driver!.query<{ id: string }>('select id from profiles where email = $1', [email]);
  if (!rows[0]) throw new Error(`no user ${email}`);
  return rows[0].id;
}
