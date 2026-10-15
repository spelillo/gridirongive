#!/usr/bin/env node
/**
 * Hosts the demo (sample teams, players and gifts) as a preview deployment
 * of the Vercel project, never production. The build is made with
 * GG_FORCE_DEMO=1, which makes it ignore every database, Supabase, Stripe
 * and email setting (see src/lib/env.ts), so it runs on its embedded demo
 * database and can't reach the real accounts even though the project has
 * them. If a separate project with no live settings exists (DEMO_VERCEL_PROJECT),
 * that one is used instead.
 *
 *   node scripts/demo-preview.mjs prepare        find the project and link the deploy to it
 *   node scripts/demo-preview.mjs check <url>    smoke-test a deployment and print the demo address
 *                                                (without VERCEL_TOKEN it checks <url> itself, e.g. http://localhost:3000)
 *
 * Run by .github/workflows/demo-preview.yml. Needs VERCEL_TOKEN.
 *
 * Optional:
 *   DEMO_VERCEL_PROJECT    a demo-only project to prefer, default gridirongive-demo
 *   VERCEL_PROJECT         the main project, default gridirongive
 *   VERCEL_TEAM            default synth10
 */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const e = process.env;
const token = e.VERCEL_TOKEN?.trim();
const demoProjectName = e.DEMO_VERCEL_PROJECT?.trim() || 'gridirongive-demo';
const mainProjectName = e.VERCEL_PROJECT?.trim() || 'gridirongive';
const teamSlug = e.VERCEL_TEAM?.trim() || 'synth10';
const api = e.VERCEL_API_BASE || 'https://api.vercel.com';

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

/** A token scoped to one team can't list teams; name the team by its slug instead. */
async function findTeam() {
  const teams = await vc('GET', '/v2/teams?limit=100').catch((err) => {
    if (String(err.message).includes('(403)')) return null;
    throw err;
  });
  const team = (teams?.teams ?? []).find((t) => t.slug === teamSlug || t.id === teamSlug);
  teamQuery = team ? `teamId=${encodeURIComponent(team.id)}` : `slug=${encodeURIComponent(teamSlug)}`;
}

async function prepare() {
  await findTeam();
  const project =
    (await vc('GET', `/v9/projects/${encodeURIComponent(demoProjectName)}`)) ?? (await vc('GET', `/v9/projects/${encodeURIComponent(mainProjectName)}`));
  if (!project) throw new Error(`The Vercel token can't see the project "${mainProjectName}".`);
  console.log(`Deploying a demo-only preview of ${project.name}`);
  output('VERCEL_ORG_ID', project.accountId);
  output('VERCEL_PROJECT_ID', project.id);
  // Preview deployments may sit behind Vercel's login. A bypass secret, when the
  // project has one, lets the smoke test through; it is never printed.
  const bypass = Object.keys(project.protectionBypass ?? {})[0];
  if (bypass && e.GITHUB_ENV) {
    console.log(`::add-mask::${bypass}`);
    appendFileSync(e.GITHUB_ENV, `VERCEL_BYPASS=${bypass}\n`);
  }
  if (project.ssoProtection) console.log('Preview deployments ask for a Vercel login (Deployment Protection).');
}

/** Vercel's Deployment Protection answers with 401, or a redirect to its login page. */
function isLoginWall(res) {
  const to = res.headers.get('location') ?? '';
  return res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400 && /vercel\.com|_vercel\/sso/.test(to));
}

/**
 * Behind Vercel's login, check the main pages with `vercel curl`, which gets
 * through with the token. The cookie-based steps (team code, sign-in) are
 * covered by the browser tests instead.
 */
function checkBehindLogin(base) {
  console.log(`${base} asks for a Vercel login. Checking it with vercel curl.`);
  for (const [path, text] of [['/', 'Demo mode'], ['/search?q=central', 'Central High'], ['/demo', 'Demo'], ['/sign-in', 'Sign in']]) {
    let body = '';
    let note = '';
    try {
      body = execFileSync('npx', ['--yes', 'vercel@62.0.0', '--token', token, 'curl', path, '--deployment', base, '--yes'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch (err) {
      body = String(err.stdout ?? '');
      note = String(err.stderr ?? err.message).trim().split('\n').slice(-6).join('\n    ');
    }
    const ok = body.includes(text);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${path}`);
    if (!ok) console.log(`    ${note || body.slice(0, 400)}`);
    if (!ok) throw new Error(`${path} did not load as expected`);
  }
  output('DEMO_URL', base);
  if (e.GITHUB_STEP_SUMMARY) appendFileSync(e.GITHUB_STEP_SUMMARY, `### Demo site\n\n${base}\n\nSample data only. Sign in to Vercel to open it.\n`);
}

const bypassHeaders = () => (e.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': e.VERCEL_BYPASS } : {});
const get = (url, init = {}) => fetch(url, { ...init, headers: { ...bypassHeaders(), ...(init.headers ?? {}) } });

async function expectPage(base, path, text, init) {
  const res = await get(`${base}${path}`, { redirect: 'manual', ...init });
  const body = res.status < 300 ? await res.text() : '';
  const ok = res.status < 400 && (!text || body.includes(text));
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${path} (${res.status})`);
  if (!ok) throw new Error(`${path} did not load as expected`);
  return res;
}

async function check(deploymentUrl) {
  const base = deploymentUrl.replace(/\/$/, '');
  console.log(`Checking ${base}`);
  // The first request on a new server instance seeds the demo data, which takes a few seconds.
  for (let i = 0; ; i++) {
    const res = await get(base, { redirect: 'manual' }).catch(() => null);
    if (res && isLoginWall(res)) return checkBehindLogin(base);
    if (res?.ok) break;
    if (i === 10) throw new Error(`${base} is not responding (${res?.status ?? 'no response'})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  await expectPage(base, '/', 'Demo mode');
  await expectPage(base, '/search?q=central', 'Central High');
  const unlock = await get(`${base}/api/unlock/link?slug=central-high-football&code=KX7P2Q`, { redirect: 'manual' });
  const codeCookie = unlock.headers.get('set-cookie')?.split(';')[0] ?? '';
  await expectPage(base, '/t/central-high-football', 'Ethan D.', { headers: { cookie: codeCookie } });
  await expectPage(base, '/t/central-high-football/ethan-d-3', 'Helmet', { headers: { cookie: codeCookie } });
  await expectPage(base, '/demo', 'Demo');
  const athlete = await get(`${base}/t/central-high-football/ethan-d-3`, { headers: { cookie: codeCookie } }).then((r) => r.text());
  const img = athlete.match(/\/media\/athlete\/[0-9a-f-]{36}[^"]*/)?.[0]?.replace(/&amp;/g, '&');
  if (img) await expectPage(base, img, '', { headers: { cookie: codeCookie } });
  const form = new FormData();
  form.set('email', 'coach.alex@example.com');
  form.set('next', '/app');
  const signIn = await get(`${base}/api/auth/demo`, { method: 'POST', body: form, redirect: 'manual' });
  const cookie = signIn.headers.get('set-cookie')?.split(';')[0];
  console.log(`  ${cookie ? 'ok  ' : 'FAIL'} demo sign-in (${signIn.status})`);
  if (!cookie) throw new Error('Demo sign-in did not set a session');
  const app = await get(`${base}/app`, { headers: { cookie }, redirect: 'manual' });
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
