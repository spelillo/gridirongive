#!/usr/bin/env node
/**
 * Connects the Vercel project to Supabase (and Stripe, when its keys are
 * given) and switches the site from demo to live. Meant to run from the
 * "Go live" GitHub Actions workflow, which has the network access and the
 * tokens; it can also run on any machine:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... VERCEL_TOKEN=... node scripts/go-live.mjs
 *
 * What it does, in order. Every step is safe to run again.
 *   1. Reads the Supabase project's API keys and pooler address.
 *   2. Finds the database password: SUPABASE_DB_PASSWORD, else the one the
 *      Supabase integration stored in Vercel, else sets a new one.
 *   3. Applies supabase/migrations (scripts/migrate.mjs).
 *   4. Sets the sign-in redirect URLs and the sign-in email templates.
 *   5. With STRIPE_SECRET_KEY: creates the two webhook destinations.
 *   6. Writes every environment variable to Vercel (Production and Preview),
 *      keeping APP_SECRET and CRON_SECRET if they already exist.
 *   7. Redeploys production from main and checks the live site.
 *
 * Settings (all optional except the two tokens):
 *   SUPABASE_PROJECT_REF   default piofwrrwsbyeyhkjwhme
 *   VERCEL_PROJECT         default gridirongive
 *   VERCEL_TEAM            team slug, default synth10
 *   APP_URL                default https://gridirongive-nine.vercel.app
 *   ADMIN_EMAILS           default spelillo11@gmail.com
 *   SUPABASE_DB_PASSWORD   use this password instead of finding or setting one
 *   STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
 *   SKIP_DEPLOY=1          stop after writing the environment variables
 *
 * Values that are secret are registered with GitHub's log masking before
 * anything is printed, and are never printed themselves.
 */
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import postgres from 'postgres';

const e = process.env;
const cfg = {
  supabaseToken: e.SUPABASE_ACCESS_TOKEN?.trim(),
  vercelToken: e.VERCEL_TOKEN?.trim(),
  ref: e.SUPABASE_PROJECT_REF?.trim() || 'piofwrrwsbyeyhkjwhme',
  vercelProject: e.VERCEL_PROJECT?.trim() || 'gridirongive',
  vercelTeam: e.VERCEL_TEAM?.trim() || 'synth10',
  appUrl: (e.APP_URL?.trim() || 'https://gridirongive-nine.vercel.app').replace(/\/$/, ''),
  adminEmails: e.ADMIN_EMAILS?.trim() || 'spelillo11@gmail.com',
  dbPassword: e.SUPABASE_DB_PASSWORD?.trim() || undefined,
  stripeSecret: e.STRIPE_SECRET_KEY?.trim() || undefined,
  stripePublishable: e.STRIPE_PUBLISHABLE_KEY?.trim() || undefined,
  skipDeploy: e.SKIP_DEPLOY === '1',
  // Overridable so the script can be tested against local stand-ins.
  supabaseApi: e.SUPABASE_API_BASE || 'https://api.supabase.com',
  vercelApi: e.VERCEL_API_BASE || 'https://api.vercel.com',
  stripeApi: e.STRIPE_API_BASE || 'https://api.stripe.com',
  poolerPorts: { transaction: Number(e.POOLER_TRANSACTION_PORT || 6543), session: Number(e.POOLER_SESSION_PORT || 5432) },
  poolerHostOverride: e.POOLER_HOST_OVERRIDE || undefined,
  waitMs: Number(e.GO_LIVE_WAIT_MS || 10_000),
};

