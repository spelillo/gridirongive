import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { freshDb } from '../support/db';
import { demoIds } from '../support/fixtures';
import type { Driver } from '@/lib/db';
import { mode } from '@/lib/env';
import { createGift, GiftRequest } from '@/lib/payments/checkout';
import { markDonationSucceeded, markDonationFailed, reverseDonation, reinstateDisputedDonation } from '@/lib/payments/process';
import { handleStripeEvent } from '@/lib/payments/webhook';
import { quoteGift } from '@/lib/domain/money';

let db: Driver;
let ids: Awaited<ReturnType<typeof demoIds>>;

beforeAll(async () => {
  db = await freshDb();
  ids = await demoIds(db);
});

const gift = (o: Partial<GiftRequest>) =>
  GiftRequest.parse({
    teamId: ids.team,
    target: 'need',
    amountCents: 5_000,
    coverFees: true,
    donorName: 'Test Donor',
    donorEmail: 'Test.Donor@example.com',
    showName: true,
    idempotencyKey: `test-${randomUUID()}`,
    ...o,
  });

const need = async (id: string) => (await db.query<any>(`select raised_cents, status from needs where id = $1`, [id]))[0];
const donation = async (id: string) => (await db.query<any>(`select * from donations where id = $1`, [id]))[0];
const allocations = async (donationId: string) =>
  db.query<any>(`select need_id, amount_cents, overflow, reversed_at from allocations where donation_id = $1 order by amount_cents desc`, [donationId]);

async function giveAndSucceed(o: Partial<GiftRequest>) {
  const r = await createGift(gift(o), null);
  if (!r.ok) throw new Error(r.error);
  await markDonationSucceeded({ donationId: r.donationId, paymentIntentId: `pi_test_${r.donationId.slice(0, 8)}`, cardBrand: 'visa', cardLast4: '4242' });
  return r.donationId;
}

/** A newly created need for Jayden so tests don't depend on each other's totals. */
async function freshNeed(name: string, price: number) {
  const [n] = await db.query<{ id: string }>(
    `insert into needs (team_id, season_id, athlete_id, kind, name, price_cents, sort) values ($1, $2, $3, 'athlete', $4, $5, 50) returning id`,
    [ids.team, ids.season, ids.jayden, name, price],
  );
  return n.id;
}

it('runs with simulated payments in demo mode', () => {
  expect(mode.demo).toBe(true);
  expect(mode.payments).toBe('simulated');
});

