import 'server-only';
import { sys, type Tx } from '@/lib/db';
import { allocateGift, type NeedState } from '@/lib/domain/allocation';
import { notify, notifyAthleteFamily, notifyTeamStaff, flushSoon } from '@/lib/notify';
import { itemFundedEmail, newGiftEmail, overflowEmail, receiptEmail } from '@/lib/notify/templates';
import { athleteDisplayName } from '@/lib/domain/names';
import { money } from '@/lib/domain/money';
import { needsHumanReview } from '@/lib/domain/text';
import { receiptSig } from '@/lib/crypto';
import { env } from '@/lib/env';
import { broadcastTeam } from '@/lib/realtime';
import { SITE } from '@/config/site';

/**
 * The only place need totals go up. Called from the Stripe webhook
 * (payment_intent.succeeded) or the simulated checkout in demo mode.
 * Idempotent: a second call for the same donation does nothing.
 */
export async function markDonationSucceeded(p: {
  donationId: string;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  /** Skip donor and team emails (used when re-applying a dispute that was won). */
  silent?: boolean;
}): Promise<{ applied: boolean }> {
  const result = await sys.tx(async (tx) => {
    const d = await tx.one<any>(`select * from donations where id = $1 for update`, [p.donationId]);
    if (!d || d.status !== 'pending') return { applied: false, teamId: d?.team_id as string | undefined };

    const needs = await tx.query<any>(
      `select id, athlete_id, kind, price_cents, raised_cents, status, sort from needs
       where team_id = $1 and season_id = $2 for update`,
      [d.team_id, d.season_id],
    );
    const lines = await tx.query<any>(`select need_id, athlete_id, requested_cents from donation_lines where donation_id = $1 order by id`, [d.id]);
    const before = new Map<string, any>(needs.map((n) => [n.id, n]));
    const state: NeedState[] = needs.map((n) => ({
      id: n.id, athleteId: n.athlete_id, kind: n.kind, priceCents: n.price_cents, raisedCents: n.raised_cents, status: n.status, sort: n.sort,
    }));
    const { allocations, overflowCents } = allocateGift(
      lines.map((l) => ({ needId: l.need_id, athleteId: l.athlete_id, requestedCents: l.requested_cents })),
      state,
      d.net_cents,
    );
    for (const a of allocations) {
      await tx.query(`insert into allocations (donation_id, need_id, amount_cents, overflow) values ($1, $2, $3, $4)`, [d.id, a.needId, a.amountCents, a.overflow]);
    }
    const team = await tx.one<any>(`select id, name, require_message_approval from teams where id = $1`, [d.team_id]);
    let messageStatus = 'none';
    if (d.message) messageStatus = team.require_message_approval || needsHumanReview(d.message) ? 'pending' : 'approved';
    await tx.query(
      `update donations set status = 'succeeded', succeeded_at = now(), payment_intent_id = coalesce($2, payment_intent_id),
         charge_id = coalesce($3, charge_id), card_brand = coalesce($4, card_brand), card_last4 = coalesce($5, card_last4), message_status = $6 where id = $1`,
      [d.id, p.paymentIntentId ?? null, p.chargeId ?? null, p.cardBrand ?? null, p.cardLast4 ?? null, messageStatus],
    );
    if (!p.silent) await notifyForGift(tx, d, team, allocations, before, overflowCents);
    return { applied: true, teamId: d.team_id as string };
  });
  if (result.teamId) await broadcastTeam(result.teamId);
  flushSoon();
  return { applied: result.applied };
}

