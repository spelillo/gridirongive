import 'server-only';
import { sys } from '@/lib/db';
import { randomToken, sha256 } from '@/lib/crypto';
import { notify, notifyTeamStaff, flushSoon } from '@/lib/notify';
import { inviteEmail, inviteReminderEmail } from '@/lib/notify/templates';
import { athleteDisplayName, firstName } from '@/lib/domain/names';
import { env } from '@/lib/env';

export const INVITE_DAYS = 30;

export interface InviteInfo {
  id: string;
  role: 'guardian' | 'athlete';
  email: string;
  expired: boolean;
  used: boolean;
  usedBy: string | null;
  athlete: { id: string; first: string; name: string; under13: boolean; status: string; consentAt: Date | null };
  team: { id: string; name: string; season: string };
  coach: string;
}

export async function lookupInvite(token: string): Promise<InviteInfo | null> {
  if (!token || token.length > 100) return null;
  const r = await sys.one<any>(
    `select i.id, i.role, i.email, i.expires_at < now() as expired, i.used_at is not null as used, i.used_by,
       a.id as athlete_id, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, a.under_13, a.status, a.consent_at,
       t.id as team_id, t.name as team_name, coalesce(s.label, '') as season,
       coalesce((select p.full_name from team_members m join profiles p on p.id = m.user_id
                 where m.team_id = t.id and m.role = 'coach' and m.status = 'active' order by m.created_at limit 1), 'Your coach') as coach
     from invites i join athletes a on a.id = i.athlete_id join teams t on t.id = i.team_id left join seasons s on s.id = t.current_season_id
     where i.token_hash = $1 and i.kind = 'athlete' and a.archived_at is null`,
    [sha256(token)],
  );
  if (!r) return null;
  return {
    id: r.id,
    role: r.role,
    email: r.email,
    expired: r.expired,
    used: r.used,
    usedBy: r.used_by,
    athlete: { id: r.athlete_id, first: firstName(r), name: athleteDisplayName(r), under13: r.under_13, status: r.status, consentAt: r.consent_at },
    team: { id: r.team_id, name: r.team_name, season: r.season },
    coach: coachTitle(r.coach),
  };
}

/** "Alex Smith" reads as "Coach Smith" in invite copy. */
export function coachTitle(name: string) {
  if (!name || name === 'Your coach') return 'Your coach';
  const last = name.trim().split(/\s+/).pop();
  return `Coach ${last}`;
}

export async function markInviteOpened(inv: InviteInfo) {
  await sys.query(`update invites set opened_at = coalesce(opened_at, now()) where id = $1`, [inv.id]);
  await sys.query(`update athletes set invite_status = 'opened', invite_opened_at = coalesce(invite_opened_at, now()) where id = $1 and invite_status in ('not_sent', 'sent')`, [inv.athlete.id]);
}

/**
 * Links the signed-in person to the athlete as guardian or athlete. An invite
 * link can be used by each family member once; the same person opening it
 * again just lands on the page.
 */
export async function acceptInvite(token: string, userId: string, as: 'guardian' | 'athlete'): Promise<{ ok: true; athleteId: string } | { ok: false; error: string }> {
  const inv = await lookupInvite(token);
  if (!inv) return { ok: false, error: "This invite link isn't valid." };
  if (inv.expired) return { ok: false, error: `This invite expired. Ask ${inv.coach} to resend it.` };
  if (as === 'athlete' && inv.athlete.under13) return { ok: false, error: 'A parent or guardian sets up pages for players under 13.' };
  const existing = await sys.one<{ role: string }>(`select role from athlete_access where athlete_id = $1 and user_id = $2`, [inv.athlete.id, userId]);
  if (existing) return { ok: true, athleteId: inv.athlete.id };
  if (inv.used && inv.usedBy !== userId) {
    // A used link still works for the other family role (a guardian forwarding the athlete invite, for example).
    const taken = await sys.one(`select 1 from athlete_access where athlete_id = $1 and role = $2 and user_id = $3`, [inv.athlete.id, as, inv.usedBy]);
    if (taken) return { ok: false, error: 'This invite was already used. Sign in with the email you used before, or ask your coach for a new invite.' };
  }
  await sys.tx(async (tx) => {
    await tx.query(`insert into athlete_access (athlete_id, user_id, role) values ($1, $2, $3) on conflict do nothing`, [inv.athlete.id, userId, as]);
    await tx.query(`update invites set used_at = coalesce(used_at, now()), used_by = coalesce(used_by, $2) where id = $1`, [inv.id, userId]);
    await tx.query(`update athletes set invite_status = 'accepted', invite_accepted_at = coalesce(invite_accepted_at, now()) where id = $1`, [inv.athlete.id]);
    await tx.query(`insert into activity_log (team_id, athlete_id, actor_id, action, detail) values ($1, $2, $3, 'invite_accepted', $4)`, [
      inv.team.id, inv.athlete.id, userId, JSON.stringify({ as }),
    ]);
  });
  return { ok: true, athleteId: inv.athlete.id };
}

