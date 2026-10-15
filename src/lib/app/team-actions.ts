'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { asUser, sys, dbErrorMessage, type Tx } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { notify, notifyAthleteFamily, flushSoon } from '@/lib/notify';
import { cleanUserText } from '@/lib/domain/text';
import { athleteDisplayName, athleteSlug, defaultUnder13, positionGroup } from '@/lib/domain/names';
import { checkRows, type ImportRow } from '@/lib/domain/roster-import';
import { randomToken } from '@/lib/crypto';
import { sendAthleteInvites, coachTitle } from '@/lib/invites';
import { sendThankYou } from '@/lib/thanks';
import { broadcastTeam } from '@/lib/realtime';
import { env } from '@/lib/env';

/**
 * Coach and staff actions for the roster, approvals and gear (ui-ux-spec 8.2
 * to 8.7). Writes run as the signed-in person so row level security applies;
 * emails and notifications are queued afterwards, outside that transaction.
 */

export type Result<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

const uuid = z.string().uuid();

async function editor(teamId: string) {
  const user = await requireUser(`/app/manager/${teamId}`);
  if (!uuid.safeParse(teamId).success) throw new ActionError('That team was not found.');
  const ok = await asUser(user.id, (tx) => tx.one<{ ok: boolean }>(`select can_edit_team($1) as ok`, [teamId]));
  if (!ok?.ok) throw new ActionError("You don't have access to change this team.");
  return user;
}

class ActionError extends Error {}

async function guarded<T>(teamId: string, fn: (userId: string) => Promise<Result<T>>): Promise<Result<T>> {
  try {
    const user = await editor(teamId);
    const r = await fn(user.id);
    revalidatePath(`/app/manager/${teamId}`, 'layout');
    return r;
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.message };
    console.error('team action failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

async function log(teamId: string, actorId: string, action: string, athleteId: string | null = null, detail: Record<string, unknown> = {}) {
  await sys.query(`insert into activity_log (team_id, athlete_id, actor_id, action, detail) values ($1, $2, $3, $4, $5)`, [
    teamId,
    athleteId,
    actorId,
    action,
    JSON.stringify(detail),
  ]);
}

async function coachName(teamId: string) {
  const r = await sys.one<{ n: string | null }>(
    `select p.full_name as n from team_members m join profiles p on p.id = m.user_id where m.team_id = $1 and m.role = 'coach' and m.status = 'active' order by m.created_at limit 1`,
    [teamId],
  );
  return coachTitle(r?.n ?? 'Your coach');
}

async function athleteName(athleteId: string) {
  const a = await sys.one<any>(`select first_name, last_name, preferred_name, show_full_last_name from athletes where id = $1`, [athleteId]);
  return a ? athleteDisplayName(a) : 'the athlete';
}

const appLink = (athleteId: string, path = '') => `${env.appUrl}/app/athlete/${athleteId}${path}`;

// Roster ---------------------------------------------------------------------

const EMAIL = z.string().trim().toLowerCase().email().max(200);
const optionalEmail = z.union([z.literal(''), EMAIL]).optional().transform((v) => v || null);

const AthleteInput = z.object({
  firstName: z.string().trim().min(1, 'Add a first name.').max(40),
  lastName: z.string().trim().min(1, 'Add a last name.').max(40),
  jersey: z.string().trim().regex(/^\d{0,2}$/, 'Number should be 0 to 99.').optional().default(''),
  position: z.string().trim().toUpperCase().max(4).optional().default(''),
  grade: z.coerce.number().int().min(1).max(12).nullable().optional(),
  guardianEmail: optionalEmail,
  guardian2Email: optionalEmail,
  guardianPhone: z.string().trim().max(30).optional().default(''),
  athleteEmail: optionalEmail,
});
export type AthleteInput = z.input<typeof AthleteInput>;

async function uniqueSlug(tx: Tx, teamId: string, base: string) {
  const taken = new Set(
    (await tx.query<{ slug: string }>(`select slug from athletes where team_id = $1 and (slug = $2 or slug like $2 || '-%')`, [teamId, base])).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

async function insertAthlete(tx: Tx, team: { id: string; level: string }, a: z.output<typeof AthleteInput>) {
  const name = (s: string) => cleanUserText(s, 40);
  const slug = await uniqueSlug(tx, team.id, athleteSlug(a.firstName, a.lastName, a.jersey));
  const row = await tx.one<{ id: string }>(
    `insert into athletes (team_id, first_name, last_name, jersey, position, position_group, grade, under_13, slug, share_token)
     values ($1, $2, $3, nullif($4, ''), nullif($5, ''), $6, $7, $8, $9, $10) returning id`,
    [team.id, name(a.firstName), name(a.lastName), a.jersey, a.position, positionGroup(a.position), a.grade ?? null, defaultUnder13(a.grade, team.level), slug, randomToken(16)],
  );
  await tx.query(
    `insert into athlete_contacts (athlete_id, guardian_email, guardian2_email, guardian_phone, athlete_email) values ($1, $2, $3, nullif($4, ''), $5)`,
    [row!.id, a.guardianEmail, a.guardian2Email, a.guardianPhone, a.athleteEmail],
  );
  return row!.id;
}

async function teamRow(tx: Tx, teamId: string) {
  const t = await tx.one<{ id: string; level: string; sport: string; season: string | null; default_template_id: string | null }>(
    `select id, level, sport, current_season_id as season, default_template_id from teams where id = $1`,
    [teamId],
  );
  if (!t) throw new ActionError('That team was not found.');
  return t;
}

export async function addAthlete(teamId: string, input: AthleteInput, opts: { sendInvite: boolean; templateId?: string | 'auto' | 'none' }): Promise<Result<{ id: string }>> {
  const parsed = AthleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  let id = '';
  const r = await guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const team = await teamRow(tx, teamId);
      const dupe = await tx.one(
        `select 1 from athletes where team_id = $1 and archived_at is null and lower(first_name) = lower($2) and lower(last_name) = lower($3) and coalesce(jersey, '') = $4`,
        [teamId, parsed.data.firstName, parsed.data.lastName, parsed.data.jersey],
      );
      if (dupe) throw new ActionError('That athlete is already on the roster.');
      id = await insertAthlete(tx, team, parsed.data);
      if (team.season && opts.templateId !== 'none') await applyTemplateTx(tx, team, opts.templateId ?? 'auto', [id], false, false);
    });
    await log(teamId, userId, 'athlete_added', id);
    return { ok: true, data: { id } };
  });
  if (r.ok && opts.sendInvite) {
    const s = await sendAthleteInvites(id);
    return { ok: true, data: { id }, message: s.sent ? 'Added and invited.' : 'Added. No guardian email, so no invite was sent.' };
  }
  return r;
}