async function notifyForGift(tx: Tx, d: any, team: any, allocations: { needId: string; amountCents: number; overflow: boolean }[], before: Map<string, any>, overflowCents: number) {
  const ids = allocations.map((a) => a.needId);
  const needs = await tx.query<any>(
    `select n.id, n.name, n.kind, n.status, n.athlete_id, a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name
     from needs n left join athletes a on a.id = n.athlete_id where n.id = any($1::uuid[])`,
    [ids],
  );
  const byId = new Map(needs.map((n) => [n.id, n]));
  const lines = allocations.map((a) => {
    const n = byId.get(a.needId);
    const who = n?.athlete_id ? ` for ${athleteDisplayName(n, n.pub_preferred_name)}` : '';
    return `${money(a.amountCents)} toward ${n?.kind === 'team_fund' ? 'the team fund' : `${n?.name}${who}`}`;
  });
  const org = await tx.one<any>(`select o.name, o.ein, o.tax_exempt from organizations o join teams t on t.org_id = o.id where t.id = $1`, [team.id]);
  const taxNote = SITE.taxDeductibleReceipts && org?.tax_exempt && org?.ein
    ? `${org.name} (EIN ${org.ein}) is a tax-exempt organization. No goods or services were provided in exchange for this gift.`
    : 'This gift is not tax deductible. No goods or services were provided in exchange for it.';
  const receipt = receiptEmail({
    donor: d.donor_name,
    lines,
    giftCents: d.gift_cents,
    feesCents: d.cover_fees ? d.total_cents - d.gift_cents : 0,
    totalCents: d.total_cents,
    team: team.name,
    last4: d.card_last4,
    taxNote,
  });
  await notify(tx, {
    email: d.donor_email,
    userId: d.donor_user_id,
    kind: 'receipt',
    subject: receipt.subject,
    body: receipt.body,
    link: `${env.appUrl}/receipt/${d.id}?sig=${receiptSig(d.id)}`,
    inApp: false,
  });

  if (overflowCents > 0 && !d.send_extra_to_fund) {
    const e = overflowEmail({ amountCents: overflowCents, team: team.name });
    await notify(tx, { email: d.donor_email, kind: 'overflow', subject: e.subject, body: e.body, inApp: false });
  }

  const donorLabel = d.show_name ? d.donor_name : 'A supporter';
  const teamAmount = allocations.reduce((s, a) => s + a.amountCents, 0);
  const firstNeed = byId.get(allocations[0]?.needId);
  const gift = newGiftEmail({
    athlete: firstNeed?.athlete_id ? athleteDisplayName(firstNeed, firstNeed.pub_preferred_name) : null,
    item: allocations.length > 1 ? `${allocations.length} items` : firstNeed?.kind === 'team_fund' ? 'the team fund' : firstNeed?.name ?? 'gear',
    donor: donorLabel,
    amountCents: teamAmount,
    message: null,
  });
  await notifyTeamStaff(tx, team.id, { kind: 'new_gift', subject: gift.subject, body: gift.body, link: `${env.appUrl}/app/manager/${team.id}/donations` });

  // Athletes and guardians: amounts only if the team allows it.
  const showAmounts = (await tx.one<any>(`select show_amounts_to_athletes from teams where id = $1`, [team.id]))?.show_amounts_to_athletes;
  const athleteIds = [...new Set(needs.filter((n) => n.athlete_id).map((n) => n.athlete_id as string))];
  for (const aid of athleteIds) {
    const mine = allocations.filter((a) => byId.get(a.needId)?.athlete_id === aid);
    const first = byId.get(mine[0].needId);
    const g = newGiftEmail({
      athlete: null,
      item: mine.length > 1 ? `${mine.length} of your items` : `your ${first.name}`,
      donor: donorLabel,
      amountCents: showAmounts ? mine.reduce((s, a) => s + a.amountCents, 0) : null,
      message: null,
    });
    await notifyAthleteFamily(tx, aid, { kind: 'new_gift', subject: g.subject, body: g.body, link: `${env.appUrl}/app/athlete/${aid}` });
  }

  // Newly funded items: tell the athlete and everyone who gave to it.
  for (const n of needs) {
    const was = before.get(n.id)?.status;
    if (n.kind === 'athlete' && n.status === 'funded' && was !== 'funded') {
      const name = athleteDisplayName(n, n.pub_preferred_name);
      const e = itemFundedEmail({ athlete: name, item: n.name });
      await notifyAthleteFamily(tx, n.athlete_id, { kind: 'item_funded', subject: e.subject, body: e.body, link: `${env.appUrl}/app/athlete/${n.athlete_id}` });
      const donors = await tx.query<{ donor_email: string; donor_user_id: string | null }>(
        `select distinct d.donor_email, d.donor_user_id from donations d join allocations al on al.donation_id = d.id
         where al.need_id = $1 and al.reversed_at is null and d.status = 'succeeded'`,
        [n.id],
      );
      for (const dn of donors) await notify(tx, { email: dn.donor_email, userId: dn.donor_user_id, kind: 'item_funded', subject: e.subject, body: e.body, inApp: false });
    }
  }
  if (d.message && d.message_status !== 'approved') {
    await notifyTeamStaff(tx, team.id, {
      kind: 'approval_needed',
      subject: 'A donor message is waiting for approval',
      body: `${donorLabel} left a message for an athlete. Review it before the athlete sees it.`,
      link: `${env.appUrl}/app/manager/${team.id}/approvals?tab=messages`,
    });
  }
}

