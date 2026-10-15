import 'server-only';
import { env, mode } from '@/lib/env';
import { sys, type Queryable } from '@/lib/db';

type Q = Pick<Queryable, 'query'>;
import { renderEmailHtml, digestEmail } from './templates';

export interface NotificationInput {
  userId?: string | null;
  email?: string | null;
  kind: string;
  subject: string;
  body: string;
  link?: string | null;
  inApp?: boolean;
  sendEmail?: boolean;
}

/** Emails that people can't switch off: payments, security and consent. */
export const ALWAYS_EMAIL = new Set([
  'magic_link', 'receipt', 'invite', 'invite_reminder', 'consent_confirmation', 'payout_issue', 'refund', 'staff_invite', 'team_suspended',
]);

export type PrefCategory = 'donations' | 'approvals' | 'updates';
export type PrefValue = 'instant' | 'digest' | 'off';

/** Kinds not listed here fall under "updates". */
export const PREF_CATEGORY: Record<string, PrefCategory> = {
  new_gift: 'donations',
  item_funded: 'donations',
  overflow: 'donations',
  approval_needed: 'approvals',
  invite_resend: 'approvals',
};

/**
 * Status and error marker for email held for the daily digest. The row
 * stays 'skipped' (nothing goes out now) until sendDigests() picks it up.
 */
const DIGEST_HOLD = 'held_for_digest';

/** What happens to the email part of a notification for this person. */
export function emailDecision(kind: string, prefs: Record<string, string> | null | undefined, hasUser: boolean): PrefValue {
  if (ALWAYS_EMAIL.has(kind) || !hasUser) return 'instant';
  const v = prefs?.[PREF_CATEGORY[kind] ?? 'updates'];
  return v === 'digest' || v === 'off' ? v : 'instant';
}