export async function updateAthlete(teamId: string, athleteId: string, input: AthleteInput): Promise<Result> {
  const parsed = AthleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const a = parsed.data;
  return guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const team = await teamRow(tx, teamId);
      const cur = await tx.one<any>(`select id, under_13, grade from athletes where id = $1 and team_id = $2`, [athleteId, teamId]);
      if (!cur) throw new ActionError('That athlete was not found.');
      // Grade changes move the under-13 default only while it still matches the old default.
      const under13 = cur.under_13 === defaultUnder13(cur.grade, team.level) ? defaultUnder13(a.grade, team.level) : cur.under_13;
      await tx.query(
        `update athletes set first_name = $3, last_name = $4, jersey = nullif($5, ''), position = nullif($6, ''), position_group = $7, grade = $8, under_13 = $9
         where id = $1 and team_id = $2`,
        [athleteId, teamId, cleanUserText(a.firstName, 40), cleanUserText(a.lastName, 40), a.jersey, a.position, positionGroup(a.position), a.grade ?? null, under13],
      );
      await tx.query(
        `insert into athlete_contacts (athlete_id, guardian_email, guardian2_email, guardian_phone, athlete_email) values ($1, $2, $3, nullif($4, ''), $5)
         on conflict (athlete_id) do update set guardian_email = excluded.guardian_email, guardian2_email = excluded.guardian2_email,
           guardian_phone = excluded.guardian_phone, athlete_email = excluded.athlete_email`,
        [athleteId, a.guardianEmail, a.guardian2Email, a.guardianPhone, a.athleteEmail],
      );
    });
    await log(teamId, userId, 'athlete_updated', athleteId);
    return { ok: true, message: 'Saved' };
  });
}

const ImportRowSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  jersey: z.string(),
  position: z.string(),
  grade: z.number().int().nullable(),
  guardian_email: z.string(),
  athlete_email: z.string(),
  guardian_phone: z.string(),
});