/**
 * Creates (or refreshes) invites for an athlete and emails them. Called by
 * staff actions that already checked can_edit_team.
 */
export async function sendAthleteInvites(athleteId: string, opts: { reminder?: boolean } = {}): Promise<{ sent: number; missingEmail: boolean }> {
  const a = await sys.one<any>(
    `select a.id, a.team_id, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, a.under_13, a.status, a.invite_status,
       c.guardian_email, c.guardian2_email, c.athlete_email, t.name as team_name, coalesce(s.label, '') as season,
       coalesce((select p.full_name from team_members m join profiles p on p.id = m.user_id
                 where m.team_id = t.id and m.role = 'coach' and m.status = 'active' order by m.created_at limit 1), 'Your coach') as coach
     from athletes a join teams t on t.id = a.team_id left join athlete_contacts c on c.athlete_id = a.id
     left join seasons s on s.id = t.current_season_id where a.id = $1`,
    [athleteId],
  );
  if (!a) return { sent: 0, missingEmail: true };
  const targets: { email: string; role: 'guardian' | 'athlete' }[] = [];
  for (const e of [a.guardian_email, a.guardian2_email]) if (e) targets.push({ email: e, role: 'guardian' });
  if (a.athlete_email && !a.under_13) targets.push({ email: a.athlete_email, role: 'athlete' });
  if (!targets.length) return { sent: 0, missingEmail: true };

  const coach = coachTitle(a.coach);
  const athleteName = firstName(a);
  let sent = 0;
  for (const t of targets) {
    // Already joined in this role: no need to invite again.
    const joined = await sys.one(
      `select 1 from athlete_access x join profiles p on p.id = x.user_id where x.athlete_id = $1 and lower(p.email) = lower($2)`,
      [a.id, t.email],
    );
    if (joined) continue;
    const token = randomToken(24);
    const existing = await sys.one<{ id: string }>(`select id from invites where athlete_id = $1 and lower(email) = lower($2) and used_at is null`, [a.id, t.email]);
    if (existing) {
      await sys.query(
        `update invites set token_hash = $2, expires_at = now() + make_interval(days => $3), send_count = send_count + 1, last_sent_at = now() where id = $1`,
        [existing.id, sha256(token), INVITE_DAYS],
      );
    } else {
      await sys.query(
        `insert into invites (token_hash, kind, team_id, athlete_id, email, role, expires_at) values ($1, 'athlete', $2, $3, lower($4), $5, now() + make_interval(days => $6))`,
        [sha256(token), a.team_id, a.id, t.email, t.role, INVITE_DAYS],
      );
    }
    const link = `${env.appUrl}/invite/${token}`;
    const tpl = opts.reminder
      ? inviteReminderEmail({ athlete: athleteName, team: a.team_name, coach })
      : inviteEmail({ coach, athlete: athleteName, team: a.team_name, season: a.season || 'this season', forGuardian: t.role === 'guardian' });
    await notify(sys, { email: t.email, kind: opts.reminder ? 'invite_reminder' : 'invite', subject: tpl.subject, body: tpl.body, link, inApp: false });
    sent++;
  }
  if (sent) {
    await sys.query(
      `update athletes set invite_status = case when invite_status = 'accepted' then invite_status else 'sent' end, invite_sent_at = now() where id = $1`,
      [a.id],
    );
    flushSoon();
  }
  return { sent, missingEmail: false };
}

/** Expired invite: the family can ask the coach to resend without seeing anyone's email. */
export async function requestResend(token: string) {
  const inv = await lookupInvite(token);
  if (!inv) return false;
  await notifyTeamStaff(sys, inv.team.id, {
    kind: 'invite_resend',
    subject: `${inv.athlete.name}'s family asked for a new invite`,
    body: `The invite for ${inv.athlete.name} expired. Open the roster to resend it.`,
    link: `${env.appUrl}/app/manager/${inv.team.id}/roster/${inv.athlete.id}`,
  });
  flushSoon();
  return true;
}
