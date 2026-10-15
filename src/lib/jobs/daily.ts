/**
 * The daily job (rebuild-architecture: Vercel Cron). Each step is
 * independent and idempotent: running the job twice in a day sends nothing
 * twice, and one failing step doesn't stop the others.
 *
 * - Invite reminders after 3 and 7 days (ui-ux-spec 10.7).
 * - Stalled-profile nudges for families who gave consent but never sent the
 *   page for review, or were asked for changes and haven't made them.
 * - A weekly summary for coaches and managers, on Mondays.
 * - Daily digests for people who chose them, and a retry of queued email.
 * - Housekeeping: abandoned checkouts and old rate-limit rows.
 */
import { sys } from '@/lib/db';
import { sendAthleteInvites } from '@/lib/invites';
import { flushNotifications, notify, notifyAthleteFamily, sendDigests } from '@/lib/notify';
import { profileNudgeEmail, weeklyCoachEmail } from '@/lib/notify/templates';
import { firstName } from '@/lib/domain/names';

/** Days after the first invite when automatic reminders go out. */
export const REMINDER_DAYS = [3, 7] as const;
/** Days a page can sit unfinished before the family is nudged, and between nudges. */
export const NUDGE_AFTER_DAYS = 5;
export const NUDGE_EVERY_DAYS = 7;
/** A checkout still pending after this long was abandoned. */
export const ABANDONED_HOURS = 24;

export interface DailyResult {
  ok: boolean;
  ranAt: string;
  steps: Record<string, unknown>;
  errors: Record<string, string>;
}

/**
 * Athletes whose oldest open invite is due a reminder. An invite starts at
 * send_count 1; the first reminder makes it 2 and the second makes it 3,
 * so a manual reminder from the coach also counts toward the two.
 */
export async function inviteReminders(now = new Date()): Promise<{ athletes: number; sent: number }> {
  const due = await sys.query<{ athlete_id: string }>(
    `select i.athlete_id from invites i
       join athletes a on a.id = i.athlete_id
       join teams t on t.id = a.team_id
     where i.kind = 'athlete' and i.used_at is null and i.expires_at > $1
       and a.archived_at is null and a.status = 'needs_consent' and a.invite_status in ('sent', 'opened')
       and t.status in ('draft', 'live')
       and ((i.send_count = 1 and i.created_at <= $1::timestamptz - make_interval(days => $2))
         or (i.send_count = 2 and i.created_at <= $1::timestamptz - make_interval(days => $3) and i.last_sent_at <= $1::timestamptz - interval '2 days'))
     group by i.athlete_id`,
    [now, REMINDER_DAYS[0], REMINDER_DAYS[1]],
  );
  let sent = 0;
  for (const d of due) sent += (await sendAthleteInvites(d.athlete_id, { reminder: true })).sent;
  return { athletes: due.length, sent };
}

/** Families with an unfinished page. One nudge per NUDGE_EVERY_DAYS. */
export async function profileNudges(now = new Date()): Promise<{ nudged: number }> {
  const rows = await sys.query<any>(
    `select a.id, a.team_id, a.first_name, a.preferred_name, a.status, t.name as team_name from athletes a join teams t on t.id = a.team_id
     where a.archived_at is null and a.status in ('draft', 'changes_requested') and t.status in ('draft', 'live')
       and a.consent_at is not null and a.updated_at <= $1::timestamptz - make_interval(days => $2)
       and not exists (select 1 from activity_log l where l.athlete_id = a.id and l.action = 'profile_nudge'
                       and l.created_at > $1::timestamptz - make_interval(days => $3))`,
    [now, NUDGE_AFTER_DAYS, NUDGE_EVERY_DAYS],
  );
  for (const a of rows) {
    const tpl = profileNudgeEmail({ athlete: firstName(a), team: a.team_name, changesRequested: a.status === 'changes_requested' });
    const n = { kind: 'profile_nudge', subject: tpl.subject, body: tpl.body, link: `/app/athlete/${a.id}` };
    const linked = await sys.query(`select 1 from athlete_access where athlete_id = $1 limit 1`, [a.id]);
    if (linked.length) await notifyAthleteFamily(sys, a.id, n);
    else {
      // No one has signed in yet (consent on paper or by the coach): email the guardians on file.
      const [c] = await sys.query<{ guardian_email: string | null; guardian2_email: string | null }>(
        `select guardian_email, guardian2_email from athlete_contacts where athlete_id = $1`,
        [a.id],
      );
      for (const email of [c?.guardian_email, c?.guardian2_email]) if (email) await notify(sys, { ...n, email, inApp: false });
    }
    // updated_at is touched by the trigger only on athletes, so the log row is what spaces nudges out.
    await sys.query(`insert into activity_log (team_id, athlete_id, action, detail) values ($1, $2, 'profile_nudge', $3)`, [
      a.team_id,
      a.id,
      JSON.stringify({ status: a.status }),
    ]);
  }
  return { nudged: rows.length };
}