describe('createGift + markDonationSucceeded', () => {
  it('a gift to one need allocates to it and updates raised and status', async () => {
    const helmet = await ids.jaydenNeed('Helmet');
    expect(await need(helmet)).toEqual({ raised_cents: 14_000, status: 'partially_funded' });
    const r = await createGift(gift({ needIds: [helmet], amountCents: 5_000 }), null);
    expect(r).toMatchObject({ ok: true, simulated: true, clientSecret: null });
    if (!r.ok) return;
    expect(r.quote).toEqual(quoteGift(5_000, true));
    const d = await donation(r.donationId);
    expect(d).toMatchObject({ status: 'pending', gift_cents: 5_000, net_cents: 5_000, total_cents: r.quote.totalCents, athlete_id: ids.jayden, donor_email: 'test.donor@example.com' });
    // Nothing moves until the payment succeeds.
    expect((await need(helmet)).raised_cents).toBe(14_000);

    expect(await markDonationSucceeded({ donationId: r.donationId, paymentIntentId: 'pi_one', cardLast4: '4242' })).toEqual({ applied: true });
    expect(await need(helmet)).toEqual({ raised_cents: 19_000, status: 'partially_funded' });
    expect(await allocations(r.donationId)).toEqual([{ need_id: helmet, amount_cents: 5_000, overflow: false, reversed_at: null }]);
    expect(await donation(r.donationId)).toMatchObject({ status: 'succeeded', payment_intent_id: 'pi_one', card_last4: '4242' });

    // A second success for the same donation does nothing.
    expect(await markDonationSucceeded({ donationId: r.donationId })).toEqual({ applied: false });
    expect((await need(helmet)).raised_cents).toBe(19_000);
    expect(await allocations(r.donationId)).toHaveLength(1);
  });

  it('queues a receipt for the donor and a new gift notice for staff', async () => {
    const id = await giveAndSucceed({ target: 'team_fund', amountCents: 1_000, donorEmail: 'receipt.check@example.com' });
    const receipts = await db.query<any>(`select kind from notifications where email = 'receipt.check@example.com'`);
    expect(receipts.map((r) => r.kind)).toContain('receipt');
    const staff = await db.query<any>(`select user_id from notifications where kind = 'new_gift' and created_at >= (select created_at from donations where id = $1)`, [id]);
    expect(staff.map((s) => s.user_id)).toEqual(expect.arrayContaining([ids.coach, ids.staff]));
  });

  it('funding a need to its price marks it funded', async () => {
    const n = await freshNeed('Wristband', 1_200);
    await giveAndSucceed({ needIds: [n], amountCents: 1_200 });
    expect(await need(n)).toEqual({ raised_cents: 1_200, status: 'funded' });
  });

  it('without covering fees only the net amount is allocated', async () => {
    const n = await freshNeed('Practice shorts', 20_000);
    const id = await giveAndSucceed({ needIds: [n], amountCents: 10_000, coverFees: false });
    const q = quoteGift(10_000, false);
    expect(q.netCents).toBe(9_480);
    expect(await need(n)).toMatchObject({ raised_cents: 9_480 });
    expect(await donation(id)).toMatchObject({ total_cents: 10_000, net_cents: 9_480 });
  });

  it('rejects an amount over what is left unless the extra goes to the team fund', async () => {
    const n = await freshNeed('Chin strap', 2_000);
    const refused = await createGift(gift({ needIds: [n], amountCents: 5_000 }), null);
    expect(refused).toMatchObject({ ok: false, field: 'amount' });

    const fundBefore = (await need(ids.fund)).raised_cents;
    const id = await giveAndSucceed({ needIds: [n], amountCents: 5_000, sendExtraToFund: true });
    expect(await need(n)).toEqual({ raised_cents: 2_000, status: 'funded' });
    expect((await need(ids.fund)).raised_cents).toBe(fundBefore + 3_000);
    expect(await allocations(id)).toEqual([
      { need_id: ids.fund, amount_cents: 3_000, overflow: false, reversed_at: null },
      { need_id: n, amount_cents: 2_000, overflow: false, reversed_at: null },
    ]);
  });

  it('overflows to the team fund when the need filled up while paying', async () => {
    const n = await freshNeed('Back plate', 3_000);
    const first = await createGift(gift({ needIds: [n], amountCents: 3_000 }), null);
    const second = await createGift(gift({ needIds: [n], amountCents: 2_000 }), null);
    if (!first.ok || !second.ok) throw new Error('expected both gifts to be created');
    await markDonationSucceeded({ donationId: first.donationId });
    await markDonationSucceeded({ donationId: second.donationId });
    expect(await need(n)).toEqual({ raised_cents: 3_000, status: 'funded' });
    expect(await allocations(second.donationId)).toEqual([{ need_id: ids.fund, amount_cents: 2_000, overflow: true, reversed_at: null }]);
    const overflow = await db.query<any>(`select 1 from notifications where kind = 'overflow' and email = 'test.donor@example.com'`);
    expect(overflow.length).toBeGreaterThan(0);
  });

  it('fund the rest fills every picked need exactly', async () => {
    const a = await freshNeed('Towel', 1_500);
    const b = await freshNeed('Water bottle', 2_500);
    const refused = await createGift(gift({ target: 'fund_rest', needIds: [a, b], amountCents: 3_000 }), null);
    expect(refused).toMatchObject({ ok: false, field: 'amount' });
    await giveAndSucceed({ target: 'fund_rest', needIds: [a, b], amountCents: 4_000 });
    expect(await need(a)).toEqual({ raised_cents: 1_500, status: 'funded' });
    expect(await need(b)).toEqual({ raised_cents: 2_500, status: 'funded' });
  });

  it('fund the rest refuses needs for two players', async () => {
    const [liamNeed] = await db.query<{ id: string }>(`select id from needs where athlete_id = $1 and status in ('open', 'partially_funded') limit 1`, [ids.liam]);
    const a = await freshNeed('Sweatband', 1_000);
    const [ln] = await db.query<{ remaining: number }>(`select price_cents - raised_cents as remaining from needs where id = $1`, [liamNeed.id]);
    const r = await createGift(gift({ target: 'fund_rest', needIds: [a, liamNeed.id], amountCents: 1_000 + ln.remaining }), null);
    expect(r).toMatchObject({ ok: false });
  });

  it('a gift to an athlete spreads across their open needs, smallest first', async () => {
    const before = await db.query<any>(
      `select id, price_cents - raised_cents as remaining from needs where athlete_id = $1 and status in ('open', 'partially_funded') and request_status = 'approved' order by price_cents - raised_cents, sort`,
      [ids.jayden],
    );
    const smallest = before[0];
    const id = await giveAndSucceed({ target: 'athlete', athleteId: ids.jayden, amountCents: smallest.remaining + 500 });
    const al = await allocations(id);
    expect(al.reduce((s, a) => s + a.amount_cents, 0)).toBe(smallest.remaining + 500);
    expect(al.find((a) => a.need_id === smallest.id)?.amount_cents).toBe(smallest.remaining);
    expect(await need(smallest.id)).toMatchObject({ status: 'funded' });
  });

  it('a gift to the team fund lands on the fund', async () => {
    const before = (await need(ids.fund)).raised_cents;
    await giveAndSucceed({ target: 'team_fund', amountCents: 2_500 });
    expect((await need(ids.fund)).raised_cents).toBe(before + 2_500);
  });

  it('rejects gifts under $5, to a draft team, or to an unavailable item', async () => {
    expect(await createGift(gift({ target: 'team_fund', amountCents: 499 }), null)).toEqual({ ok: false, error: 'The smallest gift is $5.', field: 'amount' });
    expect(await createGift(gift({ teamId: ids.hillcrest, target: 'team_fund' }), null)).toMatchObject({ ok: false });
    const [owenNeed] = await db.query<{ id: string }>(`select id from needs where athlete_id = $1 limit 1`, [ids.owen]);
    expect(await createGift(gift({ needIds: [owenNeed.id] }), null)).toEqual({ ok: false, error: "That item isn't available anymore." });
    expect(await createGift(gift({ target: 'athlete', athleteId: ids.owen }), null)).toMatchObject({ ok: false });
    const mouthguard = await ids.jaydenNeed('Mouthguard');
    expect(await createGift(gift({ needIds: [mouthguard] }), null)).toMatchObject({ ok: false, error: 'That item was just fully funded.' });
  });

  it('does not take gifts toward a pending item request', async () => {
    const [knee] = await db.query<{ id: string }>(`select id from needs where name = 'Knee Brace' and request_status = 'pending'`);
    expect(await createGift(gift({ needIds: [knee.id] }), null)).toMatchObject({ ok: false });
  });

  it('cleans the donor message', async () => {
    const r = await createGift(gift({ target: 'team_fund', message: '  Go\u0000 Bobcats!  ' }), null);
    if (!r.ok) throw new Error(r.error);
    expect((await donation(r.donationId)).message).toBe('Go Bobcats!');
  });

  it('holds a message for review when the team requires approval', async () => {
    const id = await giveAndSucceed({ target: 'team_fund', message: 'Have a great season.' });
    expect((await donation(id)).message_status).toBe('pending');
    await db.query(`update teams set require_message_approval = false where id = $1`, [ids.team]);
    const ok = await giveAndSucceed({ target: 'team_fund', message: 'Have a great season.' });
    expect((await donation(ok)).message_status).toBe('approved');
    const flagged = await giveAndSucceed({ target: 'team_fund', message: 'Venmo me for more' });
    expect((await donation(flagged)).message_status).toBe('pending');
    const none = await giveAndSucceed({ target: 'team_fund' });
    expect((await donation(none)).message_status).toBe('none');
    await db.query(`update teams set require_message_approval = true where id = $1`, [ids.team]);
  });
});

