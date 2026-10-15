import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env, mode } from '@/lib/env';
import { sys } from '@/lib/db';
import { sign, verifySigned, randomToken, sha256, sixDigitCode } from '@/lib/crypto';
import { notify, flushNotifications } from '@/lib/notify';
import { magicLinkEmail } from '@/lib/notify/templates';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  isAdmin: boolean;
}

const SESSION_COOKIE = 'gg_session';
const SESSION_DAYS = 30;

export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

/** Creates or refreshes the profile row and claims pending staff invites by email. */
export async function ensureProfile(id: string, email: string): Promise<SessionUser> {
  const isAdmin = env.adminEmails.includes(email.toLowerCase());
  const row = await sys.one<{ id: string; email: string; full_name: string | null; is_admin: boolean }>(
    `insert into profiles (id, email, is_admin) values ($1, $2, $3)
     on conflict (id) do update set email = excluded.email, is_admin = profiles.is_admin or excluded.is_admin
     returning id, email, full_name, is_admin`,
    [id, email.toLowerCase(), isAdmin],
  );
  await sys.query(
    `update team_members set user_id = $1, status = 'active'
     where lower(email) = lower($2) and user_id is null and status = 'invited'`,
    [id, email],
  );
  return { id: row!.id, email: row!.email, fullName: row!.full_name, isAdmin: row!.is_admin };
}

async function loadProfile(id: string): Promise<SessionUser | null> {
  const row = await sys.one<{ id: string; email: string; full_name: string | null; is_admin: boolean }>(
    'select id, email, full_name, is_admin from profiles where id = $1',
    [id],
  );
  return row ? { id: row.id, email: row.email, fullName: row.full_name, isAdmin: row.is_admin } : null;
}

/** The signed-in person for this request, or null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  if (mode.demo) {
    const store = await cookies();
    const payload = verifySigned('session', store.get(SESSION_COOKIE)?.value);
    if (!payload) return null;
    const [id, exp] = payload.split('|');
    if (!id || Number(exp) < Date.now()) return null;
    return loadProfile(id);
  }
  const { supabaseServer } = await import('@/lib/auth/supabase');
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return null;
  return (await loadProfile(data.user.id)) ?? ensureProfile(data.user.id, data.user.email);
});

export async function requireUser(nextPath = '/app'): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser('/app/admin');
  if (!user.isAdmin) redirect('/app');
  return user;
}

// Demo sign-in -----------------------------------------------------------------

async function setDemoSession(userId: string) {
  const store = await cookies();
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  store.set(SESSION_COOKIE, sign('session', `${userId}|${exp}`), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.appUrl.startsWith('https'),
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

async function demoUserForEmail(email: string): Promise<string> {
  const row = await sys.one<{ id: string }>(
    `insert into auth.users (email) values (lower($1)) on conflict (email) do update set email = excluded.email returning id`,
    [email],
  );
  await ensureProfile(row!.id, email);
  return row!.id;
}

/** Demo mode: sign straight in as a seeded account. */
export async function demoSignInAs(email: string) {
  if (!mode.demo) throw new Error('Not available');
  await setDemoSession(await demoUserForEmail(email));
}

// Magic links (both modes) -----------------------------------------------------

export async function sendMagicLink(email: string, next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return { ok: false, error: 'Enter a valid email address.' };
  const nextPath = safeNext(next);
  if (mode.demo) {
    const token = randomToken(32);
    const code = sixDigitCode();
    await sys.query(
      `insert into auth.demo_links (token_hash, email, next_path, code, expires_at) values ($1, $2, $3, $4, now() + interval '1 hour')`,
      [sha256(token), clean, nextPath, code],
    );
    const link = `${env.appUrl}/auth/callback?demo_token=${token}`;
    const tpl = magicLinkEmail(link, code);
    await notify(sys, { email: clean, kind: 'magic_link', subject: tpl.subject, body: tpl.body, link, inApp: false });
    await flushNotifications();
    return { ok: true };
  }
  const { supabaseServer } = await import('@/lib/auth/supabase');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { emailRedirectTo: `${env.appUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`, shouldCreateUser: true },
  });
  if (error) return { ok: false, error: error.status === 429 ? 'Too many sign-in emails. Wait a minute and try again.' : 'We could not send the email. Try again.' };
  return { ok: true };
}

export async function verifyEmailCode(email: string, code: string): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const clean = email.trim().toLowerCase();
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 6) return { ok: false, error: 'Enter the 6-digit code from the email.' };
  if (mode.demo) {
    const link = await sys.one<{ token_hash: string; next_path: string }>(
      `update auth.demo_links set used_at = now()
       where token_hash = (select token_hash from auth.demo_links where email = $1 and code = $2 and used_at is null and expires_at > now() order by expires_at desc limit 1)
       returning token_hash, next_path`,
      [clean, digits],
    );
    if (!link) return { ok: false, error: "That code doesn't match or has expired. Request a new email." };
    await setDemoSession(await demoUserForEmail(clean));
    return { ok: true, next: link.next_path || '/app' };
  }
  const { supabaseServer } = await import('@/lib/auth/supabase');
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ email: clean, token: digits, type: 'email' });
  if (error || !data.user?.email) return { ok: false, error: "That code doesn't match or has expired. Request a new email." };
  await ensureProfile(data.user.id, data.user.email);
  return { ok: true, next: '/app' };
}

/** Demo mode: consume a magic link token. */
export async function consumeDemoToken(token: string): Promise<string | null> {
  const link = await sys.one<{ email: string; next_path: string }>(
    `update auth.demo_links set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning email, next_path`,
    [sha256(token)],
  );
  if (!link) return null;
  await setDemoSession(await demoUserForEmail(link.email));
  return link.next_path || '/app';
}

export async function signOut() {
  if (mode.demo) {
    (await cookies()).delete(SESSION_COOKIE);
    return;
  }
  const { supabaseServer } = await import('@/lib/auth/supabase');
  await (await supabaseServer()).auth.signOut();
}