/** Monday summary for each active coach and staff member of a live team. */
export async function weeklySummaries(now = new Date()): Promise<{ teams: number; sent: number; skipped?: string }> {
  if (now.getUTCDay() !== 1) return { teams: 0, sent: 0, skipped: 'not Monday' };
  const teams = await sys.query<any>(
    `select t.id, t.name,
       coalesce((select sum(d.gift_cents) from donations d where d.team_id = t.id and d.status = 'succeeded' and d.succeeded_at > $1::timestamptz - interval '7 days'), 0)::int as raised,
       (select count(*) from donations d where d.team_id = t.id and d.status = 'succeeded' and d.succeeded_at > $1::timestamptz - interval '7 days')::int as gifts,
       (select count(*) from athletes a where a.team_id = t.id and a.archived_at is null and a.status = 'awaiting_coach')::int
         + (select count(*) from needs n where n.team_id = t.id and n.season_id = t.current_season_id and n.request_status = 'pending' and n.status <> 'removed')::int
         + (select count(*) from donations d where d.team_id = t.id and d.status = 'succeeded' and d.message_status = 'pending')::int
         + (select count(*) from thank_yous ty where ty.team_id = t.id and ty.status = 'pending')::int as approvals,
       (select count(*) from needs n where n.team_id = t.id and n.season_id = t.current_season_id and n.status = 'funded' and n.kind <> 'team_fund')::int as to_buy,
       (select count(*) from athletes a where a.team_id = t.id and a.archived_at is null and a.invite_status <> 'accepted' and a.status = 'needs_consent')::int as not_joined,
       (coalesce((select sum(n.raised_cents) from needs n where n.team_id = t.id and n.season_id = t.current_season_id and n.status = 'funded' and n.kind <> 'team_fund'), 0)
         + coalesce((select greatest(n.raised_cents - coalesce((select sum(pn.amount_cents) from purchase_needs pn where pn.need_id = n.id), 0), 0)
           from needs n where n.team_id = t.id and n.season_id = t.current_season_id and n.kind = 'team_fund' limit 1), 0))::int as available
     from teams t where t.status = 'live'`,
    [now],
  );
  let sent = 0;
  for (const t of teams) {
    const tpl = weeklyCoachEmail({
      team: t.name,
      raisedCents: t.raised,
      gifts: t.gifts,
      approvals: t.approvals,
      toBuy: t.to_buy,
      notJoined: t.not_joined,
      availableCents: t.available,
    });
    const staff = await sys.query<{ user_id: string }>(
      `select m.user_id from team_members m where m.team_id = $1 and m.status = 'active' and m.role in ('coach', 'staff')
         and not exists (select 1 from notifications n where n.user_id = m.user_id and n.kind = 'weekly_summary'
                         and n.link = $2 and n.created_at > $3::timestamptz - interval '6 days')`,
      [t.id, `/app/manager/${t.id}`, now],
    );
    for (const s of staff) {
      await notify(sys, { userId: s.user_id, kind: 'weekly_summary', subject: tpl.subject, body: tpl.body, link: `/app/manager/${t.id}`, inApp: false });
      sent++;
    }
  }
  return { teams: teams.length, sent };
}

/** Abandoned checkouts and rows that only matter for a short window. */
export async function housekeeping(now = new Date()): Promise<{ abandoned: number; unlockRows: number; analyticsRows: number }> {
  const abandoned = await sys.query(
    `update donations set status = 'failed', failure_reason = coalesce(failure_reason, 'Checkout not completed')
     where status = 'pending' and created_at < $1::timestamptz - make_interval(hours => $2) returning id`,
    [now, ABANDONED_HOURS],
  );
  const unlock = await sys.query(`delete from unlock_attempts where created_at < $1::timestamptz - interval '30 days' returning id`, [now]);
  const analytics = await sys.query(`delete from analytics_events where created_at < $1::timestamptz - interval '400 days' returning id`, [now]);
  return { abandoned: abandoned.length, unlockRows: unlock.length, analyticsRows: analytics.length };
}

export async function runDaily(now = new Date()): Promise<DailyResult> {
  const steps: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      steps[name] = await fn();
    } catch (err) {
      console.error(`daily job step ${name} failed`, err);
      errors[name] = String(err instanceof Error ? err.message : err).slice(0, 300);
    }
  };
  await run('inviteReminders', () => inviteReminders(now));
  await run('profileNudges', () => profileNudges(now));
  await run('weeklySummaries', () => weeklySummaries(now));
  await run('housekeeping', () => housekeeping(now));
  // Everything above queues email, so the digest and flush run last.
  await run('digests', () => sendDigests());
  await run('flush', () => flushNotifications(500));
  return { ok: Object.keys(errors).length === 0, ranAt: now.toISOString(), steps, errors };
}
