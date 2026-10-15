import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
];

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres; keep it out of the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  // The demo database (PGlite) applies these SQL files at startup, so every
  // server route needs them in its bundle on Vercel.
  // Demo images live in public/demo and the media route reads them from disk.
  outputFileTracingIncludes: {
    '/*': ['./supabase/migrations/**/*.sql', './db/**/*.sql'],
    '/media/**': ['./public/demo/**/*'],
  },
  // Baked in at build time so a demo-only build stays demo-only (see src/lib/env.ts).
  env: { GG_FORCE_DEMO: process.env.GG_FORCE_DEMO === '1' ? '1' : '' },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
