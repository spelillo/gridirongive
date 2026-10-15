#!/usr/bin/env node
/**
 * Hosts the demo (sample teams, players and gifts) on its own Vercel project,
 * separate from the live site. The demo project has no database or payment
 * settings, so the app runs in demo mode on its embedded database and can
 * never reach the real Supabase or Stripe accounts.
 *
 *   node scripts/demo-preview.mjs prepare        find or create the project, refuse if it has live settings
 *   node scripts/demo-preview.mjs check <url>    smoke-test a deployment and print the demo address
 *                                                (without VERCEL_TOKEN it checks <url> itself, e.g. http://localhost:3000)
 *
 * Run by .github/workflows/demo-preview.yml. Needs VERCEL_TOKEN.
 *
 * Optional:
 *   DEMO_VERCEL_PROJECT    default gridirongive-demo
 *   VERCEL_TEAM            default synth10
 */
import { appendFileSync } from 'node:fs';

const e = process.env;
const token = e.VERCEL_TOKEN?.trim();
const projectName = e.DEMO_VERCEL_PROJECT?.trim() || 'gridirongive-demo';
const teamSlug = e.VERCEL_TEAM?.trim() || 'synth10';
const api = e.VERCEL_API_BASE || 'https://api.vercel.com';

/** Settings that would switch the app out of demo mode or connect it to real accounts. */
const LIVE_SETTINGS = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
];

let teamQuery = '';
async function vc(method, path, body) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${api}${path}${teamQuery ? sep + teamQuery : ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Vercel ${method} ${path.split('?')[0]} failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function output(name, value) {
  console.log(`${name}=${value}`);
  if (e.GITHUB_ENV) appendFileSync(e.GITHUB_ENV, `${name}=${value}\n`);
}

async function findTeam() {
  const teams = await vc('GET', '/v2/teams?limit=100');
  const team = (teams?.teams ?? []).find((t) => t.slug === teamSlug || t.id === teamSlug);
  if (!team) throw new Error(`The Vercel token can't see the team "${teamSlug}".`);
  teamQuery = `teamId=${encodeURIComponent(team.id)}`;
  return team;
}

async function prepare() {
  const team = await findTeam();
  let project = await vc('GET', `/v9/projects/${encodeURIComponent(projectName)}`);
  if (!project) {
    console.log(`Creating Vercel project ${projectName}`);
    project = await vc('POST', '/v11/projects', { name: projectName, framework: 'nextjs' });
  } else {
    console.log(`Using Vercel project ${projectName}`);
  }
  const envs = (await vc('GET', `/v9/projects/${project.id}/env`))?.envs ?? [];
  const live = envs.map((v) => v.key).filter((k) => LIVE_SETTINGS.includes(k));
  if (live.length) {
    throw new Error(`The demo project has live settings (${live.join(', ')}). Remove them in Vercel so the demo can't reach real data.`);
  }
  output('VERCEL_ORG_ID', team.id);
  output('VERCEL_PROJECT_ID', project.id);
}

async function expectPage(base, path, text, init) {
  const res = await fetch(`${base}${path}`, { redirect: 'manual', ...init });
  const body = res.status < 300 ? await res.text() : '';
  const ok = res.status < 400 && (!text || body.includes(text));
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${path} (${res.status})`);
  if (!ok) throw new Error(`${path} did not load as expected`);
  return res;
}

async function demoAddress(deploymentUrl) {
  if (!token) return deploymentUrl.replace(/\/$/, '');
  await findTeam();
  const project = await vc('GET', `/v9/projects/${encodeURIComponent(projectName)}`);
  const domains = (await vc('GET', `/v9/projects/${project.id}/domains`))?.domains ?? [];
  const domain = domains.map((d) => d.name).find((n) => n.endsWith('.vercel.app')) ?? domains[0]?.name;
  return domain ? `https://${domain}` : deploymentUrl.replace(/\/$/, '');
}

async function check(deploymentUrl) {
  const base = await demoAddress(deploymentUrl);
  console.log(`Checking ${base}`);
  // The first request on a new server instance seeds the demo data, which takes a few seconds.
  for (let i = 0; ; i++) {
    const res = await fetch(base).catch(() => null);
    if (res?.ok) break;
    if (i === 10) throw new Error(`${base} is not responding (${res?.status ?? 'no response'})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  await expectPage(base, '/', 'Demo mode');
  await expectPage(base, '/search?q=central', 'Central High');
  const unlock = await fetch(`${base}/api/unlock/link?slug=central-high-football&code=KX7P2Q`, { redirect: 'manual' });
  const codeCookie = unlock.headers.get('set-cookie')?.split(';')[0] ?? '';
  await expectPage(base, '/t/central-high-football', 'Ethan D.', { headers: { cookie: codeCookie } });
  await expectPage(base, '/t/central-high-football/ethan-d-3', 'Helmet', { headers: { cookie: codeCookie } });
  await expectPage(base, '/demo', 'Demo');
  const athlete = await fetch(`${base}/t/central-high-football/ethan-d-3`, { headers: { cookie: codeCookie } }).then((r) => r.text());
  const img = athlete.match(/\/media\/athlete\/[0-9a-f-]{36}[^"]*/)?.[0]?.replace(/&amp;/g, '&');
  if (img) await expectPage(base, img, '', { headers: { cookie: codeCookie } });
  const form = new FormData();
  form.set('email', 'coach.alex@example.com');
  form.set('next', '/app');
  const signIn = await fetch(`${base}/api/auth/demo`, { method: 'POST', body: form, redirect: 'manual' });
  const cookie = signIn.headers.get('set-cookie')?.split(';')[0];
  console.log(`  ${cookie ? 'ok  ' : 'FAIL'} demo sign-in (${signIn.status})`);
  if (!cookie) throw new Error('Demo sign-in did not set a session');
  const app = await fetch(`${base}/app`, { headers: { cookie }, redirect: 'manual' });
  const where = app.headers.get('location') ?? '';
  console.log(`  ${where.includes('/app/manager/') ? 'ok  ' : 'FAIL'} coach lands on the team dashboard (${app.status} ${where})`);
  if (!where.includes('/app/manager/')) throw new Error('Signed-in coach did not land on the team dashboard');
  await expectPage(base, where.replace(base, ''), 'Available to spend', { headers: { cookie } });
  output('DEMO_URL', base);
  if (e.GITHUB_STEP_SUMMARY) appendFileSync(e.GITHUB_STEP_SUMMARY, `### Demo site\n\n${base}\n\nSample data only. It is not connected to the live database or payments.\n`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  // check works without a token against any address, for example a local server.
  if (!token && cmd !== 'check') throw new Error('VERCEL_TOKEN is not set. Add it under Settings > Secrets and variables > Actions.');
  if (cmd === 'prepare') return prepare();
  if (cmd === 'check' && arg) return check(arg);
  throw new Error('Usage: demo-preview.mjs prepare | check <deployment url>');
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