/** Import step 4 (ui-ux-spec 8.4). Rows are checked again here; rows with errors are skipped. */
export async function importRoster(
  teamId: string,
  rows: ImportRow[],
  opts: { sendInvites: boolean; templateId: string | 'auto' | 'none' },
): Promise<Result<{ added: number; skipped: number; invited: number; noEmail: number; noEmailAthletes: { id: string; name: string }[] }>> {
  const parsed = z.array(ImportRowSchema).max(300).safeParse(rows);
  if (!parsed.success) return { ok: false, error: 'The file could not be read. Check the columns and try again.' };
  const ids: string[] = [];
  let skipped = 0;
  const r = await guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const team = await teamRow(tx, teamId);
      const existing = await tx.query<any>(
        `select a.first_name, a.last_name, a.jersey, c.guardian_email, c.athlete_email from athletes a left join athlete_contacts c on c.athlete_id = a.id
         where a.team_id = $1 and a.archived_at is null`,
        [teamId],
      );
      const checks = checkRows(parsed.data, existing);
      for (const c of checks) {
        if (c.level === 'error') {
          skipped++;
          continue;
        }
        const input = AthleteInput.safeParse({
          firstName: c.row.first_name,
          lastName: c.row.last_name,
          jersey: /^\d{1,2}$/.test(c.row.jersey) ? c.row.jersey : '',
          position: c.row.position.slice(0, 4),
          grade: c.row.grade,
          guardianEmail: c.row.guardian_email,
          athleteEmail: c.row.athlete_email,
          guardianPhone: c.row.guardian_phone,
        });
        if (!input.success) {
          skipped++;
          continue;
        }
        ids.push(await insertAthlete(tx, team, input.data));
      }
      if (team.season && ids.length && opts.templateId !== 'none') await applyTemplateTx(tx, team, opts.templateId, ids, false, false);
    });
    await log(teamId, userId, 'roster_imported', null, { added: ids.length, skipped });
    return { ok: true };
  });
  if (!r.ok) return r;
  let invited = 0;
  const noEmailIds: string[] = [];
  for (const id of ids) {
    if (opts.sendInvites) {
      const s = await sendAthleteInvites(id);
      if (s.sent) invited++;
      if (s.missingEmail) noEmailIds.push(id);
    } else {
      const c = await sys.one(`select 1 from athlete_contacts where athlete_id = $1 and guardian_email is not null`, [id]);
      if (!c) noEmailIds.push(id);
    }
  }
  const named = noEmailIds.length
    ? await sys.query<{ id: string; first_name: string; last_name: string; jersey: string | null }>(`select id, first_name, last_name, jersey from athletes where id = any($1::uuid[]) order by last_name`, [noEmailIds])
    : [];
  const noEmailAthletes = named.map((a) => ({ id: a.id, name: `${a.first_name} ${a.last_name}${a.jersey ? ` #${a.jersey}` : ''}` }));
  return { ok: true, data: { added: ids.length, skipped, invited, noEmail: noEmailIds.length, noEmailAthletes } };
}

async function rosterIds(tx: Tx, teamId: string, athleteIds: string[]) {
  const clean = athleteIds.filter((i) => uuid.safeParse(i).success).slice(0, 500);
  if (!clean.length) return [];
  return (await tx.query<{ id: string }>(`select id from athletes where team_id = $1 and archived_at is null and id = any($2::uuid[])`, [teamId, clean])).map((r) => r.id);
}

/** Send or resend invites. People who already joined are skipped. */
export async function inviteAthletes(teamId: string, athleteIds: string[]): Promise<Result<{ sent: number; noEmail: number }>> {
  let ids: string[] = [];
  const r = await guarded(teamId, async (userId) => {
    ids = await asUser(userId, (tx) => rosterIds(tx, teamId, athleteIds));
    return { ok: true };
  });
  if (!r.ok) return r;
  let sent = 0;
  let noEmail = 0;
  for (const id of ids) {
    const a = await sys.one<{ invite_status: string }>(`select invite_status from athletes where id = $1`, [id]);
    if (a?.invite_status === 'accepted') continue;
    const s = await sendAthleteInvites(id, { reminder: a?.invite_status !== 'not_sent' });
    sent += s.sent ? 1 : 0;
    if (s.missingEmail) noEmail++;
  }
  revalidatePath(`/app/manager/${teamId}`, 'layout');
  const parts = [sent ? `Sent to ${sent} ${sent === 1 ? 'family' : 'families'}.` : 'No invites needed sending.'];
  if (noEmail) parts.push(`${noEmail} ${noEmail === 1 ? 'has' : 'have'} no guardian email.`);
  return { ok: true, data: { sent, noEmail }, message: parts.join(' ') };
}

/** Coach hides or shows pages. A page the family hid stays hidden: that's their call. */
export async function setAthletesHidden(teamId: string, athleteIds: string[], hidden: boolean): Promise<Result<{ changed: number; skipped: number }>> {
  let changed: string[] = [];
  let skipped = 0;
  const r = await guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const ids = await rosterIds(tx, teamId, athleteIds);
      if (hidden) {
        changed = (
          await tx.query<{ id: string }>(
            `update athletes set status = 'hidden', hidden_reason = 'manager' where id = any($1::uuid[]) and status not in ('hidden', 'needs_consent') returning id`,
            [ids],
          )
        ).map((x) => x.id);
      } else {
        changed = (
          await tx.query<{ id: string }>(
            `update athletes set status = case when published_at is not null then 'live'::athlete_status else 'draft'::athlete_status end, hidden_reason = null
             where id = any($1::uuid[]) and status = 'hidden' and hidden_reason = 'manager' returning id`,
            [ids],
          )
        ).map((x) => x.id);
      }
      skipped = ids.length - changed.length;
    });
    for (const id of changed) await log(teamId, userId, hidden ? 'hidden_by_manager' : 'shown_by_manager', id);
    return { ok: true };
  });
  if (!r.ok) return r;
  const coach = await coachName(teamId);
  for (const id of changed) {
    const n = await athleteName(id);
    await notifyAthleteFamily(sys, id, {
      kind: 'privacy',
      subject: hidden ? `${coach} hid ${n}'s page` : `${n}'s page is visible again`,
      body: hidden ? `${coach} hid ${n}'s page for now. Gifts already made stay with ${n}'s gear.` : `${coach} made ${n}'s page visible again.`,
      link: appLink(id),
    });
  }
  flushSoon();
  await broadcastTeam(teamId);
  const msg = hidden ? `Hid ${changed.length}.` : `Showing ${changed.length} again.`;
  return { ok: true, data: { changed: changed.length, skipped }, message: skipped && !hidden ? `${msg} ${skipped} hidden by their family stay hidden.` : msg };
}

/** Takes athletes off the roster. Blocked while supporters' money is held for their gear. */
export async function removeAthletes(teamId: string, athleteIds: string[]): Promise<Result<{ removed: number; blocked: string[] }>> {
  const blocked: string[] = [];
  let removed: string[] = [];
  const r = await guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const ids = await rosterIds(tx, teamId, athleteIds);
      const held = await tx.query<{ athlete_id: string }>(
        `select distinct athlete_id from needs where athlete_id = any($1::uuid[]) and raised_cents > 0 and status not in ('delivered', 'removed')`,
        [ids],
      );
      const heldSet = new Set(held.map((h) => h.athlete_id));
      const ok = ids.filter((i) => !heldSet.has(i));
      for (const id of heldSet) blocked.push(id);
      if (ok.length) {
        await tx.query(`update needs set status = 'removed', removed_at = now() where athlete_id = any($1::uuid[]) and raised_cents = 0 and status <> 'removed'`, [ok]);
        await tx.query(`update invites set expires_at = now() where athlete_id = any($1::uuid[]) and used_at is null`, [ok]);
        removed = (
          await tx.query<{ id: string }>(
            `update athletes set archived_at = now(), status = 'hidden', hidden_reason = 'manager' where id = any($1::uuid[]) returning id`,
            [ok],
          )
        ).map((x) => x.id);
      }
    });
    for (const id of removed) await log(teamId, userId, 'athlete_removed', id);
    return { ok: true };
  });
  if (!r.ok) return r;
  await broadcastTeam(teamId);
  const names = await Promise.all(blocked.map(athleteName));
  return {
    ok: true,
    data: { removed: removed.length, blocked },
    message: blocked.length
      ? `Removed ${removed.length}. ${names.join(', ')} ${blocked.length === 1 ? 'has' : 'have'} gifts toward gear not yet delivered. Deliver it or move the funds first.`
      : `Removed ${removed.length}.`,
  };
}

