import 'server-only';

/**
 * Runtime configuration. The app runs in one of two modes:
 *
 * - demo: no DATABASE_URL. An embedded Postgres (PGlite) runs inside the
 *   server with seeded data, sign-in uses links shown in an on-site outbox,
 *   and uploads are written to local disk. Nothing external is needed.
 * - live: DATABASE_URL and the Supabase keys are set. Data lives in Supabase
 *   Postgres, sign-in uses Supabase Auth magic links, files go to Supabase
 *   Storage.
 *
 * Payments and email are chosen separately: Stripe when its keys are set,
 * Resend when its key is set. See docs/SETUP.md.
 */
/**
 * GG_FORCE_DEMO=1 at build time makes a build demo-only: it ignores every
 * database, Supabase, Stripe and email setting, whatever the server has.
 * next.config.ts bakes the value into the build, so runtime settings can't
 * undo it. The demo site job uses it for preview deployments of the main
 * Vercel project, which carry the live settings.
 */
const forceDemo = process.env.GG_FORCE_DEMO === '1';
const LIVE_KEYS = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'ALLOW_SIMULATED_PAYMENTS',
];
const e: Record<string, string | undefined> = forceDemo
  ? Object.fromEntries(Object.entries(process.env).filter(([k]) => !LIVE_KEYS.includes(k)))
  : process.env;

const DEV_SECRET = 'gridiron-give-development-secret-change-me';

export const env = {
  appUrl: (
    e.NEXT_PUBLIC_APP_URL ??
    (e.VERCEL_ENV === 'production' && e.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`
      : e.VERCEL_URL
        ? `https://${e.VERCEL_URL}`
        : `http://localhost:${e.PORT ?? 3000}`)
  ).replace(/\/$/, ''),
  databaseUrl: e.DATABASE_URL || undefined,
  supabaseUrl: e.NEXT_PUBLIC_SUPABASE_URL || undefined,
  supabaseAnonKey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  supabaseServiceKey: e.SUPABASE_SERVICE_ROLE_KEY || undefined,
  stripeSecretKey: e.STRIPE_SECRET_KEY || undefined,
  stripePublishableKey: e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
  stripeWebhookSecret: e.STRIPE_WEBHOOK_SECRET || undefined,
  /** Stripe signs each event destination separately: one for platform events, one for connected accounts. */
  stripeWebhookSecrets: [e.STRIPE_WEBHOOK_SECRET, e.STRIPE_CONNECT_WEBHOOK_SECRET]
    .flatMap((v) => (v ?? '').split(','))
    .map((v) => v.trim())
    .filter(Boolean),
  resendApiKey: e.RESEND_API_KEY || undefined,
  emailFrom: e.EMAIL_FROM ?? 'Gridiron Give <notifications@gridirongive.com>',
  appSecret: e.APP_SECRET || DEV_SECRET,
  cronSecret: e.CRON_SECRET || undefined,
  adminEmails: (e.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  allowSimulatedPayments: e.ALLOW_SIMULATED_PAYMENTS === 'true',
  pgliteDir: e.PGLITE_DIR,
};

export const mode = {
  /** Embedded demo database and demo sign-in. */
  demo: !env.databaseUrl,
  payments: env.stripeSecretKey && env.stripePublishableKey ? ('stripe' as const) : ('simulated' as const),
  email: env.resendApiKey ? ('resend' as const) : ('outbox' as const),
  realtime: Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey),
};

/** Simulated payments are always allowed in demo mode, and only by explicit opt-in in live mode. */
export function paymentsAvailable(): boolean {
  return mode.payments === 'stripe' || mode.demo || env.allowSimulatedPayments;
}

export function assertLiveConfig(): string[] {
  const missing: string[] = [];
  if (mode.demo) return missing;
  if (!env.supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!env.supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!env.supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (env.appSecret === DEV_SECRET) missing.push('APP_SECRET');
  return missing;
}
