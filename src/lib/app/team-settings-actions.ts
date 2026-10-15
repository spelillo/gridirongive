'use server';
import { revalidatePath } from 'next/cache';
import { asUser, sys, dbErrorMessage, type Tx } from '@/lib/db';
import { requireUser, type SessionUser } from '@/lib/auth/session';
import { notify, notifyTeamStaff, flushSoon } from '@/lib/notify';
import { staffInviteEmail, seasonSummaryEmail } from '@/lib/notify/templates';
import { codeHash, newTeamCode, randomToken } from '@/lib/crypto';
import { cleanUserText } from '@/lib/domain/text';
import { slugify } from '@/lib/domain/names';
import { money } from '@/lib/domain/money';
import { coachTitle } from '@/lib/invites';
import { env, mode } from '@/lib/env';
import { broadcastTeam } from '@/lib/realtime';
import { fundsHeld } from '@/lib/app/team-money';

export type Result = { ok: true; message?: string; id?: string; redirect?: string } | { ok: false; error: string; field?: string };

const UUID = /^[0-9a-f-]{36}$/;
const NO_ACCESS: Result = { ok: false, error: "You don't have access to do that." };

async function roleOn(teamId: string): Promise<{ user: SessionUser; edit: boolean; coach: boolean } | null> {
  const user = await requireUser(`/app/manager/${teamId}`);
  if (!UUID.test(teamId)) return null;
  const r = await asUser(user.id, (tx) => tx.one<{ edit: boolean; coach: boolean }>(`select can_edit_team($1) as edit, is_team_coach($1) as coach`, [teamId]));
  return r ? { user, edit: r.edit, coach: r.coach } : null;
}

function refresh(teamId: string) {
  revalidatePath(`/app/manager/${teamId}`, 'layout');
  revalidatePath('/app/manager/new');
}

async function log(teamId: string, actor: string, action: string, detail: Record<string, unknown> = {}) {
  await sys.query(`insert into activity_log (team_id, actor_id, action, detail) values ($1, $2, $3, $4)`, [teamId, actor, action, JSON.stringify(detail)]);
}

/** Team share link token, in the same shape as the seed: T + slug + code. */
function teamLinkToken(slug: string, code: string) {
  return `T${slug.replace(/-/g, '').slice(0, 10)}${code.toLowerCase()}${randomToken(4)}`;
}

// Team code -------------------------------------------------------------------

/**
 * Changes the team code (ui-ux-spec 8.11, 8.12). Bumping code_version signs
 * out every device that unlocked with the old code, and the old team link is
 * switched off and replaced. Athlete links keep working: they never carried
 * the team code.
 */