/** Coach message to an athlete's guardians, sent by the platform so no one sees anyone's email. */
export async function messageGuardian(teamId: string, athleteId: string, body: string): Promise<Result> {
  const text = cleanUserText(body, 1000);
  if (text.length < 5) return { ok: false, error: 'Write a message first.' };
  let userId = '';
  const r = await guarded(teamId, async (uid) => {
    userId = uid;
    const ok = await asUser(uid, (tx) => tx.one(`select 1 from athletes where id = $1 and team_id = $2`, [athleteId, teamId]));
    if (!ok) throw new ActionError('That athlete was not found.');
    return { ok: true };
  });
  if (!r.ok) return r;
  const recent = await sys.one<{ n: number }>(
    `select count(*)::int as n from activity_log where athlete_id = $1 and action = 'guardian_messaged' and created_at > now() - interval '1 day'`,
    [athleteId],
  );
  if ((recent?.n ?? 0) >= 5) return { ok: false, error: 'You have sent 5 messages about this athlete today. Try again tomorrow.' };
  const c = await sys.one<any>(`select guardian_email, guardian2_email from athlete_contacts where athlete_id = $1`, [athleteId]);
  const coach = await coachName(teamId);
  const team = await sys.one<{ name: string }>(`select name from teams where id = $1`, [teamId]);
  const n = await athleteName(athleteId);
  const linked = await sys.query<{ user_id: string; email: string }>(
    `select x.user_id, p.email from athlete_access x join profiles p on p.id = x.user_id where x.athlete_id = $1 and x.role = 'guardian'`,
    [athleteId],
  );
  const emails = new Set<string>();
  const subject = `Message from ${coach} about ${n}`;
  const msg = `${coach} (${team?.name}) wrote:\n\n${text}\n\nReply to your coach directly. This email address doesn't accept replies.`;
  for (const g of linked) {
    emails.add(g.email.toLowerCase());
    await notify(sys, { userId: g.user_id, email: g.email, kind: 'coach_message', subject, body: msg, link: appLink(athleteId) });
  }
  for (const e of [c?.guardian_email, c?.guardian2_email]) {
    if (e && !emails.has(e.toLowerCase())) {
      emails.add(e.toLowerCase());
      await notify(sys, { email: e, kind: 'coach_message', subject, body: msg, inApp: false });
    }
  }
  if (!emails.size) return { ok: false, error: 'No guardian email on file. Add one under Contacts.' };
  await log(teamId, userId, 'guardian_messaged', athleteId, { recipients: emails.size });
  flushSoon();
  return { ok: true, message: `Sent to ${emails.size} ${emails.size === 1 ? 'guardian' : 'guardians'}.` };
}

// Gear on an athlete ---------------------------------------------------------

async function needWithBounds(tx: Tx, teamId: string, needId: string) {
  const n = await tx.one<any>(
    `select n.*, c.price_min_cents, c.price_max_cents from needs n left join gear_catalog c on c.id = n.catalog_id where n.id = $1 and n.team_id = $2`,
    [needId, teamId],
  );
  if (!n) throw new ActionError('That item is gone.');
  return n;
}

/** Custom items (no catalog entry) get a sane ceiling instead of catalog bounds. */
const CUSTOM_MAX = 200000;

function priceProblem(cents: number, n: { price_min_cents: number | null; price_max_cents: number | null; raised_cents: number }) {
  if (!Number.isInteger(cents) || cents < 100) return 'Enter a price of at least $1.';
  if (n.price_min_cents != null && (cents < n.price_min_cents || cents > n.price_max_cents!))
    return `Keep the price between $${n.price_min_cents / 100} and $${n.price_max_cents! / 100}.`;
  if (n.price_min_cents == null && cents > CUSTOM_MAX) return `Keep the price under $${CUSTOM_MAX / 100}.`;
  if (cents < n.raised_cents) return `Supporters already gave $${(n.raised_cents / 100).toFixed(2)}. The price can't be lower than that.`;
  return null;
}

export async function setNeedPrice(teamId: string, needId: string, cents: number, note?: string): Promise<Result> {
  return guarded(teamId, async (userId) => {
    let athleteId: string | null = null;
    await asUser(userId, async (tx) => {
      const n = await needWithBounds(tx, teamId, needId);
      athleteId = n.athlete_id;
      if (['purchased', 'delivered', 'removed'].includes(n.status)) throw new ActionError('This item is already purchased, so its price is final.');
      const p = priceProblem(cents, n);
      if (p) throw new ActionError(p);
      await tx.query(`update needs set price_cents = $2, price_note = nullif($3, '') where id = $1`, [needId, cents, cleanUserText(note ?? '', 140)]);
    });
    await log(teamId, userId, 'price_changed', athleteId, { need: needId, cents });
    await broadcastTeam(teamId);
    return { ok: true, message: 'Price saved' };
  });
}

export async function updateNeedDetails(teamId: string, needId: string, data: { variant?: string; whyNote?: string }): Promise<Result> {
  return guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      await needWithBounds(tx, teamId, needId);
      await tx.query(
        `update needs set variant = case when $2::text is null then variant else nullif($2, '') end, why_note = case when $3::text is null then why_note else nullif($3, '') end where id = $1`,
        [needId, data.variant !== undefined ? cleanUserText(data.variant, 40) : null, data.whyNote !== undefined ? cleanUserText(data.whyNote, 140) : null],
      );
    });
    return { ok: true, message: 'Saved' };
  });
}

/** Removes an item with no gifts, or brings a removed one back. Items with gifts need their funds moved first. */
export async function setNeedActive(teamId: string, needId: string, active: boolean): Promise<Result> {
  return guarded(teamId, async (userId) => {
    let athleteId: string | null = null;
    await asUser(userId, async (tx) => {
      const n = await needWithBounds(tx, teamId, needId);
      athleteId = n.athlete_id;
      if (!active && n.raised_cents > 0) throw new ActionError('Supporters gave toward this item. Move the funds before removing it.');
      if (!active && ['purchased', 'delivered'].includes(n.status)) throw new ActionError('This item was already bought.');
      await tx.query(`update needs set status = $2, removed_at = case when $2 = 'removed' then now() else null end where id = $1`, [needId, active ? 'open' : 'removed']);
    });
    await log(teamId, userId, active ? 'need_restored' : 'need_removed', athleteId, { need: needId });
    await broadcastTeam(teamId);
    return { ok: true, message: active ? 'Item back on the list' : 'Item removed' };
  });
}