describe('idempotency', () => {
  it('reusing a key returns the same pending donation', async () => {
    const n = await freshNeed('Idem item', 5_000);
    const req = gift({ needIds: [n], amountCents: 2_000 });
    const a = await createGift(req, null);
    const b = await createGift({ ...req, amountCents: 3_000 }, null);
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(b.donationId).toBe(a.donationId);
    expect(b.quote.giftCents).toBe(2_000);
    expect((await db.query(`select id from donations where idempotency_key = $1`, [req.idempotencyKey]))).toHaveLength(1);
    expect(await db.query(`select id from donation_lines where donation_id = $1`, [a.donationId])).toHaveLength(1);
  });

  it('reusing a key after the payment went through is refused', async () => {
    const req = gift({ target: 'team_fund', amountCents: 1_000 });
    const a = await createGift(req, null);
    if (!a.ok) throw new Error(a.error);
    await markDonationSucceeded({ donationId: a.donationId });
    expect(await createGift(req, null)).toEqual({ ok: false, error: 'This payment was already submitted.' });
  });

  it('a failed payment allocates nothing and cannot then be marked succeeded directly', async () => {
    const n = await freshNeed('Failed item', 5_000);
    const r = await createGift(gift({ needIds: [n], amountCents: 2_000 }), null);
    if (!r.ok) throw new Error(r.error);
    await markDonationFailed(r.donationId, 'card_declined');
    expect(await donation(r.donationId)).toMatchObject({ status: 'failed', failure_reason: 'card_declined' });
    expect(await markDonationSucceeded({ donationId: r.donationId })).toEqual({ applied: false });
    expect((await need(n)).raised_cents).toBe(0);
  });
});

