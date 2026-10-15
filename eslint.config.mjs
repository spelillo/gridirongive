import next from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...next,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', '.data/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
];
export default config;