export async function addNeed(
  teamId: string,
  data: { athleteId: string | null; catalogId: string | null; name?: string; variant?: string; priceCents: number; whyNote?: string },
): Promise<Result> {
  return guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const team = await teamRow(tx, teamId);
      if (!team.season) throw new ActionError('Set up the season first.');
      let name = cleanUserText(data.name ?? '', 80);
      let bounds = { price_min_cents: null as number | null, price_max_cents: null as number | null, raised_cents: 0 };
      if (data.catalogId) {
        const c = await tx.one<any>(`select id, name, price_min_cents, price_max_cents from gear_catalog where id = $1 and active`, [data.catalogId]);
        if (!c) throw new ActionError('Pick an item from the list.');
        name = c.name;
        bounds = { ...c, raised_cents: 0 };
      }
      if (!name) throw new ActionError('Name the item.');
      const p = priceProblem(data.priceCents, bounds);
      if (p) throw new ActionError(p);
      if (data.athleteId) {
        const a = await tx.one(`select 1 from athletes where id = $1 and team_id = $2 and archived_at is null`, [data.athleteId, teamId]);
        if (!a) throw new ActionError('That athlete was not found.');
      }
      const sort = await tx.one<{ s: number }>(
        `select coalesce(max(sort), 0) + 1 as s from needs where team_id = $1 and season_id = $2 and athlete_id is not distinct from $3`,
        [teamId, team.season, data.athleteId],
      );
      await tx.query(
        `insert into needs (team_id, season_id, athlete_id, kind, catalog_id, name, variant, price_cents, why_note, sort)
         values ($1, $2, $3, $4, $5, $6, nullif($7, ''), $8, nullif($9, ''), $10)`,
        [teamId, team.season, data.athleteId, data.athleteId ? 'athlete' : 'team', data.catalogId, name, cleanUserText(data.variant ?? '', 40), data.priceCents, cleanUserText(data.whyNote ?? '', 140), sort?.s ?? 0],
      );
    });
    await log(teamId, userId, 'need_added', data.athleteId, { name: data.name ?? data.catalogId });
    await broadcastTeam(teamId);
    return { ok: true, message: 'Item added' };
  });
}

export async function moveTeamNeed(teamId: string, needId: string, dir: -1 | 1): Promise<Result> {
  return guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const n = await needWithBounds(tx, teamId, needId);
      const list = await tx.query<{ id: string }>(
        `select id from needs where team_id = $1 and season_id = $2 and athlete_id is not distinct from $3 and kind <> 'team_fund' order by sort, created_at`,
        [teamId, n.season_id, n.athlete_id],
      );
      const i = list.findIndex((x) => x.id === needId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (let k = 0; k < list.length; k++) await tx.query(`update needs set sort = $2 where id = $1`, [list[k].id, k]);
    });
    return { ok: true };
  });
}

// Approvals ------------------------------------------------------------------

/** Publishes the submitted profile exactly as previewed. */
export async function approveProfile(teamId: string, athleteId: string): Promise<Result> {
  let wasLive = false;
  const r = await guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const a = await tx.one<any>(`select status, consent_at from athletes where id = $1 and team_id = $2 and archived_at is null`, [athleteId, teamId]);
      if (!a) throw new ActionError('That athlete was not found.');
      if (!a.consent_at) throw new ActionError('A parent or guardian has to give consent first.');
      if (!['awaiting_coach', 'live', 'changes_requested'].includes(a.status)) throw new ActionError('This profile is not waiting for review.');
      wasLive = a.status === 'live';
      await tx.query(
        `update athletes set status = 'live', hidden_reason = null, review_note = null, pub_bio = bio, pub_photo_path = photo_path,
           pub_preferred_name = preferred_name, published_at = now(), submitted_at = coalesce(submitted_at, now()) where id = $1`,
        [athleteId],
      );
    });
    await log(teamId, userId, 'profile_approved', athleteId);
    return { ok: true };
  });
  if (!r.ok) return r;
  const n = await athleteName(athleteId);
  await notifyAthleteFamily(sys, athleteId, {
    kind: 'approval',
    subject: wasLive ? `${n}'s changes are live` : `${n}'s page is live`,
    body: wasLive ? `The coach approved the latest changes to ${n}'s page.` : `The coach approved ${n}'s page. Share the link so supporters can help.`,
    link: appLink(athleteId, wasLive ? '' : '/share'),
  });
  flushSoon();
  await broadcastTeam(teamId);
  return { ok: true, message: wasLive ? 'Changes published' : 'Approved. The page is live.' };
}

export async function requestProfileChanges(teamId: string, athleteId: string, note: string): Promise<Result> {
  const text = cleanUserText(note, 500);
  if (text.length < 5) return { ok: false, error: 'Say what needs to change. The family sees this note.' };
  const r = await guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const a = await tx.one<any>(`select status from athletes where id = $1 and team_id = $2`, [athleteId, teamId]);
      if (!a) throw new ActionError('That athlete was not found.');
      if (a.status === 'live') {
        // The published page stays up; the pending edits go back to the family.
        await tx.query(`update athletes set review_note = $2, submitted_at = null where id = $1`, [athleteId, text]);
      } else {
        await tx.query(`update athletes set status = 'changes_requested', review_note = $2 where id = $1`, [athleteId, text]);
      }
    });
    await log(teamId, userId, 'changes_requested', athleteId, { note: text });
    return { ok: true };
  });
  if (!r.ok) return r;
  const n = await athleteName(athleteId);
  await notifyAthleteFamily(sys, athleteId, {
    kind: 'approval',
    subject: `Changes requested for ${n}'s page`,
    body: `The coach asked for changes before approving:\n\n${text}`,
    link: appLink(athleteId, '/setup?step=0'),
  });
  flushSoon();
  return { ok: true, message: 'Sent to the family' };
}

