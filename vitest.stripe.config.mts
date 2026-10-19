import { defineConfig } from 'vitest/config';
import base from './vitest.config.mts';

/** The Stripe sandbox check: tests/stripe only, one file at a time, with room for network calls. */
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tests/stripe/**/*.test.ts'], testTimeout: 90_000, fileParallelism: false },
});