describe('refunds and disputes', () => {
  it('a refund reverses the allocations and restores raised', async () => {
    const n = await freshNeed('Refund item', 4_000);
    const id = await giveAndSucceed({ needIds: [n], amountCents: 4_000 });
    expect(await need(n)).toEqual({ raised_cents: 4_000, status: 'funded' });
    expect(await reverseDonation(id, 'refunded', 'Donor asked')).toBe(true);
    expect(await need(n)).toEqual({ raised_cents: 0, status: 'open' });
    const al = await allocations(id);
    expect(al.every((a) => a.reversed_at !== null)).toBe(true);
    expect(await donation(id)).toMatchObject({ status: 'refunded' });
    expect((await donation(id)).refunded_at).not.toBeNull();
    // A second refund does nothing.
    expect(await reverseDonation(id, 'refunded')).toBe(false);
    expect((await need(n)).raised_cents).toBe(0);
  });

  it('a partial reversal leaves the need partially funded', async () => {
    const n = await freshNeed('Partial item', 6_000);
    await giveAndSucceed({ needIds: [n], amountCents: 2_000 });
    const second = await giveAndSucceed({ needIds: [n], amountCents: 3_000 });
    await reverseDonation(second, 'refunded');
    expect(await need(n)).toEqual({ raised_cents: 2_000, status: 'partially_funded' });
  });

  it('a refund resolves an open refund request', async () => {
    const id = await giveAndSucceed({ target: 'team_fund', amountCents: 1_500 });
    await db.query(`insert into refund_requests (donation_id, team_id, reason) values ($1, $2, 'Wrong team')`, [id, ids.team]);
    await reverseDonation(id, 'refunded', 'Refunded in full');
    const [rr] = await db.query<any>(`select status, resolution_note from refund_requests where donation_id = $1`, [id]);
    expect(rr).toEqual({ status: 'refunded', resolution_note: 'Refunded in full' });
  });

  it('a won dispute reinstates the gift', async () => {
    const n = await freshNeed('Dispute item', 5_000);
    const id = await giveAndSucceed({ needIds: [n], amountCents: 5_000 });
    expect(await reverseDonation(id, 'disputed')).toBe(true);
    expect(await need(n)).toEqual({ raised_cents: 0, status: 'open' });
    expect((await donation(id)).status).toBe('disputed');

    expect(await reinstateDisputedDonation(id)).toBe(true);
    expect(await need(n)).toEqual({ raised_cents: 5_000, status: 'funded' });
    expect((await donation(id)).status).toBe('succeeded');
    const al = await allocations(id);
    expect(al.filter((a) => a.reversed_at === null)).toEqual([{ need_id: n, amount_cents: 5_000, overflow: false, reversed_at: null }]);
    expect(al.filter((a) => a.reversed_at !== null)).toHaveLength(1);
    // Not disputed anymore, so nothing to reinstate.
    expect(await reinstateDisputedDonation(id)).toBe(false);
  });

  it('a dispute that is then refunded stays reversed', async () => {
    const n = await freshNeed('Lost dispute item', 5_000);
    const id = await giveAndSucceed({ needIds: [n], amountCents: 5_000 });
    await reverseDonation(id, 'disputed');
    expect(await reverseDonation(id, 'refunded')).toBe(true);
    expect((await donation(id)).status).toBe('refunded');
    expect((await need(n)).raised_cents).toBe(0);
  });
});

// Minimal Stripe events. Only the fields the handlers read are filled in.
let evtSeq = 0;
function event<T extends Stripe.Event['type']>(type: T, object: Record<string, unknown>, extra: Partial<Stripe.Event> = {}, id = `evt_test_${++evtSeq}`): Stripe.Event {
  return { id, object: 'event', type, data: { object }, created: 0, livemode: false, api_version: null, pending_webhooks: 0, request: null, ...extra } as unknown as Stripe.Event;
}
const intent = (id: string, donationId: string) => ({
  id,
  object: 'payment_intent',
  metadata: { donation_id: donationId },
  latest_charge: { id: `ch_${id}`, payment_method_details: { card: { brand: 'mastercard', last4: '4444' } } },
});