export async function approveGearRequest(teamId: string, needId: string, priceCents: number): Promise<Result> {
  let athleteId: string | null = null;
  let item = '';
  const r = await guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const n = await needWithBounds(tx, teamId, needId);
      if (n.request_status !== 'pending') throw new ActionError('This request was already handled.');
      const p = priceProblem(priceCents, n);
      if (p) throw new ActionError(p);
      athleteId = n.athlete_id;
      item = n.name;
      await tx.query(`update needs set request_status = 'approved', price_cents = $2, status = 'open', removed_at = null where id = $1`, [needId, priceCents]);
    });
    await log(teamId, userId, 'gear_request_approved', athleteId, { need: needId, cents: priceCents });
    return { ok: true };
  });
  if (!r.ok) return r;
  if (athleteId) {
    const n = await athleteName(athleteId);
    await notifyAthleteFamily(sys, athleteId, { kind: 'approval', subject: `${item} added to ${n}'s list`, body: `The coach approved the request for ${item}.`, link: appLink(athleteId, '/gear') });
    flushSoon();
  }
  await broadcastTeam(teamId);
  return { ok: true, message: 'Approved and added' };
}

export async function rejectGearRequest(teamId: string, needId: string, note: string): Promise<Result> {
  const text = cleanUserText(note, 300);
  let athleteId: string | null = null;
  let item = '';
  const r = await guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const n = await needWithBounds(tx, teamId, needId);
      if (n.request_status !== 'pending') throw new ActionError('This request was already handled.');
      athleteId = n.athlete_id;
      item = n.name;
      await tx.query(`update needs set request_status = 'rejected', status = 'removed', removed_at = now() where id = $1`, [needId]);
    });
    await log(teamId, userId, 'gear_request_rejected', athleteId, { need: needId, note: text });
    return { ok: true };
  });
  if (!r.ok) return r;
  if (athleteId) {
    await notifyAthleteFamily(sys, athleteId, {
      kind: 'approval',
      subject: `Request for ${item} not added`,
      body: `The coach didn't add ${item} to the list.${text ? `\n\nTheir note: ${text}` : ''}`,
      link: appLink(athleteId, '/gear'),
    });
    flushSoon();
  }
  return { ok: true, message: 'Request declined' };
}

/** Donor messages (bulk approve allowed, ui-ux-spec 8.6). */
export async function reviewMessages(teamId: string, donationIds: string[], approve: boolean): Promise<Result<{ count: number }>> {
  let changed: { id: string; athlete_id: string | null }[] = [];
  const r = await guarded(teamId, async (userId) => {
    const ids = donationIds.filter((i) => uuid.safeParse(i).success).slice(0, 200);
    changed = await asUser(userId, (tx) =>
      tx.query<{ id: string; athlete_id: string | null }>(
        `update donations set message_status = $3 where team_id = $1 and id = any($2::uuid[]) and message_status = 'pending' returning id, athlete_id`,
        [teamId, ids, approve ? 'approved' : 'rejected'],
      ),
    );
    await log(teamId, userId, approve ? 'messages_approved' : 'messages_rejected', null, { count: changed.length });
    return { ok: true };
  });
  if (!r.ok) return r;
  if (approve) {
    const byAthlete = new Map<string, number>();
    for (const c of changed) if (c.athlete_id) byAthlete.set(c.athlete_id, (byAthlete.get(c.athlete_id) ?? 0) + 1);
    for (const [aid, count] of byAthlete) {
      await notifyAthleteFamily(sys, aid, {
        kind: 'message',
        subject: count === 1 ? 'A supporter left you a message' : `${count} supporters left you messages`,
        body: 'Read it on your Supporters page, and say thanks if you like.',
        link: appLink(aid, '/supporters'),
      });
    }
    flushSoon();
  }
  return { ok: true, data: { count: changed.length }, message: `${approve ? 'Approved' : 'Rejected'} ${changed.length}` };
}

export async function approveThankYou(teamId: string, thankYouId: string): Promise<Result> {
  let athleteId = '';
  const r = await guarded(teamId, async (userId) => {
    const t = await asUser(userId, (tx) =>
      tx.one<{ athlete_id: string }>(`update thank_yous set status = 'approved' where id = $1 and team_id = $2 and status = 'pending' returning athlete_id`, [thankYouId, teamId]),
    );
    if (!t) throw new ActionError('This note was already handled.');
    athleteId = t.athlete_id;
    await log(teamId, userId, 'thankyou_approved', athleteId, { thank_you: thankYouId });
    return { ok: true };
  });
  if (!r.ok) return r;
  const sent = await sendThankYou(thankYouId);
  await notifyAthleteFamily(sys, athleteId, {
    kind: 'approval',
    subject: 'Your thank-you note was sent',
    body: `The coach approved your note. It went to ${sent} ${sent === 1 ? 'supporter' : 'supporters'}.`,
    link: appLink(athleteId, '/supporters'),
  });
  flushSoon();
  return { ok: true, message: `Approved and sent to ${sent} ${sent === 1 ? 'supporter' : 'supporters'}` };
}

/** Request changes (note required) or reject (note optional). Either way the family can write a new note. */
export async function returnThankYou(teamId: string, thankYouId: string, note: string, kind: 'changes' | 'reject'): Promise<Result> {
  const text = cleanUserText(note, 300);
  if (kind === 'changes' && text.length < 5) return { ok: false, error: 'Say what to change. The athlete sees this note.' };
  let athleteId = '';
  const r = await guarded(teamId, async (userId) => {
    const t = await asUser(userId, (tx) =>
      tx.one<{ athlete_id: string }>(
        `update thank_yous set status = 'rejected', review_note = nullif($3, '') where id = $1 and team_id = $2 and status = 'pending' returning athlete_id`,
        [thankYouId, teamId, text],
      ),
    );
    if (!t) throw new ActionError('This note was already handled.');
    athleteId = t.athlete_id;
    await log(teamId, userId, kind === 'changes' ? 'thankyou_changes_requested' : 'thankyou_rejected', athleteId, { thank_you: thankYouId, note: text });
    return { ok: true };
  });
  if (!r.ok) return r;
  await notifyAthleteFamily(sys, athleteId, {
    kind: 'approval',
    subject: kind === 'changes' ? 'Edit your thank-you note' : "Your thank-you note wasn't sent",
    body: kind === 'changes' ? `The coach asked for a change before sending:\n\n${text}` : `The coach didn't send your note.${text ? `\n\nTheir note: ${text}` : ''}`,
    link: appLink(athleteId, '/supporters'),
  });
  flushSoon();
  return { ok: true, message: kind === 'changes' ? 'Sent back for changes' : 'Not sent' };
}

