import 'server-only';
import type Stripe from 'stripe';
import { sys } from '@/lib/db';
import { stripe, accountStatus } from '@/lib/payments/stripe';
import { markDonationFailed, markDonationSucceeded, reinstateDisputedDonation, reverseDonation } from '@/lib/payments/process';
import { notifyTeamStaff, flushSoon } from '@/lib/notify';
import { money } from '@/lib/domain/money';
import { env } from '@/lib/env';

/**
 * Applies one Stripe event. Every handler is idempotent on its own, and the
 * stripe_events table makes a redelivered event a no-op.
 * Returns false when the event was already handled.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<boolean> {
  const fresh = await sys.one<{ id: string }>(
    `insert into stripe_events (id, type) values ($1, $2) on conflict (id) do nothing returning id`,
    [event.id, event.type],
  );
  if (!fresh) return false;
  try {
    await apply(event);
  } catch (err) {
    // Let Stripe retry: forget the event so the next delivery runs again.
    await sys.query(`delete from stripe_events where id = $1`, [event.id]);
    throw err;
  }
  return true;
}

async function donationFor(pi: string | null | undefined, metaId?: string | null) {
  if (metaId) {
    const d = await sys.one<{ id: string; status: string }>(`select id, status from donations where id = $1`, [metaId]);
    if (d) return d;
  }
  if (!pi) return null;
  return sys.one<{ id: string; status: string }>(`select id, status from donations where payment_intent_id = $1`, [pi]);
}

const piId = (v: string | Stripe.PaymentIntent | null) => (typeof v === 'string' ? v : v?.id ?? null);

async function chargeDetails(intent: Stripe.PaymentIntent): Promise<{ chargeId: string | null; brand: string | null; last4: string | null }> {
  const ref = intent.latest_charge;
  let charge: Stripe.Charge | null = typeof ref === 'string' ? null : ref;
  if (typeof ref === 'string') {
    try {
      charge = await stripe().charges.retrieve(ref);
    } catch {
      return { chargeId: ref, brand: null, last4: null };
    }
  }
  const card = charge?.payment_method_details?.card;
  return { chargeId: charge?.id ?? null, brand: card?.brand ?? null, last4: card?.last4 ?? null };
}

async function apply(event: Stripe.Event) {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      const d = await donationFor(intent.id, intent.metadata?.donation_id);
      if (!d) return;
      // The browser may have reported a failure for an attempt that later went through.
      if (d.status === 'failed') await sys.query(`update donations set status = 'pending', failure_reason = null where id = $1`, [d.id]);
      const c = await chargeDetails(intent);
      await markDonationSucceeded({ donationId: d.id, paymentIntentId: intent.id, chargeId: c.chargeId, cardBrand: c.brand, cardLast4: c.last4 });
      return;
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const d = await donationFor(intent.id, intent.metadata?.donation_id);
      if (!d) return;
      const err = intent.last_payment_error;
      await markDonationFailed(d.id, err?.decline_code ?? err?.code ?? 'failed');
      return;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      const d = await donationFor(piId(charge.payment_intent));
      if (!d) return;
      if (charge.amount_refunded >= charge.amount) {
        await reverseDonation(d.id, 'refunded');
      } else {
        // Partial refunds are rare and handled by hand: record it for the admin queue.
        const row = await sys.one<{ team_id: string }>(`select team_id from donations where id = $1`, [d.id]);
        if (row) {
          await sys.query(`insert into activity_log (team_id, action, detail) values ($1, 'partial_refund', $2)`, [
            row.team_id,
            JSON.stringify({ donation_id: d.id, refunded_cents: charge.amount_refunded }),
          ]);
        }
      }
      return;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      const d = await donationFor(piId(dispute.payment_intent));
      if (d) await reverseDonation(d.id, 'disputed');
      return;
    }
    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      const d = await donationFor(piId(dispute.payment_intent));
      if (!d) return;
      if (dispute.status === 'won') await reinstateDisputedDonation(d.id);
      else await sys.query(`update donations set failure_reason = 'dispute_' || $2 where id = $1`, [d.id, dispute.status]);
      return;
    }
    case 'account.updated': {
      const acct = event.data.object;
      const status = accountStatus(acct);
      const team = await sys.one<{ id: string; payouts_status: string }>(
        `select id, payouts_status from teams where stripe_account_id = $1`,
        [acct.id],
      );
      if (!team || team.payouts_status === status) return;
      await sys.query(`update teams set payouts_status = $2 where id = $1`, [team.id, status]);
      if (status === 'connected' || status === 'restricted') {
        await notifyTeamStaff(sys, team.id, {
          kind: 'payouts',
          subject: status === 'connected' ? 'Payouts are set up' : 'Stripe needs more information',
          body: status === 'connected'
            ? 'Your team can now accept gifts. Money is paid out to your bank account on Stripe\'s schedule.'
            : 'Stripe paused payouts until you finish a few details. Open Payouts to see what is missing.',
          link: `${env.appUrl}/app/manager/${team.id}/payouts`,
        });
        flushSoon();
      }
      return;
    }
    case 'payout.created':
    case 'payout.updated':
    case 'payout.paid':
    case 'payout.failed': {
      const payout = event.data.object;
      if (!event.account) return;
      const team = await sys.one<{ id: string }>(`select id from teams where stripe_account_id = $1`, [event.account]);
      if (!team) return;
      await sys.query(
        `insert into payouts (team_id, stripe_payout_id, amount_cents, status, arrival_date)
         values ($1, $2, $3, $4, to_timestamp($5)::date)
         on conflict (stripe_payout_id) do update set status = excluded.status, arrival_date = excluded.arrival_date, amount_cents = excluded.amount_cents`,
        [team.id, payout.id, payout.amount, payout.status, payout.arrival_date],
      );
      if (event.type === 'payout.failed') {
        await notifyTeamStaff(sys, team.id, {
          kind: 'payouts',
          subject: `A ${money(payout.amount)} payout failed`,
          body: 'Your bank returned a payout. Check the bank account in Payouts. The money stays in your Stripe balance until it is fixed.',
          link: `${env.appUrl}/app/manager/${team.id}/payouts`,
        });
        flushSoon();
      }
      return;
    }
    default:
      return;
  }
}