describe('handleStripeEvent', () => {
  it('payment_intent.succeeded applies once even if delivered twice', async () => {
    const n = await freshNeed('Webhook item', 5_000);
    const r = await createGift(gift({ needIds: [n], amountCents: 2_000 }), null);
    if (!r.ok) throw new Error(r.error);
    const e = event('payment_intent.succeeded', intent('pi_wh_1', r.donationId));
    expect(await handleStripeEvent(e)).toBe(true);
    expect(await handleStripeEvent(e)).toBe(false);
    expect((await need(n)).raised_cents).toBe(2_000);
    expect(await allocations(r.donationId)).toHaveLength(1);
    expect(await donation(r.donationId)).toMatchObject({ status: 'succeeded', payment_intent_id: 'pi_wh_1', charge_id: 'ch_pi_wh_1', card_brand: 'mastercard', card_last4: '4444' });
    expect(await db.query(`select id from stripe_events where id = $1`, [e.id])).toHaveLength(1);

    // A different event for the same intent (Stripe can send duplicates with new ids) is still harmless.
    expect(await handleStripeEvent(event('payment_intent.succeeded', intent('pi_wh_1', r.donationId)))).toBe(true);
    expect((await need(n)).raised_cents).toBe(2_000);
  });

  it('payment_intent.succeeded revives a donation the browser marked failed', async () => {
    const r = await createGift(gift({ target: 'team_fund', amountCents: 1_000 }), null);
    if (!r.ok) throw new Error(r.error);
    await markDonationFailed(r.donationId, 'browser_error');
    await handleStripeEvent(event('payment_intent.succeeded', intent('pi_wh_revive', r.donationId)));
    expect(await donation(r.donationId)).toMatchObject({ status: 'succeeded', failure_reason: null });
  });

  it('payment_intent.payment_failed marks the donation failed with the decline code', async () => {
    const r = await createGift(gift({ target: 'team_fund', amountCents: 1_000 }), null);
    if (!r.ok) throw new Error(r.error);
    await handleStripeEvent(event('payment_intent.payment_failed', { id: 'pi_wh_fail', metadata: { donation_id: r.donationId }, last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' } }));
    expect(await donation(r.donationId)).toMatchObject({ status: 'failed', failure_reason: 'insufficient_funds' });
  });

  it('charge.refunded reverses a full refund and logs a partial one', async () => {
    const n = await freshNeed('Refund via webhook', 3_000);
    const r = await createGift(gift({ needIds: [n], amountCents: 3_000 }), null);
    if (!r.ok) throw new Error(r.error);
    await handleStripeEvent(event('payment_intent.succeeded', intent('pi_wh_refund', r.donationId)));
    expect((await need(n)).raised_cents).toBe(3_000);

    await handleStripeEvent(event('charge.refunded', { id: 'ch_x', payment_intent: 'pi_wh_refund', amount: 3_200, amount_refunded: 1_000 }));
    expect((await donation(r.donationId)).status).toBe('succeeded');
    const [log] = await db.query<any>(`select detail from activity_log where action = 'partial_refund' order by created_at desc limit 1`);
    expect(log.detail).toEqual({ donation_id: r.donationId, refunded_cents: 1_000 });

    await handleStripeEvent(event('charge.refunded', { id: 'ch_x', payment_intent: 'pi_wh_refund', amount: 3_200, amount_refunded: 3_200 }));
    expect((await donation(r.donationId)).status).toBe('refunded');
    expect((await need(n)).raised_cents).toBe(0);
  });

  it('a dispute reverses the gift and a won dispute restores it', async () => {
    const n = await freshNeed('Dispute via webhook', 3_000);
    const r = await createGift(gift({ needIds: [n], amountCents: 3_000 }), null);
    if (!r.ok) throw new Error(r.error);
    await handleStripeEvent(event('payment_intent.succeeded', intent('pi_wh_dispute', r.donationId)));
    await handleStripeEvent(event('charge.dispute.created', { id: 'dp_1', payment_intent: { id: 'pi_wh_dispute' } }));
    expect((await donation(r.donationId)).status).toBe('disputed');
    expect((await need(n)).raised_cents).toBe(0);
    await handleStripeEvent(event('charge.dispute.closed', { id: 'dp_1', payment_intent: 'pi_wh_dispute', status: 'won' }));
    expect((await donation(r.donationId)).status).toBe('succeeded');
    expect(await need(n)).toEqual({ raised_cents: 3_000, status: 'funded' });
  });

  it('a lost dispute records the outcome and keeps the gift reversed', async () => {
    const r = await createGift(gift({ target: 'team_fund', amountCents: 1_000 }), null);
    if (!r.ok) throw new Error(r.error);
    await handleStripeEvent(event('payment_intent.succeeded', intent('pi_wh_lost', r.donationId)));
    await handleStripeEvent(event('charge.dispute.created', { id: 'dp_2', payment_intent: 'pi_wh_lost' }));
    await handleStripeEvent(event('charge.dispute.closed', { id: 'dp_2', payment_intent: 'pi_wh_lost', status: 'lost' }));
    expect(await donation(r.donationId)).toMatchObject({ status: 'disputed', failure_reason: 'dispute_lost' });
  });

  it('ignores events for unknown payments and unknown types', async () => {
    expect(await handleStripeEvent(event('payment_intent.succeeded', { id: 'pi_nobody', metadata: {}, latest_charge: null }))).toBe(true);
    expect(await handleStripeEvent(event('customer.created' as any, { id: 'cus_1' }))).toBe(true);
  });

  it('account.updated moves the team payouts status and tells staff', async () => {
    const [t] = await db.query<{ stripe_account_id: string }>(`select stripe_account_id from teams where id = $1`, [ids.team]);
    await handleStripeEvent(event('account.updated', { id: t.stripe_account_id, charges_enabled: false, payouts_enabled: false, details_submitted: true, requirements: { disabled_reason: 'requirements.past_due' } }));
    expect((await db.query<any>(`select payouts_status from teams where id = $1`, [ids.team]))[0].payouts_status).toBe('restricted');
    expect(await createGift(gift({ target: 'team_fund' }), null)).toMatchObject({ ok: false });
    await handleStripeEvent(event('account.updated', { id: t.stripe_account_id, charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: {} }));
    expect((await db.query<any>(`select payouts_status from teams where id = $1`, [ids.team]))[0].payouts_status).toBe('connected');
    const notes = await db.query<any>(`select subject from notifications where kind = 'payouts' and user_id = $1`, [ids.coach]);
    expect(notes.map((n) => n.subject)).toEqual(expect.arrayContaining(['Stripe needs more information', 'Payouts are set up']));
  });

  it('a handler error forgets the event so a retry runs again', async () => {
    const [t] = await db.query<{ stripe_account_id: string }>(`select stripe_account_id from teams where id = $1`, [ids.team]);
    const payout = { id: 'po_retry', object: 'payout', amount: 12_345, status: 'paid', arrival_date: 'not-a-timestamp' };
    const bad = event('payout.paid', payout, { account: t.stripe_account_id }, 'evt_retry_1');
    await expect(handleStripeEvent(bad)).rejects.toThrow();
    expect(await db.query(`select id from stripe_events where id = 'evt_retry_1'`)).toEqual([]);
    expect(await db.query(`select id from payouts where stripe_payout_id = 'po_retry'`)).toEqual([]);

    const good = event('payout.paid', { ...payout, arrival_date: 1_790_000_000 }, { account: t.stripe_account_id }, 'evt_retry_1');
    expect(await handleStripeEvent(good)).toBe(true);
    expect(await handleStripeEvent(good)).toBe(false);
    const rows = await db.query<any>(`select team_id, amount_cents, status from payouts where stripe_payout_id = 'po_retry'`);
    expect(rows).toEqual([{ team_id: ids.team, amount_cents: 12_345, status: 'paid' }]);
  });

  it('payout.failed updates the payout and notifies staff', async () => {
    const [t] = await db.query<{ stripe_account_id: string }>(`select stripe_account_id from teams where id = $1`, [ids.team]);
    await handleStripeEvent(event('payout.failed', { id: 'po_retry', amount: 12_345, status: 'failed', arrival_date: 1_790_000_000 }, { account: t.stripe_account_id }));
    expect((await db.query<any>(`select status from payouts where stripe_payout_id = 'po_retry'`))[0].status).toBe('failed');
    const notes = await db.query<any>(`select subject from notifications where kind = 'payouts' and subject like '%payout failed'`);
    expect(notes.length).toBeGreaterThan(0);
  });
});