// Templates ------------------------------------------------------------------

interface TemplateRow {
  id: string;
  name: string;
  positions: string[];
}

/**
 * Adds a template's items to athletes and, with replace, removes items that
 * aren't in it. Items that have any money are never removed.
 */
async function applyTemplateTx(
  tx: Tx,
  team: { id: string; sport: string; season: string | null; default_template_id: string | null },
  templateId: string | 'auto',
  athleteIds: string[],
  replace: boolean,
  dryRun: boolean,
): Promise<{ add: number; remove: number; athletes: number }> {
  if (!team.season || !athleteIds.length) return { add: 0, remove: 0, athletes: 0 };
  const templates = await tx.query<TemplateRow>(`select id, name, positions from gear_templates where team_id = $1 and sport = $2 order by created_at`, [team.id, team.sport]);
  const items = await tx.query<{ template_id: string; catalog_id: string; size: string | null; price_cents: number; sort: number; name: string }>(
    `select ti.template_id, ti.catalog_id, ti.size, ti.price_cents, ti.sort, c.name from gear_template_items ti join gear_catalog c on c.id = ti.catalog_id
     join gear_templates g on g.id = ti.template_id where g.team_id = $1 order by ti.sort`,
    [team.id],
  );
  const fallback = templates.find((t) => t.id === team.default_template_id) ?? templates.find((t) => t.name === 'Standard kit') ?? templates[0];
  const athletes = await tx.query<{ id: string; position: string | null }>(`select id, position from athletes where team_id = $1 and id = any($2::uuid[]) and archived_at is null`, [team.id, athleteIds]);
  let add = 0;
  let remove = 0;
  for (const a of athletes) {
    const tpl =
      templateId === 'auto' ? (templates.find((t) => a.position && t.positions.includes(a.position)) ?? fallback) : templates.find((t) => t.id === templateId);
    if (!tpl) continue;
    const want = items.filter((i) => i.template_id === tpl.id);
    const have = await tx.query<{ id: string; catalog_id: string | null; raised_cents: number; status: string; request_status: string }>(
      `select id, catalog_id, raised_cents, status, request_status from needs where athlete_id = $1 and season_id = $2`,
      [a.id, team.season],
    );
    const sortBase = await tx.one<{ s: number }>(`select coalesce(max(sort), -1) + 1 as s from needs where athlete_id = $1 and season_id = $2`, [a.id, team.season]);
    let k = sortBase?.s ?? 0;
    for (const w of want) {
      const existing = have.find((h) => h.catalog_id === w.catalog_id);
      if (existing && existing.status !== 'removed') continue;
      add++;
      if (dryRun) continue;
      if (existing && existing.request_status !== 'rejected') {
        await tx.query(`update needs set status = 'open', removed_at = null, request_status = 'approved', price_cents = greatest($2, raised_cents) where id = $1`, [existing.id, w.price_cents]);
      } else {
        await tx.query(
          `insert into needs (team_id, season_id, athlete_id, kind, catalog_id, name, variant, price_cents, sort) values ($1, $2, $3, 'athlete', $4, $5, $6, $7, $8)`,
          [team.id, team.season, a.id, w.catalog_id, w.name, w.size, w.price_cents, k++],
        );
      }
    }
    if (replace) {
      const wanted = new Set(want.map((w) => w.catalog_id));
      const drop = have.filter(
        (h) => h.status !== 'removed' && h.raised_cents === 0 && h.request_status === 'approved' && !['purchased', 'delivered'].includes(h.status) && (!h.catalog_id || !wanted.has(h.catalog_id)),
      );
      remove += drop.length;
      if (!dryRun && drop.length) await tx.query(`update needs set status = 'removed', removed_at = now() where id = any($1::uuid[])`, [drop.map((d) => d.id)]);
    }
  }
  return { add, remove, athletes: athletes.length };
}

export type ApplyTarget = { kind: 'all' } | { kind: 'positions'; positions: string[] } | { kind: 'selected'; ids: string[] };

async function targetIds(tx: Tx, teamId: string, target: ApplyTarget) {
  if (target.kind === 'selected') return rosterIds(tx, teamId, target.ids);
  const rows = await tx.query<{ id: string; position: string | null }>(`select id, position from athletes where team_id = $1 and archived_at is null`, [teamId]);
  if (target.kind === 'all') return rows.map((r) => r.id);
  const set = new Set(target.positions.map((p) => p.toUpperCase()));
  return rows.filter((r) => r.position && set.has(r.position)).map((r) => r.id);
}

/** "Apply to athletes" (ui-ux-spec 8.7). Call with dryRun first to show the preview counts. */
export async function applyTemplate(
  teamId: string,
  templateId: string | 'auto',
  target: ApplyTarget,
  opts: { replace: boolean; dryRun: boolean },
): Promise<Result<{ add: number; remove: number; athletes: number }>> {
  let out = { add: 0, remove: 0, athletes: 0 };
  const r = await guarded(teamId, async (userId) => {
    out = await asUser(userId, async (tx) => {
      const team = await teamRow(tx, teamId);
      if (templateId !== 'auto') {
        const t = await tx.one(`select 1 from gear_templates where id = $1 and team_id = $2`, [templateId, teamId]);
        if (!t) throw new ActionError('That template was not found.');
      }
      return applyTemplateTx(tx, team, templateId, await targetIds(tx, teamId, target), opts.replace, opts.dryRun);
    });
    if (!opts.dryRun) await log(teamId, userId, 'template_applied', null, { template: templateId, ...out });
    return { ok: true };
  });
  if (!r.ok) return r;
  if (!opts.dryRun) await broadcastTeam(teamId);
  return { ok: true, data: out, message: opts.dryRun ? undefined : `Added ${out.add} and removed ${out.remove} items across ${out.athletes} athletes.` };
}

