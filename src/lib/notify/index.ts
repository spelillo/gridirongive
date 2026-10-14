import 'server-only';
import { env, mode } from '@/lib/env';
import { sys, type Queryable } from '@/lib/db';

type Q = Pick<Queryable, 'query'>;
import { renderEmailHtml } from './templates';

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
const ALWAYS_EMAIL = new Set(['magic_link', 'receipt', 'invite', 'invite_reminder', 'consent_confirmation', 'payout_issue', 'refund', 'staff_invite']);

const PREF_CATEGORY: Record<string, 'donations' | 'approvals' | 'updates'> = {
  new_gift: 'donations',
  approval_needed: 'approvals',
};

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
    const category = PREF_CATEGORY[r.kind] ?? 'updates';
    const pref = r.email_prefs?.[category] ?? 'instant';
    const wantsEmail = r.send_email && to && (ALWAYS_EMAIL.has(r.kind) || pref === 'instant');
    if (!wantsEmail) {
      await sys.query(`update notifications set status = 'skipped' where id = $1`, [r.id]);
      skipped++;
      continue;
    }
    try {
      await deliver(to!, r.subject, r.body, r.link);
      sent++;
    } catch (err) {
      failed++;
      await sys.query(`update notifications set status = 'failed', error = $2 where id = $1`, [r.id, String(err).slice(0, 500)]);
    }
  }
  return { sent, failed, skipped };
}

/** Fire-and-forget flush for request handlers. Errors are logged, not thrown. */
export function flushSoon() {
  flushNotifications().catch((err) => console.error('notification flush failed', err));
}