/** Marks a payment as failed so the donor can try again; nothing was allocated. */
export async function markDonationFailed(donationId: string, reason: string) {
  await sys.query(`update donations set status = 'failed', failure_reason = $2 where id = $1 and status = 'pending'`, [donationId, reason]);
}

/**
 * Refunds and disputes reverse the allocations and reopen the needs
 * (rebuild-architecture, Money rules). Admin only.
 */
export async function reverseDonation(donationId: string, status: 'refunded' | 'disputed', note?: string) {
  const teamId = await sys.tx(async (tx) => {
    const d = await tx.one<any>(`select * from donations where id = $1 for update`, [donationId]);
    if (!d || (d.status !== 'succeeded' && !(status === 'refunded' && d.status === 'disputed'))) return null;
    await tx.query(`update allocations set reversed_at = now() where donation_id = $1 and reversed_at is null`, [donationId]);
    await tx.query(`update donations set status = $2::text::donation_status, refunded_at = case when $2::text = 'refunded' then now() else refunded_at end where id = $1`, [donationId, status]);
    await tx.query(`update refund_requests set status = 'refunded', resolved_at = now(), resolution_note = coalesce($2, resolution_note) where donation_id = $1 and status = 'open'`, [donationId, note ?? null]);
    if (status === 'refunded') {
      await notify(tx, {
        email: d.donor_email,
        kind: 'refund',
        subject: `Refund: ${money(d.total_cents)}`,
        body: `Your gift of ${money(d.total_cents)} was refunded. It can take 5 to 10 business days to appear on your statement.`,
        inApp: false,
      });
    }
    await notifyTeamStaff(tx, d.team_id, {
      kind: 'refund',
      subject: status === 'refunded' ? `A ${money(d.gift_cents)} gift was refunded` : `A ${money(d.gift_cents)} gift is disputed`,
      body: status === 'refunded'
        ? `A gift from ${d.donor_name} was refunded and the items it funded were reopened.`
        : `${d.donor_name}'s bank opened a dispute. The items it funded were reopened until it's resolved.`,
      link: `${env.appUrl}/app/manager/${d.team_id}/donations`,
    });
    return d.team_id as string;
  });
  if (teamId) await broadcastTeam(teamId);
  flushSoon();
  return Boolean(teamId);
}

/** A dispute closed in our favor: the money stays, so re-apply it. */
export async function reinstateDisputedDonation(donationId: string) {
  const teamId = await sys.tx(async (tx) => {
    const d = await tx.one<any>(`select * from donations where id = $1 for update`, [donationId]);
    if (!d || d.status !== 'disputed') return null;
    await tx.query(`update donations set status = 'pending' where id = $1`, [donationId]);
    return d.team_id as string;
  });
  if (!teamId) return false;
  // Allocates again against the needs as they are now.
  await markDonationSucceeded({ donationId, silent: true });
  return true;
}