const TemplateSave = z.object({
  name: z.string().trim().min(1, 'Name the template.').max(60),
  positions: z.array(z.string().trim().toUpperCase().max(4)).max(20),
  items: z
    .array(z.object({ catalogId: z.string().uuid(), size: z.string().trim().max(10).nullable(), priceCents: z.number().int() }))
    .min(1, 'Include at least one item.')
    .max(40),
});

export async function saveTemplate(teamId: string, templateId: string | null, input: z.input<typeof TemplateSave>): Promise<Result<{ id: string }>> {
  const parsed = TemplateSave.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const t = parsed.data;
  let id = templateId ?? '';
  return guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const team = await teamRow(tx, teamId);
      const cat = await tx.query<{ id: string; name: string; price_min_cents: number; price_max_cents: number; sizes: string[] }>(
        `select id, name, price_min_cents, price_max_cents, sizes from gear_catalog where sport = $1 and active and id = any($2::uuid[])`,
        [team.sport, t.items.map((i) => i.catalogId)],
      );
      for (const it of t.items) {
        const c = cat.find((x) => x.id === it.catalogId);
        if (!c) throw new ActionError('One of the items is no longer in the catalog.');
        if (it.priceCents < c.price_min_cents || it.priceCents > c.price_max_cents)
          throw new ActionError(`Keep ${c.name} between $${c.price_min_cents / 100} and $${c.price_max_cents / 100}.`);
        if (it.size && c.sizes.length && !c.sizes.includes(it.size)) throw new ActionError(`Pick a listed size for ${c.name}.`);
      }
      if (id) {
        const own = await tx.one(`update gear_templates set name = $3, positions = $4 where id = $1 and team_id = $2 returning id`, [id, teamId, t.name, t.positions]);
        if (!own) throw new ActionError('That template was not found.');
        await tx.query(`delete from gear_template_items where template_id = $1`, [id]);
      } else {
        id = (await tx.one<{ id: string }>(`insert into gear_templates (team_id, sport, name, positions) values ($1, $2, $3, $4) returning id`, [teamId, team.sport, t.name, t.positions]))!.id;
      }
      let k = 0;
      for (const it of t.items) {
        await tx.query(`insert into gear_template_items (template_id, catalog_id, size, price_cents, sort) values ($1, $2, $3, $4, $5)`, [id, it.catalogId, it.size, it.priceCents, k++]);
      }
    });
    await log(teamId, userId, templateId ? 'template_saved' : 'template_created', null, { template: id, name: t.name });
    return { ok: true, data: { id }, message: 'Template saved' };
  });
}

export async function deleteTemplate(teamId: string, templateId: string): Promise<Result> {
  return guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const n = await tx.one<{ n: number }>(`select count(*)::int as n from gear_templates where team_id = $1`, [teamId]);
      if ((n?.n ?? 0) <= 1) throw new ActionError('Keep at least one template.');
      await tx.query(`update teams set default_template_id = null where id = $1 and default_template_id = $2`, [teamId, templateId]);
      const d = await tx.one(`delete from gear_templates where id = $1 and team_id = $2 returning id`, [templateId, teamId]);
      if (!d) throw new ActionError('That template was not found.');
    });
    await log(teamId, userId, 'template_deleted', null, { template: templateId });
    return { ok: true, message: 'Template deleted' };
  });
}

export async function setDefaultTemplate(teamId: string, templateId: string): Promise<Result> {
  return guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const t = await tx.one(`select 1 from gear_templates where id = $1 and team_id = $2`, [templateId, teamId]);
      if (!t) throw new ActionError('That template was not found.');
      await tx.query(`update teams set default_template_id = $2 where id = $1`, [teamId, templateId]);
    });
    return { ok: true, message: 'Default template set' };
  });
}

/** Copies the platform's starter templates onto a team that has none. */
export async function copyStarterTemplates(teamId: string): Promise<Result> {
  return guarded(teamId, async (userId) => {
    await asUser(userId, async (tx) => {
      const team = await teamRow(tx, teamId);
      const have = await tx.one<{ n: number }>(`select count(*)::int as n from gear_templates where team_id = $1`, [teamId]);
      if (have?.n) return;
      const starters = await tx.query<any>(`select id, name, positions from gear_templates where team_id is null and sport = $1 order by created_at`, [team.sport]);
      let first: string | null = null;
      for (const s of starters) {
        const copy = await tx.one<{ id: string }>(`insert into gear_templates (team_id, sport, name, positions) values ($1, $2, $3, $4) returning id`, [teamId, team.sport, s.name, s.positions]);
        first ??= copy!.id;
        if (s.name === 'Standard kit') first = copy!.id;
        await tx.query(
          `insert into gear_template_items (template_id, catalog_id, size, price_cents, sort) select $1, catalog_id, size, price_cents, sort from gear_template_items where template_id = $2`,
          [copy!.id, s.id],
        );
      }
      if (first) await tx.query(`update teams set default_template_id = coalesce(default_template_id, $2) where id = $1`, [teamId, first]);
    });
    await log(teamId, userId, 'templates_copied');
    return { ok: true, message: 'Starter templates added' };
  });
}

/** Reminds every family that hasn't accepted yet (Overview action list). */
export async function remindPendingInvites(teamId: string): Promise<Result<{ sent: number; noEmail: number }>> {
  let ids: string[] = [];
  const r = await guarded(teamId, async (userId) => {
    ids = (
      await asUser(userId, (tx) =>
        tx.query<{ id: string }>(`select id from athletes where team_id = $1 and archived_at is null and invite_status <> 'accepted' and status = 'needs_consent'`, [teamId]),
      )
    ).map((x) => x.id);
    return { ok: true };
  });
  if (!r.ok) return r;
  return inviteAthletes(teamId, ids);
}
