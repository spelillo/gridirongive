import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests. By default they build the app and start it in demo mode
 * against a separate embedded database (.data/e2e-pglite), so they never
 * touch your local demo data. Set E2E_BASE_URL to test a server that is
 * already running instead.
 */
const external = process.env.E2E_BASE_URL;
const port = 3200;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: external
    ? undefined
    : {
        // The server wipes its own database before it starts. Wiping it from
        // globalSetup instead deletes files under a server that already opened them.
        command: `node -e "require('fs').rmSync('.data/e2e-pglite',{recursive:true,force:true})" && npm run build && npx next start -p ${port}`,
        url: `http://localhost:${port}/`,
        timeout: 600_000,
        reuseExistingServer: !process.env.CI,
        env: { PGLITE_DIR: '.data/e2e-pglite', NEXT_PUBLIC_APP_URL: `http://localhost:${port}` },
      },
});