const inActions = Boolean(e.GITHUB_ACTIONS);
const summary = [];
const mask = (v) => {
  if (v && inActions) console.log(`::add-mask::${v}`);
  return v;
};
const step = (title) => console.log(`\n== ${title}`);
const note = (line) => {
  console.log(line);
  summary.push(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newSecret = () => mask(randomBytes(32).toString('base64url'));

class ApiError extends Error {
  constructor(service, method, path, status, body) {
    super(`${service} ${method} ${path} returned ${status}: ${String(body).slice(0, 300)}`);
    this.status = status;
  }
}

async function call(service, base, token, method, path, body, { form = false } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body !== undefined) {
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(body).toString();
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  const text = await res.text();
  if (!res.ok) throw new ApiError(service, method, path.split('?')[0], res.status, text);
  return text ? JSON.parse(text) : null;
}
const sb = (method, path, body) => call('Supabase', cfg.supabaseApi, cfg.supabaseToken, method, path, body);
let teamQuery = '';
const vc = (method, path, body) => {
  const sep = path.includes('?') ? '&' : '?';
  return call('Vercel', cfg.vercelApi, cfg.vercelToken, method, `${path}${teamQuery ? sep + teamQuery : ''}`, body);
};
const st = (method, path, body) => call('Stripe', cfg.stripeApi, cfg.stripeSecret, method, path, body, { form: true });

function dbUrl(user, password, host, port) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
}

async function canConnect(url) {
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  try {
    await sql`select 1`;
    return true;
  } catch (err) {
    console.log(`  connection attempt failed: ${err.code ?? ''} ${err.message.split('\n')[0]}`);
    return false;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

async function main() {
  const missing = [!cfg.supabaseToken && 'SUPABASE_ACCESS_TOKEN', !cfg.vercelToken && 'VERCEL_TOKEN'].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(' and ')}. Add ${missing.length > 1 ? 'them' : 'it'} as repository secrets (Settings > Secrets and variables > Actions).`);
  }
  [cfg.supabaseToken, cfg.vercelToken, cfg.dbPassword, cfg.stripeSecret].forEach(mask);

  // ---------------------------------------------------------------- Vercel project
  step('Vercel project');
  const teams = await call('Vercel', cfg.vercelApi, cfg.vercelToken, 'GET', '/v2/teams?limit=100').catch((err) => {
    if (err.status === 403) return { teams: [] };
    throw err;
  });
  const team = (teams?.teams ?? []).find((t) => t.slug === cfg.vercelTeam || t.id === cfg.vercelTeam);
  if (team) teamQuery = `teamId=${encodeURIComponent(team.id)}`;
  const project = await vc('GET', `/v9/projects/${encodeURIComponent(cfg.vercelProject)}`);
  note(`Vercel project: ${project.name}${team ? ` (team ${team.slug})` : ''}`);
  const envList = (await vc('GET', `/v9/projects/${project.id}/env`)).envs ?? [];
  const envByKey = new Map();
  for (const env of envList) {
    if (!envByKey.has(env.key)) envByKey.set(env.key, []);
    envByKey.get(env.key).push(env);
  }
  async function readEnv(key) {
    for (const env of envByKey.get(key) ?? []) {
      if (env.type === 'sensitive' || env.type === 'secret') continue;
      const full = await vc('GET', `/v1/projects/${project.id}/env/${env.id}`).catch(() => null);
      if (full?.value) return mask(full.value);
    }
    return undefined;
  }

  // ---------------------------------------------------------------- Supabase project
  step('Supabase project');
  const sbProject = await sb('GET', `/v1/projects/${cfg.ref}`);
  note(`Supabase project: ${sbProject.name} (${sbProject.region})`);
  const supabaseUrl = `https://${cfg.ref}.supabase.co`;
  const keys = await sb('GET', `/v1/projects/${cfg.ref}/api-keys?reveal=true`);
  const pick = (names) => keys.find((k) => names.includes(k.name) || names.includes(k.type))?.api_key;
  const anonKey = mask(pick(['anon']) ?? pick(['publishable']));
  const serviceKey = mask(pick(['service_role']) ?? pick(['secret']));
  if (!anonKey || !serviceKey) throw new Error('Could not read the Supabase anon and service_role keys.');
  console.log('  read the anon and service_role keys');

  let poolerHost = cfg.poolerHostOverride;
  let poolerUser = `postgres.${cfg.ref}`;
  if (!poolerHost) {
    const pooler = await sb('GET', `/v1/projects/${cfg.ref}/config/database/pooler`).catch(() => null);
    const primary = Array.isArray(pooler) ? (pooler.find((p) => p.database_type === 'PRIMARY') ?? pooler[0]) : pooler;
    poolerHost = primary?.db_host ?? `aws-0-${sbProject.region}.pooler.supabase.com`;
    if (primary?.db_user) poolerUser = primary.db_user;
  }
  console.log(`  pooler: ${poolerHost}`);

  // ---------------------------------------------------------------- database password
  step('Database password');
  const urlsFor = (pw) => ({
    transaction: dbUrl(poolerUser, pw, poolerHost, cfg.poolerPorts.transaction),
    session: dbUrl(poolerUser, pw, poolerHost, cfg.poolerPorts.session),
  });
  const candidates = [];
  if (cfg.dbPassword) candidates.push(['SUPABASE_DB_PASSWORD', cfg.dbPassword]);
  const fromIntegration = await readEnv('POSTGRES_PASSWORD');
  if (fromIntegration) candidates.push(['the Supabase integration in Vercel', fromIntegration]);
  const existingDbUrl = await readEnv('DATABASE_URL');
  if (existingDbUrl) {
    try {
      const pw = decodeURIComponent(new URL(existingDbUrl).password);
      if (pw) candidates.push(['the existing DATABASE_URL', mask(pw)]);
    } catch {}
  }
  let password;
  for (const [source, pw] of candidates) {
    if (await canConnect(urlsFor(pw).session)) {
      password = pw;
      note(`Database password: from ${source}`);
      break;
    }
  }
  if (!password) {
    password = mask(randomBytes(24).toString('hex'));
    await sb('POST', `/v1/projects/${cfg.ref}/database/query`, { query: `alter role postgres with password '${password}'` });
    note('Database password: set a new one (stored only in Vercel as part of DATABASE_URL)');
    let ok = false;
    for (let i = 0; i < 12 && !ok; i++) {
      if (i) await sleep(cfg.waitMs);
      ok = await canConnect(urlsFor(password).session);
    }
    if (!ok) throw new Error('Set a new database password but could not connect with it through the pooler.');
  }
  const urls = urlsFor(password);
  mask(urls.transaction);
  mask(urls.session);
  if (!(await canConnect(urls.transaction))) throw new Error('The transaction pooler (port 6543) refused the connection.');
  console.log('  both pooler connections work');

  // ---------------------------------------------------------------- migrations
  step('Database tables');
  execFileSync(process.execPath, ['scripts/migrate.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, MIGRATION_DATABASE_URL: urls.session, DATABASE_URL: '' },
  });
  note('Database tables: migrations applied');

  // ---------------------------------------------------------------- sign-in settings
  step('Sign-in settings');
  const auth = await sb('GET', `/v1/projects/${cfg.ref}/config/auth`);
  const allow = new Set(String(auth.uri_allow_list ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  allow.add(`${cfg.appUrl}/auth/callback`);
  allow.add(`${cfg.appUrl}/**`);
  const link = '{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email';
  const body = (lead) =>
    `<h2>${lead}</h2>\n<p><a href="${link}">Sign in</a>. The link works for 1 hour.</p>\n<p>Or enter this code: <strong>{{ .Token }}</strong></p>\n<p>If you didn't ask for this, you can ignore it.</p>`;
  await sb('PATCH', `/v1/projects/${cfg.ref}/config/auth`, {
    site_url: cfg.appUrl,
    uri_allow_list: [...allow].join(','),
    mailer_subjects_magic_link: 'Your Gridiron Give sign-in',
    mailer_templates_magic_link_content: body('Sign in to Gridiron Give'),
    mailer_subjects_confirmation: 'Your Gridiron Give sign-in',
    mailer_templates_confirmation_content: body('Welcome to Gridiron Give'),
  });
  note(`Sign-in: site URL ${cfg.appUrl}, callback allowed, email templates set`);

  // ---------------------------------------------------------------- Stripe
  const vars = {
    NEXT_PUBLIC_APP_URL: cfg.appUrl,
    ADMIN_EMAILS: cfg.adminEmails,
    DATABASE_URL: urls.transaction,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  };
  if (cfg.stripeSecret) {
    step('Stripe');
    const hookUrl = `${cfg.appUrl}/api/stripe/webhook`;
    const specs = [
      { connect: false, key: 'STRIPE_WEBHOOK_SECRET', events: ['payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'] },
      { connect: true, key: 'STRIPE_CONNECT_WEBHOOK_SECRET', events: ['account.updated', 'payout.created', 'payout.updated', 'payout.paid', 'payout.failed'] },
    ];
    const existing = (await st('GET', '/v1/webhook_endpoints?limit=100')).data ?? [];
    for (const spec of specs) {
      const current = existing.find((w) => w.url === hookUrl && Boolean(w.application) === spec.connect);
      const stored = await readEnv(spec.key);
      if (current && (stored || envByKey.get(spec.key)?.length)) {
        console.log(`  ${spec.key}: destination exists and Vercel has its secret`);
        await st('POST', `/v1/webhook_endpoints/${current.id}`, Object.fromEntries(spec.events.map((ev, i) => [`enabled_events[${i}]`, ev])));
        continue;
      }
      if (current) await st('DELETE', `/v1/webhook_endpoints/${current.id}`);
      const form = { url: hookUrl, description: spec.connect ? 'Gridiron Give: connected accounts' : 'Gridiron Give: payments' };
      if (spec.connect) form.connect = 'true';
      spec.events.forEach((ev, i) => (form[`enabled_events[${i}]`] = ev));
      const created = await st('POST', '/v1/webhook_endpoints', form);
      vars[spec.key] = mask(created.secret);
      console.log(`  ${spec.key}: destination created`);
    }
    vars.STRIPE_SECRET_KEY = cfg.stripeSecret;
    if (cfg.stripePublishable) vars.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = cfg.stripePublishable;
    else note('Stripe: STRIPE_PUBLISHABLE_KEY not given, so the publishable key was not set');
    note(`Stripe: ${cfg.stripeSecret.startsWith('sk_live_') ? 'live' : 'test'} keys, two webhook destinations at ${hookUrl}`);
  } else {
    note('Stripe: skipped (no STRIPE_SECRET_KEY). Gifts stay off until it is added.');
  }

  // ---------------------------------------------------------------- Vercel environment
  step('Vercel environment variables');
  const keepIfPresent = { APP_SECRET: newSecret, CRON_SECRET: newSecret };
  for (const [key, make] of Object.entries(keepIfPresent)) {
    if (envByKey.get(key)?.length) console.log(`  ${key}: kept the existing value`);
    else vars[key] = make();
  }
  const target = ['production', 'preview'];
  const sensitive = new Set(['DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET', 'APP_SECRET', 'CRON_SECRET']);
  for (const [key, value] of Object.entries(vars)) {
    const type = sensitive.has(key) ? 'sensitive' : 'encrypted';
    const existingEntries = envByKey.get(key) ?? [];
    // One entry per key covering Production and Preview. Entries an
    // integration manages can't be deleted, so those are updated in place.
    let kept = false;
    for (const old of existingEntries) {
      try {
        await vc('DELETE', `/v9/projects/${project.id}/env/${old.id}`);
      } catch {
        try {
          await vc('PATCH', `/v9/projects/${project.id}/env/${old.id}`, { value, target: [...new Set([...(old.target ?? []), ...target])] });
          kept = true;
        } catch (err) {
          throw new Error(`Could not replace ${key} in Vercel: ${err.message}`);
        }
      }
    }
    if (!kept) await vc('POST', `/v10/projects/${project.id}/env`, { key, value, type, target });
    console.log(`  ${key}: ${existingEntries.length ? 'replaced' : 'added'}`);
  }
  note(`Vercel: ${Object.keys(vars).length} environment variables written for Production and Preview`);

  // ---------------------------------------------------------------- deploy and check
  if (cfg.skipDeploy) {
    note('Deploy: skipped (SKIP_DEPLOY=1)');
    return;
  }
  step('Production deploy');
  const repoId = project.link?.repoId;
  if (!repoId) throw new Error('The Vercel project is not linked to a GitHub repository, so it cannot be redeployed from main.');
  const deployment = await vc('POST', '/v13/deployments', {
    name: project.name,
    project: project.id,
    target: 'production',
    gitSource: { type: 'github', repoId, ref: project.link?.productionBranch || 'main' },
  });
  console.log(`  started ${deployment.id}`);
  let state = deployment.readyState;
  for (let i = 0; i < 90 && !['READY', 'ERROR', 'CANCELED'].includes(state); i++) {
    await sleep(cfg.waitMs);
    state = (await vc('GET', `/v13/deployments/${deployment.id}`)).readyState;
    console.log(`  ${state}`);
  }
  if (state !== 'READY') throw new Error(`The production deploy ended as ${state}. Open it in Vercel to see the build log.`);
  note('Deploy: production rebuilt from main and is Ready');

  step('Live site check');
  const home = await fetch(cfg.appUrl, { redirect: 'follow' });
  const html = await home.text();
  if (!home.ok) throw new Error(`${cfg.appUrl} returned ${home.status}.`);
  if (html.includes('Demo mode:')) throw new Error(`${cfg.appUrl} still shows the demo banner; the new variables did not reach the deployment.`);
  const signIn = await fetch(`${cfg.appUrl}/sign-in`);
  if (!signIn.ok) throw new Error(`${cfg.appUrl}/sign-in returned ${signIn.status}.`);
  const cron = vars.CRON_SECRET ?? (await readEnv('CRON_SECRET'));
  if (cron) {
    const job = await fetch(`${cfg.appUrl}/api/cron/daily`, { headers: { Authorization: `Bearer ${cron}` } });
    if (!job.ok) throw new Error(`The daily job returned ${job.status}: ${(await job.text()).slice(0, 300)}`);
    note('Live check: home page and sign-in load without the demo banner, and the daily job runs against the live database');
  } else {
    note('Live check: home page and sign-in load without the demo banner');
  }
}

main()
  .then(() => {
    note('Done.');
  })
  .catch((err) => {
    console.error(`\nGo live failed: ${err.message}`);
    summary.push(`**Failed:** ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (e.GITHUB_STEP_SUMMARY) appendFileSync(e.GITHUB_STEP_SUMMARY, `## Go live\n\n${summary.map((l) => `- ${l}`).join('\n')}\n`);
  });
