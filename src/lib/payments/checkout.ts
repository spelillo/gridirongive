import 'server-only';
import { z } from 'zod';
import { sys } from '@/lib/db';
import { env, mode, paymentsAvailable } from '@/lib/env';
import { quoteGift, type FeeQuote } from '@/lib/domain/money';
import { MIN_GIFT_CENTS } from '@/config/fees';
import { cleanUserText } from '@/lib/domain/text';
import { needRemaining } from '@/lib/domain/allocation';
import { stripe } from '@/lib/payments/stripe';

/**
 * Creating a gift (ui-ux-spec 5.5). The browser sends what the donor picked;
 * the server re-reads the needs, re-applies the caps and recomputes fees, so
 * the browser's numbers are only ever a preview.
 */
export const GiftRequest = z.object({
  teamId: z.uuid(),
  target: z.enum(['need', 'fund_rest', 'athlete', 'team_fund']),
  athleteId: z.uuid().nullish(),
  needIds: z.array(z.uuid()).max(30).default([]),
  amountCents: z.number().int().positive().max(10_000_00),
  sendExtraToFund: z.boolean().default(false),
  coverFees: z.boolean(),
  donorName: z.string().trim().min(1, 'Enter your name.').max(80),
  donorEmail: z.email('Enter a valid email for the receipt.').max(200),
  showName: z.boolean(),
  message: z.string().max(200).default(''),
  idempotencyKey: z.string().min(16).max(80),
  sourceToken: z.string().max(64).nullish(),
});
export type GiftRequest = z.infer<typeof GiftRequest>;

export type GiftResult =
  | { ok: true; donationId: string; quote: FeeQuote; clientSecret: string | null; simulated: boolean }
  | { ok: false; error: string; field?: string };