export async function changeTeamCode(teamId: string): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  let code = '';
  let slug = '';
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      code = newTeamCode();
      try {
        slug = await asUser(r.user.id, async (tx) => {
          await tx.query(`update team_secrets set code = $2 where team_id = $1`, [teamId, code]);
          const t = await tx.one<{ slug: string }>(
            `update teams set code_hash = $2, code_version = code_version + 1 where id = $1 returning slug`,
            [teamId, codeHash(code)],
          );
          if (!t) throw Object.assign(new Error('no team'), { code: '42501' });
          return t.slug;
        });
        break;
      } catch (err) {
        if ((err as { code?: string }).code !== '23505' || attempt === 4) throw err;
      }
    }
    await sys.tx(async (tx) => {
      await tx.query(`update share_links set active = false where team_id = $1 and athlete_id is null and active`, [teamId]);
      await tx.query(`insert into share_links (token, team_id) values ($1, $2)`, [teamLinkToken(slug, code), teamId]);
      await tx.query(`insert into activity_log (team_id, actor_id, action) values ($1, $2, 'code_changed')`, [teamId, r.user.id]);
    });
    await broadcastTeam(teamId).catch(() => {});
    refresh(teamId);
    return { ok: true, message: `New code: ${code}. Old team links stopped working.` };
  } catch (err) {
    console.error('change code failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

// Team profile and privacy ------------------------------------------------------

export async function saveTeamProfile(teamId: string, input: { name: string; about: string; seasonLabel: string; color?: string | null }): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  const name = cleanUserText(input.name ?? '', 80);
  if (name.length < 3) return { ok: false, error: 'Enter the team name.', field: 'team-name' };
  const about = cleanUserText(input.about ?? '', 1000);
  const label = cleanUserText(input.seasonLabel ?? '', 40);
  if (!label) return { ok: false, error: 'Enter a season label, like Fall 2026.', field: 'season-label' };
  const color = input.color ? input.color.trim().toLowerCase() : null;
  if (color && !/^#[0-9a-f]{6}$/.test(color)) return { ok: false, error: 'Pick a team color from the list.', field: 'team-color' };
  try {
    await asUser(r.user.id, async (tx) => {
      const t = await tx.one<{ current_season_id: string | null }>(`update teams set name = $2, about = $3, color = case when $5 then $4 else color end where id = $1 returning current_season_id`,
        [teamId, name, about, color, input.color !== undefined]);
      if (t?.current_season_id) await tx.query(`update seasons set label = $2 where id = $1`, [t.current_season_id, label]);
    });
    refresh(teamId);
    return { ok: true, message: 'Saved' };
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

const PRIVACY = {
  require_profile_approval: 'require_profile_approval',
  require_thankyou_approval: 'require_thankyou_approval',
  require_message_approval: 'require_message_approval',
  show_amounts_to_athletes: 'show_amounts_to_athletes',
} as const;

export async function setTeamPrivacy(teamId: string, key: keyof typeof PRIVACY, value: boolean): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  const col = PRIVACY[key];
  if (!col) return { ok: false, error: 'Unknown setting.' };
  try {
    await asUser(r.user.id, (tx) => tx.query(`update teams set ${col} = $2 where id = $1`, [teamId, Boolean(value)]));
    await log(teamId, r.user.id, 'privacy_changed', { [col]: Boolean(value) });
    refresh(teamId);
    return { ok: true, message: 'Saved' };
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

export async function removeTeamPhoto(teamId: string): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  try {
    await asUser(r.user.id, (tx) => tx.query(`update teams set photo_path = null where id = $1`, [teamId]));
    refresh(teamId);
    return { ok: true, message: 'Photo removed' };
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

// Staff -----------------------------------------------------------------------

/** Invites an assistant (staff) or a viewer by email (ui-ux-spec 8.12). Coach only. Claimed at sign-in. */
export async function inviteStaff(teamId: string, input: { email: string; role: string; title?: string }): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.coach) return NO_ACCESS;
  const email = (input.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return { ok: false, error: 'Enter a valid email address.', field: 'staff-email' };
  const role = input.role === 'viewer' ? 'viewer' : input.role === 'staff' ? 'staff' : null;
  if (!role) return { ok: false, error: 'Pick a role.', field: 'staff-role' };
  const title = cleanUserText(input.title ?? '', 60);
  try {
    const res = await asUser(r.user.id, async (tx): Promise<Result> => {
      const existing = await tx.one<{ status: string; role: string }>(`select status, role from team_members where team_id = $1 and lower(email) = $2`, [teamId, email]);
      if (existing?.status === 'active') return { ok: false, error: 'That person already has access.', field: 'staff-email' };
      if (existing?.role === 'coach') return { ok: false, error: "That's the head coach's email.", field: 'staff-email' };
      await tx.query(
        `insert into team_members (team_id, email, role, title, status, user_id) values ($1, $2, $3, nullif($4, ''), 'invited', null)
         on conflict (team_id, email) do update set role = excluded.role, title = excluded.title, status = 'invited', user_id = null`,
        [teamId, email, role, title],
      );
      return { ok: true };
    });
    if (!res.ok) return res;
    const t = await sys.one<{ name: string }>(`select name from teams where id = $1`, [teamId]);
    const tpl = staffInviteEmail({ coach: coachTitle(r.user.fullName ?? ''), team: t?.name ?? 'the team', role: role === 'staff' ? 'staff' : 'a viewer' });
    const existing = await sys.one<{ id: string }>(`select id from profiles where lower(email) = $1`, [email]);
    await notify(sys, {
      email,
      userId: existing?.id ?? null,
      kind: 'staff_invite',
      subject: tpl.subject,
      body: tpl.body,
      link: `${env.appUrl}/sign-in?next=${encodeURIComponent(`/app/manager/${teamId}`)}`,
      inApp: false,
    });
    await log(teamId, r.user.id, 'staff_invited', { email, role });
    flushSoon();
    revalidatePath(`/app/manager/${teamId}/settings`);
    return { ok: true, message: `Invite sent to ${email}` };
  } catch (err) {
    console.error('invite staff failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

export async function removeStaff(teamId: string, memberId: string): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.coach) return NO_ACCESS;
  if (!UUID.test(memberId)) return { ok: false, error: 'That person is gone.' };
  try {
    const res = await asUser(r.user.id, async (tx): Promise<Result> => {
      const m = await tx.one<{ role: string; email: string }>(`select role, email from team_members where id = $1 and team_id = $2`, [memberId, teamId]);
      if (!m) return { ok: false, error: 'That person is gone.' };
      if (m.role === 'coach') return { ok: false, error: "The head coach can't be removed." };
      await tx.query(`update team_members set status = 'removed' where id = $1`, [memberId]);
      return { ok: true, message: `Removed ${m.email}` };
    });
    if (res.ok) await log(teamId, r.user.id, 'staff_removed', { member_id: memberId });
    revalidatePath(`/app/manager/${teamId}/settings`);
    return res;
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

// Season ----------------------------------------------------------------------

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Closes the current season (ui-ux-spec 8.12, rebuild-architecture 5.15):
 * unspent earmarked money moves to the team fund through fund_transfers, the
 * season and team close, and every donor of the season gets a summary.
 */
export async function closeSeason(teamId: string, typedName: string): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  const t = await sys.one<{ name: string; status: string; current_season_id: string | null; label: string }>(
    `select t.name, t.status, t.current_season_id, coalesce(s.label, '') as label from teams t left join seasons s on s.id = t.current_season_id where t.id = $1`,
    [teamId],
  );
  if (!t?.current_season_id) return { ok: false, error: 'There is no season to close.' };
  if (t.status !== 'live') return { ok: false, error: 'Only a live team can close its season.' };
  if (!sameName(typedName ?? '', t.name)) return { ok: false, error: `Type ${t.name} to confirm.`, field: 'confirm-name' };
  const seasonId = t.current_season_id;
  let moved: { id: string; raised_cents: number }[] = [];
  try {
    moved = await sys.tx(async (tx) => {
      let fund = await tx.one<{ id: string }>(`select id from needs where team_id = $1 and season_id = $2 and kind = 'team_fund'`, [teamId, seasonId]);
      fund ??= await tx.one<{ id: string }>(`insert into needs (team_id, season_id, kind, name, sort) values ($1, $2, 'team_fund', 'Team fund', 0) returning id`, [teamId, seasonId]);
      const unspent = await tx.query<{ id: string; raised_cents: number }>(
        `select id, raised_cents from needs where team_id = $1 and season_id = $2 and kind <> 'team_fund' and status not in ('purchased', 'delivered') and raised_cents > 0`,
        [teamId, seasonId],
      );
      for (const n of unspent) {
        await tx.query(`insert into fund_transfers (team_id, from_need_id, to_need_id, amount_cents, reason, actor_id) values ($1, $2, $3, $4, 'Season closed', $5)`, [
          teamId, n.id, fund!.id, n.raised_cents, r.user.id,
        ]);
      }
      await tx.query(`update seasons set status = 'closed', closed_at = now() where id = $1`, [seasonId]);
      await tx.query(`update teams set status = 'season_closed' where id = $1`, [teamId]);
      await tx.query(`insert into activity_log (team_id, actor_id, action, detail) values ($1, $2, 'season_closed', $3)`, [
        teamId, r.user.id, JSON.stringify({ season_id: seasonId, moved_cents: unspent.reduce((s, n) => s + n.raised_cents, 0) }),
      ]);
      return unspent;
    });
  } catch (err) {
    console.error('close season failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }

  const movedIds = moved.map((n) => n.id);
  const donors = await sys.query<{ email: string; user_id: string | null; gifts: number; total: number; moved: number }>(
    `select lower(d.donor_email) as email, max(d.donor_user_id::text)::uuid as user_id, count(distinct d.id)::int as gifts, sum(d.gift_cents)::int as total,
       coalesce(sum((select sum(al.amount_cents) from allocations al where al.donation_id = d.id and al.reversed_at is null and al.need_id = any($3::uuid[]))), 0)::int as moved
     from donations d where d.team_id = $1 and d.season_id = $2 and d.status = 'succeeded' group by lower(d.donor_email)`,
    [teamId, seasonId, movedIds],
  );
  for (const d of donors) {
    const tpl = seasonSummaryEmail({ team: t.name, season: t.label, totalCents: d.total, gifts: d.gifts });
    const extra = d.moved > 0 ? `\n\n${money(d.moved)} of your gifts went to gear that wasn't bought this season, so it moved to the ${t.name} team fund for next season. Reply within 30 days if you'd prefer a refund.` : '';
    await notify(sys, { email: d.email, userId: d.user_id, kind: 'season_summary', subject: tpl.subject, body: tpl.body + extra, inApp: Boolean(d.user_id) });
  }
  await notifyTeamStaff(sys, teamId, {
    kind: 'season_summary',
    subject: `${t.name} ${t.label} is closed`,
    body: `The season is closed. ${donors.length} ${donors.length === 1 ? 'donor was' : 'donors were'} sent a summary. ${money(moved.reduce((s, n) => s + n.raised_cents, 0))} of unspent earmarked money moved to the team fund.`,
    link: `${env.appUrl}/app/manager/${teamId}/settings`,
    sendEmail: false,
  });
  flushSoon();
  await broadcastTeam(teamId).catch(() => {});
  refresh(teamId);
  return { ok: true, message: `Season closed. ${donors.length} donor ${donors.length === 1 ? 'summary' : 'summaries'} sent.`, redirect: `/app/manager/${teamId}/settings` };
}

async function needsFromTemplate(tx: Tx, teamId: string, seasonId: string, athletes: { id: string; position: string | null }[]) {
  const team = await tx.one<{ default_template_id: string | null }>(`select default_template_id from teams where id = $1`, [teamId]);
  const templates = await tx.query<{ id: string; positions: string[] }>(`select id, positions from gear_templates where team_id = $1`, [teamId]);
  const items = await tx.query<{ template_id: string; catalog_id: string; name: string; size: string | null; price_cents: number; sort: number }>(
    `select ti.template_id, ti.catalog_id, c.name, ti.size, ti.price_cents, ti.sort from gear_template_items ti join gear_catalog c on c.id = ti.catalog_id
     join gear_templates g on g.id = ti.template_id where g.team_id = $1 order by ti.sort`,
    [teamId],
  );
  let created = 0;
  for (const a of athletes) {
    const tpl = templates.find((t) => a.position && t.positions.includes(a.position))?.id ?? team?.default_template_id;
    if (!tpl) continue;
    let i = 0;
    for (const it of items.filter((x) => x.template_id === tpl)) {
      i += 1;
      await tx.query(
        `insert into needs (team_id, season_id, athlete_id, kind, catalog_id, name, variant, price_cents, sort) values ($1, $2, $3, 'athlete', $4, $5, $6, $7, $8)`,
        [teamId, seasonId, a.id, it.catalog_id, it.name, it.size, it.price_cents, i],
      );
      created++;
    }
  }
  return created;
}

/**
 * Starts the next season (ui-ux-spec 8.12): a new season row, graduates
 * (grade 12) archived, everyone else moves up a grade, needs reset from the
 * team's templates, and the unspent team fund carries over.
 */
export async function startNextSeason(teamId: string, input: { label: string; startsOn?: string; endsOn?: string }): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  const label = cleanUserText(input.label ?? '', 40);
  if (!label) return { ok: false, error: 'Enter a season label, like Fall 2027.', field: 'next-label' };
  const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const t = await sys.one<{ status: string; current_season_id: string | null; verification_status: string; payouts_status: string }>(
    `select status, current_season_id, verification_status, payouts_status from teams where id = $1`,
    [teamId],
  );
  if (!t) return NO_ACCESS;
  if (t.status !== 'season_closed') return { ok: false, error: 'Close the current season first.' };
  try {
    const out = await sys.tx(async (tx) => {
      const season = await tx.one<{ id: string }>(`insert into seasons (team_id, label, starts_on, ends_on, status) values ($1, $2, $3, $4, 'active') returning id`, [
        teamId, label, date(input.startsOn), date(input.endsOn),
      ]);
      const fund = await tx.one<{ id: string }>(`insert into needs (team_id, season_id, kind, name, sort) values ($1, $2, 'team_fund', 'Team fund', 0) returning id`, [teamId, season!.id]);
      // Carry the old team fund's unspent money forward.
      if (t.current_season_id) {
        const old = await tx.one<{ id: string; left: number }>(
          `select n.id, (n.raised_cents - coalesce((select sum(pn.amount_cents) from purchase_needs pn where pn.need_id = n.id), 0))::int as left
           from needs n where n.team_id = $1 and n.season_id = $2 and n.kind = 'team_fund'`,
          [teamId, t.current_season_id],
        );
        if (old && old.left > 0) {
          await tx.query(`insert into fund_transfers (team_id, from_need_id, to_need_id, amount_cents, reason, actor_id) values ($1, $2, $3, $4, 'Carried over to the new season', $5)`, [
            teamId, old.id, fund!.id, old.left, r.user.id,
          ]);
        }
      }
      const grads = await tx.query(`update athletes set archived_at = now() where team_id = $1 and archived_at is null and grade = 12 returning id`, [teamId]);
      await tx.query(`update athletes set grade = grade + 1 where team_id = $1 and archived_at is null and grade between 1 and 11`, [teamId]);
      const roster = await tx.query<{ id: string; position: string | null }>(`select id, position from athletes where team_id = $1 and archived_at is null`, [teamId]);
      const created = await needsFromTemplate(tx, teamId, season!.id, roster);
      const live = t.verification_status === 'verified' && t.payouts_status === 'connected';
      await tx.query(`update teams set current_season_id = $2, status = $3 where id = $1`, [teamId, season!.id, live ? 'live' : 'draft']);
      await tx.query(`insert into activity_log (team_id, actor_id, action, detail) values ($1, $2, 'season_started', $3)`, [
        teamId, r.user.id, JSON.stringify({ label, graduates: grads.length, athletes: roster.length, needs: created }),
      ]);
      return { graduates: grads.length, athletes: roster.length, live };
    });
    await broadcastTeam(teamId).catch(() => {});
    refresh(teamId);
    return {
      ok: true,
      message: `${label} started with ${out.athletes} players. ${out.graduates} ${out.graduates === 1 ? 'graduate was' : 'graduates were'} archived.${out.live ? '' : ' Finish setup to go live.'}`,
      redirect: `/app/manager/${teamId}`,
    };
  } catch (err) {
    console.error('start season failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

// Danger zone -------------------------------------------------------------------

/**
 * Deletes the team (ui-ux-spec 8.12). Coach only, typed confirm, and only when
 * the team holds no money. A team that never took a gift is deleted outright;
 * one with gift or purchase records is closed instead, so the records stay on
 * the organization's books, and everyone loses access.
 */
export async function deleteTeam(teamId: string, typedName: string): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.coach) return NO_ACCESS;
  const t = await sys.one<{ name: string }>(`select name from teams where id = $1`, [teamId]);
  if (!t) return NO_ACCESS;
  if (!sameName(typedName ?? '', t.name)) return { ok: false, error: `Type ${t.name} to confirm.`, field: 'delete-name' };
  const held = await fundsHeld(sys, teamId);
  if (held.totalCents > 0) return { ok: false, error: `The team still holds ${money(held.totalCents)}. Buy the gear or close the season first.` };
  const records = await sys.one<{ n: number }>(
    `select ((select count(*) from donations where team_id = $1 and status <> 'failed') + (select count(*) from purchases where team_id = $1)
       + (select count(*) from payouts where team_id = $1) + (select count(*) from fund_transfers where team_id = $1))::int as n`,
    [teamId],
  );
  try {
    if (!records?.n) {
      await sys.query(`delete from donations where team_id = $1 and status = 'failed'`, [teamId]).catch(() => {});
      await asUser(r.user.id, (tx) => tx.query(`delete from teams where id = $1`, [teamId]));
    } else {
      await sys.tx(async (tx) => {
        await tx.query(`update teams set status = 'suspended', verification_note = 'Deleted by the coach' where id = $1`, [teamId]);
        await tx.query(`update team_members set status = 'removed' where team_id = $1`, [teamId]);
        await tx.query(`update share_links set active = false where team_id = $1`, [teamId]);
        await tx.query(`insert into activity_log (team_id, actor_id, action) values ($1, $2, 'team_deleted')`, [teamId, r.user.id]);
      });
    }
    revalidatePath('/app');
    return { ok: true, message: 'Team deleted', redirect: '/app' };
  } catch (err) {
    console.error('delete team failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

// Payouts (simulated) -----------------------------------------------------------

/** Demo mode only: "connects" a fake Stripe account so the rest of setup can be tried. */
export async function connectSimulated(teamId: string, from: string): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.coach) return NO_ACCESS;
  if (mode.payments !== 'simulated') return { ok: false, error: 'Use Connect with Stripe.' };
  try {
    await asUser(r.user.id, (tx) =>
      tx.query(`update teams set stripe_account_id = coalesce(stripe_account_id, $2), payouts_status = 'connected' where id = $1`, [teamId, `acct_sim_${randomToken(14)}`]),
    );
    await log(teamId, r.user.id, 'payouts_connected', { simulated: true });
    refresh(teamId);
    return { ok: true, redirect: from === 'wizard' ? `/app/manager/new?team=${teamId}&step=4` : `/app/manager/${teamId}/payouts?stripe=simulated` };
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

// Setup wizard ----------------------------------------------------------------

export async function saveAccountStep(input: { fullName: string; phone: string }): Promise<Result> {
  const user = await requireUser('/app/manager/new');
  const name = cleanUserText(input.fullName ?? '', 80);
  if (name.length < 2) return { ok: false, error: 'Enter your name.', field: 'full-name' };
  const phone = cleanUserText(input.phone ?? '', 30);
  if (phone && !/^[+()\d\s.-]{7,30}$/.test(phone)) return { ok: false, error: 'Enter a phone number, or leave it blank.', field: 'phone' };
  try {
    await asUser(user.id, (tx) => tx.query(`update profiles set full_name = $2, phone = nullif($3, '') where id = $1`, [user.id, name, phone]));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

export interface TeamStepInput {
  orgId?: string | null;
  newOrg?: { name: string; city: string; state: string; website: string } | null;
  sport: string;
  level: string;
  name: string;
  slug: string;
  seasonLabel: string;
  startsOn?: string;
  endsOn?: string;
  about: string;
  title: string;
}

const LEVELS = ['varsity', 'jv', 'freshman', 'youth', 'club'];

function domainOf(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function checkSlug(slug: string, teamId?: string): Promise<{ ok: boolean; slug: string; message: string }> {
  await requireUser('/app/manager/new');
  const s = slugify(slug ?? '');
  if (s.length < 3) return { ok: false, slug: s, message: 'Use at least 3 letters or numbers.' };
  const taken = await sys.one(`select 1 from teams where slug = $1 and id is distinct from $2::uuid`, [s, teamId && UUID.test(teamId) ? teamId : null]);
  return taken ? { ok: false, slug: s, message: 'That address is taken. Try adding the town or level.' } : { ok: true, slug: s, message: 'Available' };
}

function validateTeamStep(input: TeamStepInput, sports: string[]): Result | null {
  if (!sports.includes(input.sport)) return { ok: false, error: 'Pick a sport.', field: 'sport' };
  if (!LEVELS.includes(input.level)) return { ok: false, error: 'Pick a level.', field: 'level' };
  if (cleanUserText(input.name ?? '', 80).length < 3) return { ok: false, error: 'Enter the team name.', field: 'team-name' };
  if (!cleanUserText(input.seasonLabel ?? '', 40)) return { ok: false, error: 'Enter a season label, like Fall 2026.', field: 'season-label' };
  if ((input.about ?? '').length > 1000) return { ok: false, error: 'Keep the about text under 1,000 characters.', field: 'about' };
  return null;
}

const dateOrNull = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/**
 * End of wizard step 2: creates the organization (if new), the draft team, its
 * secret code, the first season, the team fund, a team link, and makes the
 * signed-in person the coach. Done as the system because nobody is a member of
 * the team until this runs; access was checked by requiring sign-in and the
 * team is created_by them. Auto-verifies when their email domain matches the
 * school's (rebuild-architecture 5.3).
 */
export async function createDraftTeam(input: TeamStepInput): Promise<Result> {
  const user = await requireUser('/app/manager/new');
  const sports = (await sys.query<{ sport: string }>(`select distinct sport from gear_catalog where active`)).map((s) => s.sport);
  const bad = validateTeamStep(input, sports);
  if (bad) return bad;
  const slugCheck = await checkSlug(input.slug || input.name);
  if (!slugCheck.ok) return { ok: false, error: slugCheck.message, field: 'slug' };
  const drafts = await sys.one<{ n: number }>(`select count(*)::int as n from teams where created_by = $1 and status = 'draft'`, [user.id]);
  if ((drafts?.n ?? 0) >= 5) return { ok: false, error: 'You have 5 teams in setup. Finish or delete one first.' };

  let org: { id: string; city: string; state: string; domain: string | null } | null = null;
  if (input.orgId && UUID.test(input.orgId)) {
    org = await sys.one(`select id, city, state, domain from organizations where id = $1`, [input.orgId]);
    if (!org) return { ok: false, error: 'Pick the school again.', field: 'school' };
  } else if (input.newOrg) {
    const name = cleanUserText(input.newOrg.name ?? '', 120);
    const city = cleanUserText(input.newOrg.city ?? '', 80);
    const state = (input.newOrg.state ?? '').trim().toUpperCase();
    if (name.length < 3) return { ok: false, error: 'Enter the school or club name.', field: 'org-name' };
    if (!city) return { ok: false, error: 'Enter the city.', field: 'org-city' };
    if (!/^[A-Z]{2}$/.test(state)) return { ok: false, error: 'Use the 2-letter state, like TN.', field: 'org-state' };
    const website = cleanUserText(input.newOrg.website ?? '', 200);
    if (website && !domainOf(website)) return { ok: false, error: 'Check the website address.', field: 'org-website' };
    org = { id: '', city, state, domain: domainOf(website) };
    const created = await asUser(user.id, (tx) =>
      tx.one<{ id: string }>(`insert into organizations (name, city, state, website, domain) values ($1, $2, $3, nullif($4, ''), $5) returning id`, [name, city, state, website, org!.domain]),
    );
    org.id = created!.id;
  } else {
    return { ok: false, error: 'Find your school, or add it.', field: 'school' };
  }

  const code = newTeamCode();
  const title = cleanUserText(input.title ?? '', 60) || 'Head coach';
  const emailDomain = user.email.split('@')[1]?.toLowerCase() ?? '';
  const autoVerify = Boolean(org.domain && (emailDomain === org.domain || emailDomain.endsWith(`.${org.domain}`)));
  try {
    const teamId = await sys.tx(async (tx) => {
      const t = await tx.one<{ id: string }>(
        `insert into teams (org_id, slug, name, sport, level, city, state, about, status, code_hash, created_by,
           verification_status, verification_method, verified_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12, $13) returning id`,
        [org!.id, slugCheck.slug, cleanUserText(input.name, 80), input.sport, input.level, org!.city, org!.state, cleanUserText(input.about ?? '', 1000), codeHash(code), user.id,
          autoVerify ? 'verified' : 'unverified', autoVerify ? 'domain' : null, autoVerify ? new Date() : null],
      );
      await tx.query(`insert into team_secrets (team_id, code) values ($1, $2)`, [t!.id, code]);
      const s = await tx.one<{ id: string }>(`insert into seasons (team_id, label, starts_on, ends_on, status) values ($1, $2, $3, $4, 'active') returning id`, [
        t!.id, cleanUserText(input.seasonLabel, 40), dateOrNull(input.startsOn), dateOrNull(input.endsOn),
      ]);
      await tx.query(`update teams set current_season_id = $2 where id = $1`, [t!.id, s!.id]);
      await tx.query(`insert into needs (team_id, season_id, kind, name, sort) values ($1, $2, 'team_fund', 'Team fund', 0)`, [t!.id, s!.id]);
      await tx.query(`insert into team_members (team_id, user_id, email, role, title, status) values ($1, $2, $3, 'coach', $4, 'active')`, [t!.id, user.id, user.email, title]);
      await tx.query(`insert into share_links (token, team_id) values ($1, $2)`, [teamLinkToken(slugCheck.slug, code), t!.id]);
      await tx.query(`insert into activity_log (team_id, actor_id, action, detail) values ($1, $2, 'team_created', $3)`, [t!.id, user.id, JSON.stringify({ auto_verified: autoVerify })]);
      return t!.id;
    });
    revalidatePath('/app');
    return { ok: true, id: teamId, redirect: `/app/manager/new?team=${teamId}&step=3` };
  } catch (err) {
    console.error('create team failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

/** Step 2 again, once the team exists: edits the draft in place. */
export async function updateDraftTeam(teamId: string, input: Omit<TeamStepInput, 'orgId' | 'newOrg'>): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  const sports = (await sys.query<{ sport: string }>(`select distinct sport from gear_catalog where active`)).map((s) => s.sport);
  const bad = validateTeamStep(input as TeamStepInput, sports);
  if (bad) return bad;
  const slugCheck = await checkSlug(input.slug || input.name, teamId);
  if (!slugCheck.ok) return { ok: false, error: slugCheck.message, field: 'slug' };
  try {
    await asUser(r.user.id, async (tx) => {
      const t = await tx.one<{ status: string; current_season_id: string | null }>(`select status, current_season_id from teams where id = $1`, [teamId]);
      // The address is fixed once the team is live: links and posters use it.
      const params = [teamId, cleanUserText(input.name, 80), input.sport, input.level, cleanUserText(input.about ?? '', 1000)];
      if (t?.status === 'draft') await tx.query(`update teams set name = $2, sport = $3, level = $4, about = $5, slug = $6 where id = $1`, [...params, slugCheck.slug]);
      else await tx.query(`update teams set name = $2, sport = $3, level = $4, about = $5 where id = $1`, params);
      if (t?.current_season_id) {
        await tx.query(`update seasons set label = $2, starts_on = $3, ends_on = $4 where id = $1`, [t.current_season_id, cleanUserText(input.seasonLabel, 40), dateOrNull(input.startsOn), dateOrNull(input.endsOn)]);
      }
      await tx.query(`update team_members set title = $3 where team_id = $1 and user_id = $2`, [teamId, r.user.id, cleanUserText(input.title ?? '', 60) || 'Head coach']);
    });
    refresh(teamId);
    return { ok: true, redirect: `/app/manager/new?team=${teamId}&step=3` };
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

/** Wizard step 3: a document or an athletic director contact puts the team under review. */
export async function submitVerification(teamId: string, input: { method: 'document' | 'contact'; docKey?: string; contactName?: string; contactEmail?: string; note?: string }): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  const current = await sys.one<{ verification_status: string; name: string; domain: string | null }>(
    `select t.verification_status, t.name, o.domain from teams t join organizations o on o.id = t.org_id where t.id = $1`,
    [teamId],
  );
  if (current?.verification_status === 'verified') return { ok: true, message: 'Already verified' };
  let method = '';
  let doc: string | null = null;
  let contact: string | null = null;
  if (input.method === 'document') {
    if (!input.docKey || !input.docKey.startsWith(`${teamId}/verification/`) || input.docKey.includes('..')) return { ok: false, error: 'Upload a staff ID or booster club letter.', field: 'verify-doc' };
    method = 'document';
    doc = input.docKey;
  } else {
    const name = cleanUserText(input.contactName ?? '', 80);
    const email = (input.contactEmail ?? '').trim().toLowerCase();
    if (name.length < 2) return { ok: false, error: "Enter the athletic director's name.", field: 'ad-name' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Enter the athletic director's email.", field: 'ad-email' };
    method = 'contact';
    contact = `${name} <${email}>`;
  }
  try {
    await asUser(r.user.id, (tx) =>
      tx.query(
        `update teams set verification_status = 'under_review', verification_method = $2, verification_doc_path = coalesce($3, verification_doc_path),
           verification_contact = coalesce($4, verification_contact), verification_note = nullif($5, '') where id = $1`,
        [teamId, method, doc, contact, cleanUserText(input.note ?? '', 300)],
      ),
    );
    await log(teamId, r.user.id, 'verification_submitted', { method });
    const admins = await sys.query<{ id: string }>(`select id from profiles where is_admin`);
    for (const a of admins) {
      await notify(sys, {
        userId: a.id,
        kind: 'verification_review',
        subject: `Verify ${current?.name ?? 'a team'}`,
        body: `${r.user.fullName ?? r.user.email} sent ${method === 'document' ? 'a document' : 'an athletic director contact'} to verify ${current?.name ?? 'their team'}.`,
        link: `${env.appUrl}/admin`,
      });
    }
    flushSoon();
    refresh(teamId);
    return { ok: true, message: 'Sent for review. Most teams are verified within 1 business day.', redirect: `/app/manager/new?team=${teamId}&step=4` };
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

/**
 * Wizard step 5: copies a platform template for the sport onto the team (or
 * reuses the team's copy with the same name) and makes it the default.
 */
export async function chooseTemplate(teamId: string, templateId: string): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  if (!UUID.test(templateId)) return { ok: false, error: 'Pick a gear kit.' };
  try {
    const msg = await asUser(r.user.id, async (tx): Promise<Result> => {
      const team = await tx.one<{ sport: string }>(`select sport from teams where id = $1`, [teamId]);
      const src = await tx.one<{ id: string; team_id: string | null; sport: string; name: string; positions: string[] }>(
        `select id, team_id, sport, name, positions from gear_templates where id = $1 and (team_id is null or team_id = $2)`,
        [templateId, teamId],
      );
      if (!src || !team || src.sport !== team.sport) return { ok: false, error: 'That kit is for a different sport.' };
      let chosen = src.team_id ? src.id : null;
      if (!chosen) {
        const mine = await tx.one<{ id: string }>(`select id from gear_templates where team_id = $1 and name = $2`, [teamId, src.name]);
        if (mine) chosen = mine.id;
        else {
          const copy = await tx.one<{ id: string }>(`insert into gear_templates (team_id, sport, name, positions) values ($1, $2, $3, $4) returning id`, [teamId, src.sport, src.name, src.positions]);
          await tx.query(
            `insert into gear_template_items (template_id, catalog_id, size, price_cents, sort) select $2, catalog_id, size, price_cents, sort from gear_template_items where template_id = $1`,
            [src.id, copy!.id],
          );
          chosen = copy!.id;
        }
      }
      await tx.query(`update teams set default_template_id = $2 where id = $1`, [teamId, chosen]);
      return { ok: true, message: `${src.name} is the default kit.` };
    });
    refresh(teamId);
    return msg;
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

/** Publishing needs a verified team and connected payouts (ui-ux-spec 8.1). */
export async function publishTeam(teamId: string): Promise<Result> {
  const r = await roleOn(teamId);
  if (!r?.edit) return NO_ACCESS;
  try {
    const res = await asUser(r.user.id, async (tx): Promise<Result> => {
      const t = await tx.one<{ status: string; verification_status: string; payouts_status: string }>(`select status, verification_status, payouts_status from teams where id = $1`, [teamId]);
      if (!t) return NO_ACCESS;
      if (t.status === 'live') return { ok: true, message: 'Already live' };
      if (t.status !== 'draft') return { ok: false, error: "This team can't be published right now." };
      if (t.verification_status !== 'verified') return { ok: false, error: 'The team needs to be verified first.' };
      if (t.payouts_status !== 'connected') return { ok: false, error: 'Connect payouts first.' };
      await tx.query(`update teams set status = 'live', published_at = coalesce(published_at, now()) where id = $1`, [teamId]);
      return { ok: true, message: 'Your team is live.' };
    });
    if (res.ok) {
      await log(teamId, r.user.id, 'team_published');
      refresh(teamId);
      return { ...res, redirect: `/app/manager/${teamId}` };
    }
    return res;
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
}

/** School search for wizard step 2. Organizations are public information. */
export async function searchOrganizations(q: string): Promise<{ id: string; name: string; city: string; state: string; domain: string | null }[]> {
  await requireUser('/app/manager/new');
  const term = cleanUserText(q ?? '', 80);
  if (term.length < 2) return [];
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sys.query(
    `select id, name, city, state, domain from organizations where name ilike $1 or city ilike $1 order by (name ilike $2) desc, name limit 8`,
    [like, `${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`],
  );
}
