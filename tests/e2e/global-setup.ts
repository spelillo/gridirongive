import { rm } from 'node:fs/promises';

/** Starts each run from fresh demo data, unless testing an external server. */
export default async function globalSetup() {
  if (!process.env.E2E_BASE_URL) await rm('.data/e2e-pglite', { recursive: true, force: true });
}