export async function createGift(req: GiftRequest, donorUserId: string | null): Promise<GiftResult> {
  if (!paymentsAvailable()) return { ok: false, error: "This team can't accept gifts right now." };
  const team = await sys.one<any>(
    `select id, name, status, payouts_status, stripe_account_id, current_season_id from teams where id = $1`,
    [req.teamId],
  );
  if (!team || team.status !== 'live') return { ok: false, error: "This team isn't accepting gifts right now." };
  if (team.payouts_status !== 'connected') return { ok: false, error: "This team can't accept gifts right now." };
  if (mode.payments === 'stripe' && !team.stripe_account_id) return { ok: false, error: "This team can't accept gifts right now." };

  // Idempotency: a double tap returns the same pending donation.
  const existing = await sys.one<any>(`select id, status, gift_cents, cover_fees, payment_intent_id from donations where idempotency_key = $1`, [req.idempotencyKey]);
  if (existing) {
    if (existing.status !== 'pending') return { ok: false, error: 'This payment was already submitted.' };
    const quote = quoteGift(existing.gift_cents, existing.cover_fees);
    const clientSecret = existing.payment_intent_id && mode.payments === 'stripe'
      ? (await stripe().paymentIntents.retrieve(existing.payment_intent_id)).client_secret
      : null;
    return { ok: true, donationId: existing.id, quote, clientSecret, simulated: mode.payments !== 'stripe' };
  }

  if (req.amountCents < MIN_GIFT_CENTS) return { ok: false, error: 'The smallest gift is $5.', field: 'amount' };

  const needs = await sys.query<any>(
    `select n.id, n.athlete_id, n.kind, n.price_cents, n.raised_cents, n.status, n.sort, a.status as athlete_status
     from needs n left join athletes a on a.id = n.athlete_id
     where n.team_id = $1 and n.season_id = $2 and n.status <> 'removed' and n.request_status = 'approved'`,
    [team.id, team.current_season_id],
  );
  const fund = needs.find((n) => n.kind === 'team_fund');
  if (!fund) return { ok: false, error: "This team can't accept gifts right now." };
  const state = (n: any) => ({ id: n.id, athleteId: n.athlete_id, kind: n.kind, priceCents: n.price_cents, raisedCents: n.raised_cents, status: n.status, sort: n.sort });
  const live = (n: any) => n.kind !== 'athlete' || n.athlete_status === 'live';

  let lines: { needId: string | null; athleteId: string | null; requestedCents: number }[] = [];
  let athleteId: string | null = null;
  const amount = req.amountCents;

  if (req.target === 'team_fund') {
    lines = [{ needId: fund.id, athleteId: null, requestedCents: amount }];
  } else if (req.target === 'need') {
    const n = needs.find((x) => x.id === req.needIds[0]);
    if (!n || !live(n)) return { ok: false, error: "That item isn't available anymore." };
    const left = needRemaining(state(n));
    if (left <= 0) return { ok: false, error: 'That item was just fully funded.', field: 'amount' };
    athleteId = n.athlete_id;
    if (amount > left && !req.sendExtraToFund) return { ok: false, error: `This item only needs $${Math.floor(left / 100)}. Lower the amount or send the extra to the team fund.`, field: 'amount' };
    lines = [{ needId: n.id, athleteId: n.athlete_id, requestedCents: Math.min(amount, left) }];
    if (amount > left) lines.push({ needId: fund.id, athleteId: null, requestedCents: amount - left });
  } else if (req.target === 'fund_rest') {
    const picked = needs.filter((n) => req.needIds.includes(n.id) && live(n) && needRemaining(state(n)) > 0);
    if (!picked.length) return { ok: false, error: 'Everything on this list was just funded.' };
    athleteId = picked[0].athlete_id;
    if (picked.some((n) => n.athlete_id !== athleteId)) return { ok: false, error: 'Pick items for one player at a time.' };
    lines = picked.map((n) => ({ needId: n.id, athleteId: n.athlete_id, requestedCents: needRemaining(state(n)) }));
    const sum = lines.reduce((s, l) => s + l.requestedCents, 0);
    if (amount !== sum) return { ok: false, error: 'The amounts changed while you were giving. Check the total and try again.', field: 'amount' };
  } else {
    // Any amount toward an athlete: spread across their open needs, smallest first.
    const a = await sys.one<any>(`select id, status from athletes where id = $1 and team_id = $2`, [req.athleteId, team.id]);
    if (!a || a.status !== 'live') return { ok: false, error: "This player's page isn't available." };
    athleteId = a.id;
    const left = needs.filter((n) => n.athlete_id === a.id).reduce((s, n) => s + needRemaining(state(n)), 0);
    if (left <= 0) return { ok: false, error: 'Everything on this list was just funded.' };
    if (amount > left && !req.sendExtraToFund) return { ok: false, error: `This player only needs $${Math.floor(left / 100)}. Lower the amount or send the extra to the team fund.`, field: 'amount' };
    lines = [{ needId: null, athleteId: a.id, requestedCents: Math.min(amount, left) }];
    if (amount > left) lines.push({ needId: fund.id, athleteId: null, requestedCents: amount - left });
  }

  const quote = quoteGift(amount, req.coverFees);
  const message = cleanUserText(req.message, 200);

  const donation = await sys.tx(async (tx) => {
    const d = await tx.one<{ id: string }>(
      `insert into donations (team_id, season_id, athlete_id, target, donor_name, donor_email, show_name, message,
         gift_cents, cover_fees, platform_fee_cents, stripe_fee_cents, total_cents, net_cents, send_extra_to_fund,
         idempotency_key, source_token, donor_user_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
      [team.id, team.current_season_id, athleteId, req.target, cleanUserText(req.donorName, 80), req.donorEmail.toLowerCase(), req.showName,
        message || null, quote.giftCents, quote.coverFees, quote.platformFeeCents, quote.stripeFeeCents, quote.totalCents, quote.netCents,
        req.sendExtraToFund, req.idempotencyKey, req.sourceToken ?? null, donorUserId],
    );
    for (const l of lines) {
      await tx.query(`insert into donation_lines (donation_id, need_id, athlete_id, requested_cents) values ($1, $2, $3, $4)`, [d!.id, l.needId, l.athleteId, l.requestedCents]);
    }
    return d!;
  });

  if (mode.payments !== 'stripe') return { ok: true, donationId: donation.id, quote, clientSecret: null, simulated: true };

  try {
    const intent = await stripe().paymentIntents.create(
      {
        amount: quote.totalCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        receipt_email: req.donorEmail,
        description: `Gift to ${team.name}`,
        statement_descriptor_suffix: 'GRIDIRON GIVE',
        // Destination charge: the team's connected account gets the net amount.
        application_fee_amount: quote.totalCents - quote.netCents,
        on_behalf_of: team.stripe_account_id,
        transfer_data: { destination: team.stripe_account_id },
        metadata: { donation_id: donation.id, team_id: team.id },
      },
      { idempotencyKey: `gift-${req.idempotencyKey}` },
    );
    await sys.query(`update donations set payment_intent_id = $2 where id = $1`, [donation.id, intent.id]);
    return { ok: true, donationId: donation.id, quote, clientSecret: intent.client_secret, simulated: false };
  } catch (err) {
    console.error('payment intent failed', err);
    await sys.query(`update donations set status = 'failed', failure_reason = 'intent_failed' where id = $1`, [donation.id]);
    return { ok: false, error: 'Payments are not working right now. Try again in a few minutes.' };
  }
}

/** For the success page: return URL Stripe sends the donor back to. */
export function successUrl(donationId: string) {
  return `${env.appUrl}/give/success/${donationId}`;
}
