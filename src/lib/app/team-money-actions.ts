'use server';
import { revalidatePath } from 'next/cache';
import { asUser, sys, dbErrorMessage } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { notify, notifyAthleteFamily, flushSoon } from '@/lib/notify';
import { purchasedEmail, deliveredEmail, fundsMovedEmail } from '@/lib/notify/templates';
import { cleanUserText } from '@/lib/domain/text';
import { athleteDisplayName } from '@/lib/domain/names';
import { money, parseDollarsToCents } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { broadcastTeam } from '@/lib/realtime';
import { teamFund } from '@/lib/app/team-money';

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string; field?: string };

const UUID = /^[0-9a-f-]{36}$/;

/** The signed-in person, when they are coach or staff on the team (or a platform admin). */
async function editor(teamId: string) {
  const user = await requireUser(`/app/manager/${teamId}`);
  if (!UUID.test(teamId)) return null;
  const r = await asUser(user.id, (tx) => tx.one<{ edit: boolean }>(`select can_edit_team($1) as edit`, [teamId]));
  return r?.edit ? user : null;
}

const NO_ACCESS: Result = { ok: false, error: "You don't have access to do that." };

/** Donors (by email) of a set of needs, with the items they funded. */
async function donorsOf(needIds: string[]) {
  const rows = await sys.query<any>(
    `select distinct lower(d.donor_email) as email, d.donor_user_id, n.id as need_id, n.name, n.kind,
       a.first_name, a.last_name, a.preferred_name, a.show_full_last_name
     from allocations al join donations d on d.id = al.donation_id join needs n on n.id = al.need_id
     left join athletes a on a.id = n.athlete_id
     where al.need_id = any($1::uuid[]) and al.reversed_at is null and d.status = 'succeeded'`,
    [needIds],
  );
  const byEmail = new Map<string, { userId: string | null; items: Set<string> }>();
  for (const r of rows) {
    const label = r.first_name ? `${r.name} for ${athleteDisplayName(r)}` : r.name;
    const e = byEmail.get(r.email) ?? { userId: r.donor_user_id, items: new Set<string>() };
    e.items.add(label);
    byEmail.set(r.email, e);
  }
  return byEmail;
}

async function teamName(teamId: string) {
  return (await sys.one<{ name: string }>(`select name from teams where id = $1`, [teamId]))?.name ?? 'the team';
}

function done(teamId: string, ...paths: string[]) {
  for (const p of paths) revalidatePath(`/app/manager/${teamId}/${p}`);
  revalidatePath(`/app/manager/${teamId}`, 'layout');
}

// Refunds ---------------------------------------------------------------------