/** Queues a notification. Pass the transaction so it commits with the change that caused it. */
export async function notify(q: Q, n: NotificationInput) {
  await q.query(
    `insert into notifications (user_id, email, kind, subject, body, link, in_app, send_email)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [n.userId ?? null, n.email ?? null, n.kind, n.subject, n.body, n.link ?? null, n.inApp ?? Boolean(n.userId), n.sendEmail ?? true],
  );
}

/** Notifies every active coach and staff member of a team. */
export async function notifyTeamStaff(q: Q, teamId: string, n: Omit<NotificationInput, 'userId' | 'email'>) {
  const staff = await q.query<{ user_id: string }>(
    `select user_id from team_members where team_id = $1 and status = 'active' and role in ('coach', 'staff') and user_id is not null`,
    [teamId],
  );
  for (const s of staff) await notify(q, { ...n, userId: s.user_id });
}

/** Notifies the guardians (and optionally the athlete) linked to an athlete. */
export async function notifyAthleteFamily(q: Q, athleteId: string, n: Omit<NotificationInput, 'userId' | 'email'>, includeAthlete = true) {
  const people = await q.query<{ user_id: string }>(
    `select user_id from athlete_access where athlete_id = $1 ${includeAthlete ? '' : "and role = 'guardian'"}`,
    [athleteId],
  );
  for (const p of people) await notify(q, { ...n, userId: p.user_id });
}

interface Queued {
  id: string;
  user_id: string | null;
  email: string | null;
  kind: string;
  subject: string;
  body: string;
  link: string | null;
  send_email: boolean;
  profile_email: string | null;
  email_prefs: Record<string, string> | null;
}

async function deliver(to: string, subject: string, text: string, link: string | null): Promise<void> {
  if (mode.email === 'outbox') return; // Stored in the notifications table and shown at /dev/outbox.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, text: link ? `${text}\n\n${link}` : text, html: renderEmailHtml(subject, text, link) }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

/**
 * Sends queued email. Called right after actions that queue mail, and by the
 * daily cron as a safety net. Each row is claimed before sending so two
 * runners never send the same email twice.
 */
export async function flushNotifications(limit = 50): Promise<{ sent: number; failed: number; skipped: number }> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const rows = await sys.query<Queued>(
    `update notifications n set status = 'sent', sent_at = now()
     from (select id from notifications where status = 'queued' order by created_at limit $1 for update skip locked) q
     where n.id = q.id
     returning n.id, n.user_id, n.email, n.kind, n.subject, n.body, n.link, n.send_email,
       (select email from profiles p where p.id = n.user_id) as profile_email,
       (select email_prefs from profiles p where p.id = n.user_id) as email_prefs`,
    [limit],
  );
  for (const r of rows) {
    const to = r.email ?? r.profile_email;
    const decision = emailDecision(r.kind, r.email_prefs, Boolean(r.user_id));
    if (!r.send_email || !to || decision === 'off') {
      // In-app copies stay visible on the bell; only the email is dropped.
      await sys.query(`update notifications set status = 'skipped' where id = $1`, [r.id]);
      skipped++;
      continue;
    }
    if (decision === 'digest') {
      await sys.query(`update notifications set status = 'skipped', sent_at = null, error = $2 where id = $1`, [r.id, DIGEST_HOLD]);
      skipped++;
      continue;
    }
    try {
      await deliver(to, r.subject, r.body, r.link);
      sent++;
    } catch (err) {
      failed++;
      await sys.query(`update notifications set status = 'failed', error = $2 where id = $1`, [r.id, String(err).slice(0, 500)]);
    }
  }
  return { sent, failed, skipped };
}

/**
 * Sends one summary email per person for everything held for the daily
 * digest. Called by the daily cron. Rows are claimed first (error marker
 * switches to 'digest_sending') so two runs never send the same digest.
 */
export async function sendDigests(): Promise<{ people: number; items: number; failed: number }> {
  const rows = await sys.query<{ id: string; user_id: string; subject: string; body: string; link: string | null; to: string | null }>(
    `update notifications n set error = 'digest_sending'
     from (select id from notifications where status = 'skipped' and error = $1 order by created_at limit 2000 for update skip locked) q
     where n.id = q.id
     returning n.id, n.user_id, n.subject, n.body, n.link, coalesce(n.email, (select email from profiles p where p.id = n.user_id)) as to`,
    [DIGEST_HOLD],
  );
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }
  let people = 0;
  let failed = 0;
  for (const [, list] of byUser) {
    const ids = list.map((r) => r.id);
    const to = list.find((r) => r.to)?.to;
    if (!to) {
      await sys.query(`update notifications set error = null where id = any($1::uuid[])`, [ids]);
      continue;
    }
    const tpl = digestEmail({ items: list.map((r) => ({ subject: r.subject, body: r.body, link: r.link?.startsWith('/') ? `${env.appUrl}${r.link}` : r.link })) });
    const link = `${env.appUrl}/app/notifications`;
    try {
      await deliver(to, tpl.subject, tpl.body, link);
      await sys.query(`update notifications set status = 'sent', sent_at = now(), error = null where id = any($1::uuid[])`, [ids]);
      // Keeps a copy of the digest itself in the outbox and the admin log.
      await sys.query(
        `insert into notifications (user_id, email, kind, subject, body, link, in_app, send_email, status, sent_at)
         values ($1, $2, 'digest', $3, $4, $5, false, true, 'sent', now())`,
        [list[0].user_id, to, tpl.subject, tpl.body, link],
      );
      people++;
    } catch (err) {
      failed++;
      await sys.query(`update notifications set status = 'failed', error = $2 where id = any($1::uuid[])`, [ids, `Digest: ${String(err).slice(0, 480)}`]);
    }
  }
  return { people, items: rows.length, failed };
}

/** Fire-and-forget flush for request handlers. Errors are logged, not thrown. */
export function flushSoon() {
  flushNotifications().catch((err) => console.error('notification flush failed', err));
}
