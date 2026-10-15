'use server';
import { revalidatePath } from 'next/cache';
import { asUser, sys, dbErrorMessage, type Tx } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { notifyTeamStaff, flushSoon } from '@/lib/notify';
import { cleanUserText } from '@/lib/domain/text';
import { athleteDisplayName } from '@/lib/domain/names';
import { env } from '@/lib/env';
import { broadcastTeam } from '@/lib/realtime';

export type Result = { ok: true; message?: string } | { ok: false; error: string };

async function run(athleteId: string, fn: (tx: Tx, userId: string) => Promise<Result | void>): Promise<Result> {
  const user = await requireUser(`/app/athlete/${athleteId}`);
  try {
    const r = await asUser(user.id, (tx) => fn(tx, user.id));
    revalidatePath(`/app/athlete/${athleteId}`, 'layout');
    return r ?? { ok: true };
  } catch (err) {
    console.error('athlete action failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

async function teamOf(tx: Tx, athleteId: string) {
  return tx.one<{ team_id: string; require_profile_approval: boolean; status: string }>(
    `select a.team_id, t.require_profile_approval, a.status from athletes a join teams t on t.id = a.team_id where a.id = $1`,
    [athleteId],
  );
}

/** Copies the working profile to the published one when the team doesn't require approval. */
async function publishIfOpen(tx: Tx, athleteId: string) {
  const t = await teamOf(tx, athleteId);
  if (!t || t.require_profile_approval || t.status !== 'live') return;
  await tx.query(
    `update athletes set pub_bio = bio, pub_photo_path = photo_path, pub_preferred_name = preferred_name, published_at = now() where id = $1`,
    [athleteId],
  );
}

export async function saveBasics(athleteId: string, data: { preferredName: string }): Promise<Result> {
  return run(athleteId, async (tx) => {
    const name = cleanUserText(data.preferredName, 30);
    if (name && !/^[\p{L}][\p{L}' .-]*$/u.test(name)) return { ok: false, error: 'Use letters only for the preferred name.' };
    await tx.query(`update athletes set preferred_name = nullif($2, ''), setup_step = greatest(setup_step, 1) where id = $1`, [athleteId, name]);
    await publishIfOpen(tx, athleteId);
  });
}

export async function setStep(athleteId: string, step: number): Promise<Result> {
  return run(athleteId, async (tx) => {
    await tx.query(`update athletes set setup_step = greatest(setup_step, $2) where id = $1`, [athleteId, Math.max(0, Math.min(4, step))]);
  });
}

export async function savePhotoAlt(athleteId: string, alt: string): Promise<Result> {
  return run(athleteId, async (tx) => {
    await tx.query(`update athletes set photo_alt = nullif($2, '') where id = $1`, [athleteId, cleanUserText(alt, 140)]);
  });
}

export async function removePhoto(athleteId: string): Promise<Result> {
  let guardian = false;
  let actor = '';
  const out = await run(athleteId, async (tx, userId) => {
    const role = await tx.one<{ r: string }>(`select athlete_role($1) as r`, [athleteId]);
    guardian = role?.r === 'guardian';
    actor = userId;
    await tx.query(`update athletes set photo_path = null where id = $1`, [athleteId]);
    if (!guardian) await publishIfOpen(tx, athleteId);
  });
  // A guardian can always take a photo down, approval or not. Runs after the
  // user transaction has finished (never nest system queries inside it).
  if (out.ok && guardian) {
    await sys.query(`update athletes set pub_photo_path = null where id = $1`, [athleteId]);
    await sys.query(`insert into activity_log (team_id, athlete_id, actor_id, action) select team_id, id, $2, 'photo_removed' from athletes where id = $1`, [athleteId, actor]);
    await broadcastFor(athleteId);
  }
  return out;
}

export async function saveBio(athleteId: string, bio: string): Promise<Result> {
  return run(athleteId, async (tx) => {
    const clean = cleanUserText(bio, 500);
    await tx.query(`update athletes set bio = $2 where id = $1`, [athleteId, clean]);
    await publishIfOpen(tx, athleteId);
  });
}

export async function toggleNeed(athleteId: string, needId: string, on: boolean): Promise<Result> {
  return run(athleteId, async (tx) => {
    const n = await tx.one<{ raised_cents: number; status: string }>(`select raised_cents, status from needs where id = $1 and athlete_id = $2`, [needId, athleteId]);
    if (!n) return { ok: false, error: 'That item is gone.' };
    if (!on && n.raised_cents > 0) return { ok: false, error: 'Already has donations. Ask your coach to remove it.' };
    await tx.query(`update needs set status = $2, removed_at = case when $2 = 'removed' then now() else null end where id = $1`, [needId, on ? 'open' : 'removed']);
  }).then(async (r) => {
    if (r.ok) await broadcastFor(athleteId);
    return r;
  });
}

export async function updateNeed(athleteId: string, needId: string, data: { variant?: string; whyNote?: string }): Promise<Result> {
  return run(athleteId, async (tx) => {
    await tx.query(
      `update needs set variant = coalesce($3, variant), why_note = case when $4::text is null then why_note else nullif($4, '') end where id = $1 and athlete_id = $2`,
      [needId, athleteId, data.variant !== undefined ? cleanUserText(data.variant, 40) : null, data.whyNote !== undefined ? cleanUserText(data.whyNote, 140) : null],
    );
  });
}

export async function moveNeed(athleteId: string, needId: string, dir: -1 | 1): Promise<Result> {
  return run(athleteId, async (tx) => {
    const list = await tx.query<{ id: string }>(
      `select n.id from needs n join athletes a on a.id = n.athlete_id join teams t on t.id = a.team_id
       where n.athlete_id = $1 and n.season_id = t.current_season_id order by n.sort, n.created_at`,
      [athleteId],
    );
    const i = list.findIndex((n) => n.id === needId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) await tx.query(`update needs set sort = $2 where id = $1`, [list[k].id, k]);
  });
}

export async function savePins(athleteId: string, pins: { needId: string; x: number | null; y: number | null }[]): Promise<Result> {
  return run(athleteId, async (tx) => {
    for (const p of pins.slice(0, 40)) {
      const ok = p.x === null || (p.x >= 0 && p.x <= 1 && p.y !== null && p.y >= 0 && p.y <= 1);
      if (!ok) continue;
      await tx.query(`update needs set pin_x = $3, pin_y = $4 where id = $1 and athlete_id = $2`, [p.needId, athleteId, p.x, p.x === null ? null : p.y]);
    }
  }).then(async (r) => {
    if (r.ok) await broadcastFor(athleteId);
    return r;
  });
}

/** "Request an item": always goes to the coach queue (the database forces pending). */
export async function requestItem(athleteId: string, data: { catalogId?: string | null; name?: string; size?: string; reason: string }): Promise<Result> {
  const out = await run(athleteId, async (tx) => {
    const reason = cleanUserText(data.reason, 300);
    if (reason.length < 5) return { ok: false, error: 'Add a short reason for the coach.' };
    const a = await tx.one<{ team_id: string; season: string | null }>(
      `select a.team_id, t.current_season_id as season from athletes a join teams t on t.id = a.team_id where a.id = $1`,
      [athleteId],
    );
    if (!a?.season) return { ok: false, error: "The team's season isn't set up yet." };
    let name = cleanUserText(data.name ?? '', 80);
    let price: number | null = null;
    let catalogId: string | null = null;
    if (data.catalogId) {
      const c = await tx.one<{ id: string; name: string; default_price_cents: number }>(`select id, name, default_price_cents from gear_catalog where id = $1 and active`, [data.catalogId]);
      if (!c) return { ok: false, error: 'Pick an item from the list.' };
      name = c.name;
      price = c.default_price_cents;
      catalogId = c.id;
    }
    if (!name) return { ok: false, error: 'Name the item you need.' };
    // Custom items start with a placeholder price the coach sets on approval.
    price ??= 100;
    const sort = await tx.one<{ s: number }>(`select coalesce(max(sort), 0) + 1 as s from needs where athlete_id = $1`, [athleteId]);
    await tx.query(
      `insert into needs (team_id, season_id, athlete_id, kind, catalog_id, name, variant, price_cents, sort, request_status, request_reason)
       values ($1, $2, $3, 'athlete', $4, $5, nullif($6, ''), $7, $8, 'pending', $9)`,
      [a.team_id, a.season, athleteId, catalogId, name, cleanUserText(data.size ?? '', 40), price, sort?.s ?? 0, reason],
    );
    return { ok: true, message: 'Sent to your coach.' };
  });
  if (out.ok) await staffNote(athleteId, 'gear_request', (n) => `${n} requested an item`, (n) => `${n} asked for a new item. Review it in Approvals.`, 'approvals?tab=gear');
  return out;
}

export async function withdrawRequest(athleteId: string, needId: string): Promise<Result> {
  return run(athleteId, async (tx) => {
    await tx.query(`update needs set status = 'removed', removed_at = now() where id = $1 and athlete_id = $2 and request_status = 'pending' and raised_cents = 0`, [needId, athleteId]);
  });
}

/** Final setup step: submit for approval, or publish when approval is off. */
export async function submitProfile(athleteId: string): Promise<Result> {
  let published = false;
  const out = await run(athleteId, async (tx) => {
    const a = await tx.one<any>(
      `select a.status, a.bio, a.photo_path, a.consent_at, t.require_profile_approval from athletes a join teams t on t.id = a.team_id where a.id = $1`,
      [athleteId],
    );
    if (!a) return { ok: false, error: 'This page no longer exists.' };
    if (!a.consent_at) return { ok: false, error: 'A parent or guardian needs to give consent first.' };
    const open = await tx.one<{ n: number }>(`select count(*)::int as n from needs where athlete_id = $1 and status <> 'removed' and request_status = 'approved'`, [athleteId]);
    if (!open?.n) return { ok: false, error: 'Keep at least one item on your gear list.' };
    if (a.require_profile_approval) {
      await tx.query(
        `update athletes set status = case when status = 'live' then 'live'::athlete_status else 'awaiting_coach'::athlete_status end,
           submitted_at = now(), setup_step = 4, review_note = null where id = $1`,
        [athleteId],
      );
    } else {
      await tx.query(
        `update athletes set status = 'live', submitted_at = now(), setup_step = 4, review_note = null,
           pub_bio = bio, pub_photo_path = photo_path, pub_preferred_name = preferred_name, published_at = now() where id = $1`,
        [athleteId],
      );
      published = true;
    }
  });
  if (out.ok) {
    await sys.query(`insert into activity_log (team_id, athlete_id, action) select team_id, id, $2 from athletes where id = $1`, [athleteId, published ? 'profile_published' : 'profile_submitted']);
    if (published) await broadcastFor(athleteId);
    else await staffNote(athleteId, 'approval', (n) => `${n}'s profile is ready for review`, (n) => `${n} submitted their profile. Review it in Approvals.`, 'approvals');
  }
  return out.ok ? { ok: true, message: published ? 'published' : 'submitted' } : out;
}

/** Guardian controls (ui-ux-spec 7.8). The database guard keeps athletes out of these. */
export async function setHidden(athleteId: string, hidden: boolean): Promise<Result> {
  const out = await run(athleteId, async (tx) => {
    const role = await tx.one<{ r: string }>(`select athlete_role($1) as r`, [athleteId]);
    if (role?.r !== 'guardian') return { ok: false, error: 'Only a parent or guardian can do this.' };
    if (hidden) {
      await tx.query(`update athletes set status = 'hidden', hidden_reason = 'guardian' where id = $1 and status <> 'needs_consent'`, [athleteId]);
    } else {
      const a = await tx.one<{ published_at: Date | null; hidden_reason: string | null }>(`select published_at, hidden_reason from athletes where id = $1`, [athleteId]);
      if (a?.hidden_reason === 'manager') return { ok: false, error: 'Your coach hid this page. Ask them to show it again.' };
      await tx.query(
        `update athletes set status = case when published_at is not null then 'live'::athlete_status else 'draft'::athlete_status end, hidden_reason = null where id = $1`,
        [athleteId],
      );
    }
  });
  if (out.ok) {
    await broadcastFor(athleteId);
    await staffNote(athleteId, 'privacy', (n) => (hidden ? `${n}'s page was hidden by their family` : `${n}'s page is visible again`), (n) => (hidden ? `A parent or guardian hid ${n}'s page. Gifts already made stay with ${n}'s gear.` : `A parent or guardian made ${n}'s page visible again.`), 'roster');
  }
  return out;
}

export async function setPrivacy(athleteId: string, data: { showFullLastName?: boolean; athleteCanEdit?: boolean }): Promise<Result> {
  return run(athleteId, async (tx) => {
    const role = await tx.one<{ r: string; u13: boolean }>(`select athlete_role($1) as r, (select under_13 from athletes where id = $1) as u13`, [athleteId]);
    if (role?.r !== 'guardian') return { ok: false, error: 'Only a parent or guardian can do this.' };
    if (data.showFullLastName !== undefined) await tx.query(`update athletes set show_full_last_name = $2 where id = $1`, [athleteId, data.showFullLastName]);
    if (data.athleteCanEdit !== undefined) await tx.query(`update athletes set athlete_can_edit = $2 where id = $1`, [athleteId, data.athleteCanEdit && !role.u13]);
  });
}

/** Withdrawing consent hides the page at once; funds stay earmarked (ui-ux-spec 11, edge cases). */
export async function withdrawConsent(athleteId: string): Promise<Result> {
  const user = await requireUser(`/app/athlete/${athleteId}/profile`);
  const role = await sys.one<{ role: string }>(`select role from athlete_access where athlete_id = $1 and user_id = $2`, [athleteId, user.id]);
  if (role?.role !== 'guardian') return { ok: false, error: 'Only a parent or guardian can do this.' };
  await sys.tx(async (tx) => {
    await tx.query(`update consents set withdrawn_at = now() where athlete_id = $1 and withdrawn_at is null`, [athleteId]);
    await tx.query(`update athletes set status = 'needs_consent', consent_at = null, hidden_reason = 'consent_withdrawn' where id = $1`, [athleteId]);
    await tx.query(`insert into activity_log (team_id, athlete_id, actor_id, action) select team_id, id, $2, 'consent_withdrawn' from athletes where id = $1`, [athleteId, user.id]);
  });
  await broadcastFor(athleteId);
  await staffNote(athleteId, 'privacy', (n) => `Consent withdrawn for ${n}`, (n) => `A parent or guardian withdrew consent for ${n}. The page is hidden. Gifts already made stay earmarked for ${n}'s gear.`, 'roster');
  revalidatePath(`/app/athlete/${athleteId}`, 'layout');
  return { ok: true };
}

/**
 * Deleting a profile removes the photo, bio and contact details and takes the
 * athlete off the roster. Blocked while money is held for undelivered gear.
 */
export async function deleteProfile(athleteId: string, confirmName: string): Promise<Result> {
  const user = await requireUser(`/app/athlete/${athleteId}/profile`);
  const role = await sys.one<{ role: string }>(`select role from athlete_access where athlete_id = $1 and user_id = $2`, [athleteId, user.id]);
  if (role?.role !== 'guardian') return { ok: false, error: 'Only a parent or guardian can do this.' };
  const a = await sys.one<any>(`select id, team_id, first_name from athletes where id = $1`, [athleteId]);
  if (!a) return { ok: false, error: 'Already deleted.' };
  if (confirmName.trim().toLowerCase() !== a.first_name.trim().toLowerCase()) return { ok: false, error: `Type ${a.first_name} to confirm.` };
  const held = await sys.one<{ c: number }>(
    `select coalesce(sum(raised_cents), 0)::int as c from needs where athlete_id = $1 and raised_cents > 0 and status not in ('delivered', 'removed')`,
    [athleteId],
  );
  if ((held?.c ?? 0) > 0) {
    return { ok: false, error: `Supporters have given toward gear that hasn't been delivered yet. Hide the page instead, or ask ${'your coach'} to move those funds to the team fund first.` };
  }
  const name = athleteDisplayName(await sys.one<any>(`select first_name, last_name, preferred_name, show_full_last_name from athletes where id = $1`, [athleteId]));
  await sys.tx(async (tx) => {
    await tx.query(`delete from athlete_contacts where athlete_id = $1`, [athleteId]);
    await tx.query(`delete from athlete_access where athlete_id = $1`, [athleteId]);
    await tx.query(`update invites set expires_at = now() where athlete_id = $1`, [athleteId]);
    await tx.query(`update needs set status = 'removed', removed_at = now() where athlete_id = $1 and raised_cents = 0 and status <> 'removed'`, [athleteId]);
    await tx.query(
      `update athletes set archived_at = now(), status = 'hidden', hidden_reason = 'deleted', bio = '', pub_bio = null, photo_path = null, pub_photo_path = null,
         photo_alt = null, preferred_name = null, pub_preferred_name = null, share_token = encode(gen_random_uuid()::text::bytea, 'hex') where id = $1`,
      [athleteId],
    );
    await tx.query(`insert into activity_log (team_id, athlete_id, actor_id, action) values ($1, null, $2, 'profile_deleted')`, [a.team_id, user.id]);
  });
  await notifyTeamStaff(sys, a.team_id, {
    kind: 'privacy',
    subject: `${name}'s profile was deleted`,
    body: `A parent or guardian deleted ${name}'s profile. Their photo, bio and contact details were removed.`,
    link: `${env.appUrl}/app/manager/${a.team_id}/roster`,
  });
  flushSoon();
  await broadcastTeam(a.team_id);
  return { ok: true };
}

async function broadcastFor(athleteId: string) {
  const t = await sys.one<{ team_id: string }>(`select team_id from athletes where id = $1`, [athleteId]);
  if (t) await broadcastTeam(t.team_id);
}

async function staffNote(athleteId: string, kind: string, subject: (n: string) => string, body: (n: string) => string, path: string) {
  const a = await sys.one<any>(`select team_id, first_name, last_name, preferred_name, show_full_last_name from athletes where id = $1`, [athleteId]);
  if (!a) return;
  const n = athleteDisplayName(a);
  await notifyTeamStaff(sys, a.team_id, { kind, subject: subject(n), body: body(n), link: `${env.appUrl}/app/manager/${a.team_id}/${path}` });
  flushSoon();
}