/** Managers can't refund in v1; they ask an admin with a reason (ui-ux-spec 8.8). */
export async function requestRefund(teamId: string, donationId: string, reason: string): Promise<Result> {
  const user = await editor(teamId);
  if (!user) return NO_ACCESS;
  const why = cleanUserText(reason ?? '', 500);
  if (why.length < 5) return { ok: false, error: 'Add a short reason so the admin knows what happened.', field: 'reason' };
  let donor = '';
  let amount = 0;
  try {
    const r = await asUser(user.id, async (tx): Promise<Result> => {
      const d = await tx.one<{ status: string; donor_name: string; total_cents: number }>(
        `select status, donor_name, total_cents from donations where id = $1 and team_id = $2`,
        [donationId, teamId],
      );
      if (!d) return { ok: false, error: 'That donation is gone.' };
      if (d.status !== 'succeeded') return { ok: false, error: 'Only completed gifts can be refunded.' };
      const open = await tx.one(`select 1 from refund_requests where donation_id = $1 and status = 'open'`, [donationId]);
      if (open) return { ok: false, error: 'A refund request is already open for this gift.' };
      await tx.query(`insert into refund_requests (donation_id, team_id, requested_by, reason) values ($1, $2, $3, $4)`, [donationId, teamId, user.id, why]);
      donor = d.donor_name;
      amount = d.total_cents;
      return { ok: true, message: 'Refund request sent to Gridiron Give.' };
    });
    if (!r.ok) return r;
    const name = await teamName(teamId);
    const admins = await sys.query<{ id: string }>(`select id from profiles where is_admin`);
    for (const a of admins) {
      await notify(sys, {
        userId: a.id,
        kind: 'refund_request',
        subject: `Refund requested: ${money(amount)} from ${donor} to ${name}`,
        body: `${user.fullName ?? user.email} asked for a refund of ${donor}'s gift of ${money(amount)} to ${name}.\n\nReason: ${why}`,
        link: `${env.appUrl}/admin`,
      });
    }
    await sys.query(`insert into activity_log (team_id, actor_id, action, detail) values ($1, $2, 'refund_requested', $3)`, [
      teamId, user.id, JSON.stringify({ donation_id: donationId }),
    ]);
    flushSoon();
    revalidatePath(`/app/manager/${teamId}/donations/${donationId}`);
    return r;
  } catch (err) {
    console.error('refund request failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

// Purchases -------------------------------------------------------------------

export interface PurchaseInput {
  vendor: string;
  orderDate: string;
  total: string;
  receiptKey: string;
  note?: string;
  lines: { needId: string; amount: string }[];
}

/**
 * Logs a purchase with its receipt (ui-ux-spec 8.9). Covered needs move to
 * Purchased; a line on the team fund spends from the fund without changing
 * its status. Donors of the covered needs get the "purchased" email.
 */
export async function recordPurchase(teamId: string, input: PurchaseInput): Promise<Result> {
  const user = await editor(teamId);
  if (!user) return NO_ACCESS;
  const vendor = cleanUserText(input.vendor ?? '', 80);
  if (!vendor) return { ok: false, error: 'Enter the vendor name.', field: 'vendor' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.orderDate ?? '') || Number.isNaN(Date.parse(input.orderDate))) return { ok: false, error: 'Enter the order date.', field: 'order-date' };
  if (new Date(input.orderDate).getTime() > Date.now() + 86_400_000) return { ok: false, error: "The order date can't be in the future.", field: 'order-date' };
  const total = parseDollarsToCents(input.total ?? '');
  if (!total || total <= 0) return { ok: false, error: 'Enter the total you paid, like 289.99.', field: 'total' };
  if (!input.receiptKey || !input.receiptKey.startsWith(`${teamId}/receipt/`) || input.receiptKey.includes('..')) return { ok: false, error: 'Upload the receipt (a photo or PDF).', field: 'receipt' };
  const lines = (input.lines ?? []).filter((l) => UUID.test(l.needId)).map((l) => ({ needId: l.needId, cents: parseDollarsToCents(l.amount ?? '') }));
  if (!lines.length) return { ok: false, error: 'Pick at least one item this purchase covers.' };
  if (lines.some((l) => l.cents === null || l.cents < 0)) return { ok: false, error: 'Check the amounts for each item.' };
  if (new Set(lines.map((l) => l.needId)).size !== lines.length) return { ok: false, error: 'An item is listed twice.' };

  let purchaseId = '';
  let covered: string[] = [];
  try {
    const r = await asUser(user.id, async (tx): Promise<Result> => {
      const t = await tx.one<{ current_season_id: string | null }>(`select current_season_id from teams where id = $1`, [teamId]);
      if (!t?.current_season_id) return { ok: false, error: "The team's season isn't set up." };
      const needs = await tx.query<{ id: string; kind: string; status: string; raised_cents: number; name: string }>(
        `select id, kind, status, raised_cents, name from needs where team_id = $1 and id = any($2::uuid[])`,
        [teamId, lines.map((l) => l.needId)],
      );
      if (needs.length !== lines.length) return { ok: false, error: 'One of the items is no longer on this team.' };
      const fund = await teamFund(tx, teamId, t.current_season_id);
      for (const l of lines) {
        const n = needs.find((x) => x.id === l.needId)!;
        if (n.kind === 'team_fund') {
          if (!fund || n.id !== fund.id) return { ok: false, error: "Use this season's team fund." };
          if ((l.cents ?? 0) <= 0) return { ok: false, error: 'Enter how much of the team fund this purchase used.' };
          if ((l.cents ?? 0) > fund.availableCents) return { ok: false, error: `The team fund has ${money(fund.availableCents)} left.` };
        } else if (!['funded', 'partially_funded'].includes(n.status)) {
          return { ok: false, error: `${n.name} was already purchased or removed.` };
        }
      }
      const p = await tx.one<{ id: string }>(
        `insert into purchases (team_id, season_id, vendor, order_date, total_cents, receipt_path, note, created_by)
         values ($1, $2, $3, $4, $5, $6, nullif($7, ''), $8) returning id`,
        [teamId, t.current_season_id, vendor, input.orderDate, total, input.receiptKey, cleanUserText(input.note ?? '', 500), user.id],
      );
      for (const l of lines) {
        await tx.query(`insert into purchase_needs (purchase_id, need_id, amount_cents) values ($1, $2, $3)`, [p!.id, l.needId, l.cents]);
      }
      const athleteNeeds = needs.filter((n) => n.kind !== 'team_fund').map((n) => n.id);
      if (athleteNeeds.length) {
        await tx.query(`update needs set status = 'purchased', purchase_id = $2, purchased_at = now() where id = any($1::uuid[])`, [athleteNeeds, p!.id]);
      }
      purchaseId = p!.id;
      covered = athleteNeeds;
      return { ok: true, id: p!.id, message: `Purchase saved. ${athleteNeeds.length} ${athleteNeeds.length === 1 ? 'item' : 'items'} marked purchased.` };
    });
    if (!r.ok) return r;

    await sys.query(`insert into activity_log (team_id, actor_id, action, detail) values ($1, $2, 'purchase_logged', $3)`, [
      teamId, user.id, JSON.stringify({ purchase_id: purchaseId, vendor, total_cents: total, needs: covered.length }),
    ]);
    await sys.query(`insert into analytics_events (name, props) values ('purchase_logged', $1)`, [JSON.stringify({ team_id: teamId, needs: covered.length })]);
    if (covered.length) {
      const team = await teamName(teamId);
      for (const [email, d] of await donorsOf(covered)) {
        const tpl = purchasedEmail({ items: [...d.items], team, vendor });
        await notify(sys, { email, userId: d.userId, kind: 'purchased', subject: tpl.subject, body: tpl.body, inApp: Boolean(d.userId) });
      }
      // Families see it on the player page; a short in-app note too.
      const fam = await sys.query<{ athlete_id: string; names: string }>(
        `select athlete_id, string_agg(name, ', ') as names from needs where id = any($1::uuid[]) and athlete_id is not null group by athlete_id`,
        [covered],
      );
      for (const f of fam) {
        await notifyAthleteFamily(sys, f.athlete_id, {
          kind: 'gear_purchased',
          subject: 'Your gear was ordered',
          body: `The coach bought: ${f.names}.`,
          link: `${env.appUrl}/app/athlete/${f.athlete_id}/gear`,
          sendEmail: false,
        });
      }
      flushSoon();
    }
    await broadcastTeam(teamId).catch(() => {});
    done(teamId, 'purchases');
    return r;
  } catch (err) {
    console.error('record purchase failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

/**
 * Marks purchased gear as handed out (ui-ux-spec 8.9). A delivery photo can
 * only be attached when every athlete on it has guardian consent.
 */
export async function markDelivered(teamId: string, needIds: string[], photoKey?: string | null): Promise<Result> {
  const user = await editor(teamId);
  if (!user) return NO_ACCESS;
  const ids = (needIds ?? []).filter((x) => UUID.test(x)).slice(0, 200);
  if (!ids.length) return { ok: false, error: 'Pick at least one item.' };
  const photo = photoKey || null;
  if (photo && (!photo.startsWith(`${teamId}/delivery/`) || photo.includes('..'))) return { ok: false, error: 'Upload the photo again.' };
  try {
    const r = await asUser(user.id, async (tx): Promise<Result> => {
      const rows = await tx.query<{ id: string; status: string; athlete_id: string | null; consent_at: Date | null; status_a: string | null }>(
        `select n.id, n.status, n.athlete_id, a.consent_at, a.status as status_a from needs n left join athletes a on a.id = n.athlete_id
         where n.team_id = $1 and n.id = any($2::uuid[])`,
        [teamId, ids],
      );
      if (rows.length !== ids.length) return { ok: false, error: 'One of the items is no longer on this team.' };
      if (rows.some((n) => n.status !== 'purchased')) return { ok: false, error: 'Only purchased items can be marked delivered.' };
      if (photo && rows.some((n) => n.athlete_id && !n.consent_at)) {
        return { ok: false, error: "A photo needs guardian consent for every player in it. Remove the photo or the player who doesn't have consent." };
      }
      await tx.query(
        `update needs set status = 'delivered', delivered_at = now(), delivery_photo_path = coalesce($2, delivery_photo_path) where id = any($1::uuid[])`,
        [ids, photo],
      );
      return { ok: true, message: `${ids.length} ${ids.length === 1 ? 'item' : 'items'} marked delivered.` };
    });
    if (!r.ok) return r;
    await sys.query(`insert into activity_log (team_id, actor_id, action, detail) values ($1, $2, 'delivery_marked', $3)`, [
      teamId, user.id, JSON.stringify({ needs: ids.length, photo: Boolean(photo) }),
    ]);
    await sys.query(`insert into analytics_events (name, props) values ('delivery_marked', $1)`, [JSON.stringify({ team_id: teamId, needs: ids.length })]);
    const team = await teamName(teamId);
    for (const [email, d] of await donorsOf(ids)) {
      const tpl = deliveredEmail({ items: [...d.items], team });
      await notify(sys, { email, userId: d.userId, kind: 'delivered', subject: tpl.subject, body: tpl.body, inApp: Boolean(d.userId) });
    }
    flushSoon();
    await broadcastTeam(teamId).catch(() => {});
    done(teamId, 'purchases');
    return r;
  } catch (err) {
    console.error('mark delivered failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
}

// Moving funds ----------------------------------------------------------------

/**
 * Moves money between needs through fund_transfers (its trigger keeps the
 * totals). Used for removed or overfunded items, which go to the team fund,
 * and for topping up an open item from the team fund. fund_transfers has no
 * write policy for signed-in users, so this checks staff access first and then
 * writes as the system.
 */
export async function moveFunds(teamId: string, input: { fromNeedId: string; toNeedId: string; amount: string; reason: string }): Promise<Result> {
  const user = await editor(teamId);
  if (!user) return NO_ACCESS;
  const reason = cleanUserText(input.reason ?? '', 300);
  if (reason.length < 5) return { ok: false, error: 'Add a short reason. Donors see it in the email.', field: 'reason' };
  const cents = parseDollarsToCents(input.amount ?? '');
  if (!cents || cents <= 0) return { ok: false, error: 'Enter the amount to move.', field: 'amount' };
  if (!UUID.test(input.fromNeedId) || !UUID.test(input.toNeedId) || input.fromNeedId === input.toNeedId) return { ok: false, error: 'Pick where the money goes.', field: 'to' };

  const needs = await sys.query<any>(
    `select n.id, n.kind, n.status, n.name, n.price_cents, n.raised_cents, n.athlete_id, n.season_id, n.team_id,
       coalesce((select sum(pn.amount_cents) from purchase_needs pn where pn.need_id = n.id), 0)::int as spent,
       a.first_name, a.last_name, a.preferred_name, a.show_full_last_name
     from needs n left join athletes a on a.id = n.athlete_id where n.id = any($1::uuid[]) and n.team_id = $2`,
    [[input.fromNeedId, input.toNeedId], teamId],
  );
  const from = needs.find((n) => n.id === input.fromNeedId);
  const to = needs.find((n) => n.id === input.toNeedId);
  if (!from || !to) return { ok: false, error: 'One of the items is no longer on this team.' };
  if (from.kind !== 'team_fund' && to.kind !== 'team_fund') return { ok: false, error: 'Money moves into the team fund, or out of it into an item.' };
  if (['purchased', 'delivered'].includes(from.status)) return { ok: false, error: 'That item was already bought with this money.' };
  const available = from.kind === 'team_fund' ? from.raised_cents - from.spent : from.raised_cents;
  if (cents > available) return { ok: false, error: `Only ${money(Math.max(available, 0))} is available to move.`, field: 'amount' };
  if (to.kind !== 'team_fund') {
    if (['purchased', 'delivered', 'removed'].includes(to.status)) return { ok: false, error: `${to.name} can't take more money.` };
    const left = Math.max((to.price_cents ?? 0) - to.raised_cents, 0);
    if (cents > left) return { ok: false, error: `${to.name} only needs ${money(left)}.`, field: 'amount' };
  }

  try {
    await sys.tx(async (tx) => {
      await tx.query(`insert into fund_transfers (team_id, from_need_id, to_need_id, amount_cents, reason, actor_id) values ($1, $2, $3, $4, $5, $6)`, [
        teamId, from.id, to.id, cents, reason, user.id,
      ]);
      await tx.query(`insert into activity_log (team_id, athlete_id, actor_id, action, detail) values ($1, $2, $3, 'funds_moved', $4)`, [
        teamId, from.athlete_id ?? to.athlete_id, user.id, JSON.stringify({ from: from.name, to: to.name, amount_cents: cents, reason }),
      ]);
    });
  } catch (err) {
    console.error('move funds failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }

  const team = await teamName(teamId);
  if (from.kind !== 'team_fund') {
    const athlete = from.athlete_id ? athleteDisplayName(from) : team;
    const tpl = fundsMovedEmail({ athlete, item: from.name, team, amountCents: cents, reason: reason.endsWith('.') ? reason : `${reason}.` });
    for (const [email, d] of await donorsOf([from.id])) {
      await notify(sys, { email, userId: d.userId, kind: 'funds_moved', subject: tpl.subject, body: tpl.body, inApp: Boolean(d.userId) });
    }
    if (from.athlete_id) await notifyAthleteFamily(sys, from.athlete_id, { kind: 'funds_moved', subject: tpl.subject, body: tpl.body, link: `${env.appUrl}/app/athlete/${from.athlete_id}/gear` });
  } else if (to.athlete_id) {
    await notifyAthleteFamily(sys, to.athlete_id, {
      kind: 'funds_moved',
      subject: `The team fund covered ${money(cents)} of your ${to.name}`,
      body: `The coach moved ${money(cents)} from the ${team} team fund to your ${to.name}.`,
      link: `${env.appUrl}/app/athlete/${to.athlete_id}/gear`,
    });
  }
  flushSoon();
  await broadcastTeam(teamId).catch(() => {});
  done(teamId, 'purchases', 'donations');
  return { ok: true, message: `Moved ${money(cents)} to ${to.kind === 'team_fund' ? 'the team fund' : to.name}.` };
}
