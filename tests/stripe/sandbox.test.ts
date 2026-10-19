/**
 * End to end against a real Stripe sandbox: the app's own checkout and
 * webhook code, a real connected account, real test cards. Runs only from
 * the "Stripe sandbox check" workflow (or by hand) with test keys:
 *
 *   STRIPE_SECRET_KEY=sk_test_... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... npm run test:stripe
 *
 * The database is the in-memory demo database, so nothing touches the live
 * site. Stripe keeps the test payments; the connected account is deleted at
 * the end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { freshDb } from '../support/db';
import { demoIds } from '../support/fixtures';
import type { Driver } from '@/lib/db';
import { mode } from '@/lib/env';
import { createGift, GiftRequest } from '@/lib/payments/checkout';
import { handleStripeEvent } from '@/lib/payments/webhook';
import { stripe, isTestKey, accountStatus, stripeRefundParams } from '@/lib/payments/stripe';
import { quoteGift } from '@/lib/domain/money';

const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
  throw new Error('The Stripe sandbox check needs test keys (sk_test_...). It never runs against live keys.');
}

let db: Driver;
let ids: Awaited<ReturnType<typeof demoIds>>;
let account: Stripe.Account;

const event = <T>(type: string, object: T) => ({ id: `evt_sandbox_${randomUUID()}`, type, data: { object } }) as unknown as Stripe.Event;
const donation = async (id: string) => (await db.query<any>(`select * from donations where id = $1`, [id]))[0];
const raised = async (needId: string) => (await db.query<{ raised_cents: number }>(`select raised_cents from needs where id = $1`, [needId]))[0].raised_cents;

async function freshNeed(name: string, priceCents: number) {
  const [n] = await db.query<{ id: string }>(
    `insert into needs (team_id, season_id, athlete_id, kind, name, price_cents, sort) values ($1, $2, $3, 'athlete', $4, $5, 60) returning id`,
    [ids.team, ids.season, ids.jayden, name, priceCents],
  );
  return n.id;
}

const gift = (needId: string, amountCents: number, coverFees = true) =>
  GiftRequest.parse({
    teamId: ids.team,
    target: 'need',
    needIds: [needId],
    amountCents,
    coverFees,
    donorName: 'Sandbox Donor',
    donorEmail: 'sandbox.donor@example.com',
    showName: true,
    idempotencyKey: `sandbox-${randomUUID()}`,
  });

beforeAll(async () => {
  expect(isTestKey()).toBe(true);
  expect(mode.payments).toBe('stripe');
  db = await freshDb();
  ids = await demoIds(db);

  // A connected account that can take payments straight away, using Stripe's
  // test values for identity, address and bank account.
  account = await stripe().accounts.create({
    country: 'US',
    email: 'sandbox.coach@example.com',
    business_type: 'individual',
    controller: {
      stripe_dashboard: { type: 'none' },
      fees: { payer: 'application' },
      losses: { payments: 'application' },
      requirement_collection: 'application',
    },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { mcc: '8398', url: 'https://gridirongive.example.com', product_description: 'School team equipment fundraising' },
    individual: {
      first_name: 'Sandbox',
      last_name: 'Coach',
      email: 'sandbox.coach@example.com',
      phone: '+15555550100',
      dob: { day: 1, month: 1, year: 1901 },
      ssn_last_4: '0000',
      id_number: '000000000',
      address: { line1: 'address_full_match', city: 'Columbus', state: 'OH', postal_code: '43215', country: 'US' },
    },
    external_account: 'btok_us_verified',
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '8.8.8.8' },
  });
  for (let i = 0; i < 30 && !(account.charges_enabled && account.payouts_enabled); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    account = await stripe().accounts.retrieve(account.id);
  }
  expect(accountStatus(account)).toBe('connected');
  await db.query(`update teams set stripe_account_id = $2, payouts_status = 'connected' where id = $1`, [ids.team, account.id]);
}, 120_000);

afterAll(async () => {
  if (account?.id) await stripe().accounts.del(account.id).catch(() => {});
});

describe('Stripe sandbox', () => {
  it('connected account updates map to "connected" through the webhook', async () => {
    await db.query(`update teams set payouts_status = 'pending' where id = $1`, [ids.team]);
    await handleStripeEvent(event('account.updated', account));
    const [t] = await db.query<any>(`select payouts_status from teams where id = $1`, [ids.team]);
    expect(t.payouts_status).toBe('connected');
  });

  let paidDonationId = '';
  let paidNeed = '';

  it('takes a $37.50 gift at the coach-set price, with the fee split and transfer Stripe reports', async () => {
    paidNeed = await freshNeed('Sandbox cleats', 3_750);
    const before = await raised(paidNeed);
    const r = await createGift(gift(paidNeed, 3_750), null);
    if (!r.ok) throw new Error(r.error);
    expect(r.simulated).toBe(false);
    expect(r.clientSecret).toMatch(/^pi_.+_secret_/);
    paidDonationId = r.donationId;

    const d = await donation(r.donationId);
    const quote = quoteGift(3_750, true);
    const created = await stripe().paymentIntents.retrieve(d.payment_intent_id);
    expect(created.amount).toBe(quote.totalCents);
    expect(created.application_fee_amount).toBe(quote.totalCents - quote.netCents);
    expect(created.transfer_data?.destination).toBe(account.id);
    expect(created.on_behalf_of).toBe(account.id);
    expect(created.metadata.donation_id).toBe(r.donationId);

    // What the Payment Element does in the browser, with Stripe's test Visa.
    const confirmed = await stripe().paymentIntents.confirm(created.id, {
      payment_method: 'pm_card_visa',
      return_url: `http://localhost:3000/give/success/${r.donationId}`,
    });
    expect(confirmed.status).toBe('succeeded');

    await handleStripeEvent(event('payment_intent.succeeded', confirmed));
    const after = await donation(r.donationId);
    expect(after.status).toBe('succeeded');
    expect(after.card_last4).toBe('4242');
    expect(await raised(paidNeed)).toBe(before + 3_750);

    const charge = await stripe().charges.retrieve(confirmed.latest_charge as string, { expand: ['transfer'] });
    const transfer = charge.transfer as Stripe.Transfer;
    expect(transfer.destination).toBe(account.id);
    expect(transfer.amount).toBe(quote.netCents);
  });

  it('a gift above what the item still needs is refused before Stripe is called', async () => {
    const n = await freshNeed('Sandbox mouthguard', 1_200);
    const r = await createGift(gift(n, 5_000), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('amount');
  });

  it('a declined card leaves the gift failed and the item open', async () => {
    const n = await freshNeed('Sandbox helmet', 41_200);
    const r = await createGift(gift(n, 41_200, false), null);
    if (!r.ok) throw new Error(r.error);
    const d = await donation(r.donationId);
    await expect(
      stripe().paymentIntents.confirm(d.payment_intent_id, { payment_method: 'pm_card_chargeDeclined', return_url: 'http://localhost:3000/' }),
    ).rejects.toMatchObject({ code: 'card_declined' });
    const intent = await stripe().paymentIntents.retrieve(d.payment_intent_id);
    await handleStripeEvent(event('payment_intent.payment_failed', intent));
    expect((await donation(r.donationId)).status).toBe('failed');
    expect(await raised(n)).toBe(0);
  });

  it('a refund returns the whole payment, takes the gift back from the team and reopens the item', async () => {
    const d = await donation(paidDonationId);
    await stripe().refunds.create(stripeRefundParams(d.payment_intent_id, d.id));
    const intent = await stripe().paymentIntents.retrieve(d.payment_intent_id);
    const charge = await stripe().charges.retrieve(intent.latest_charge as string, { expand: ['transfer'] });
    expect(charge.amount_refunded).toBe(charge.amount);
    const transfer = charge.transfer as Stripe.Transfer;
    expect(transfer.amount_reversed).toBe(transfer.amount);
    await handleStripeEvent(event('charge.refunded', charge));
    expect((await donation(paidDonationId)).status).toBe('refunded');
    expect(await raised(paidNeed)).toBe(0);
  });
});
