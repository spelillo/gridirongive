import 'server-only';
import { sys } from '@/lib/db';
import { mode } from '@/lib/env';
import { stripe, accountStatus } from '@/lib/payments/stripe';

export interface StripeInfo {
  mode: 'stripe' | 'simulated';
  status: string;
  accountId: string | null;
  bankLast4: string | null;
  bankName: string | null;
  schedule: string | null;
  requirements: string[];
  availableCents: number | null;
  pendingCents: number | null;
  error: string | null;
}

const REQ_LABELS: Record<string, string> = {
  external_account: 'Bank account',
  'business_profile.url': 'Website',
  'business_profile.mcc': 'Business category',
  tos_acceptance: 'Accept the Stripe terms',
  'company.tax_id': 'Tax ID (EIN)',
};

function reqLabel(r: string) {
  if (REQ_LABELS[r]) return REQ_LABELS[r];
  const last = r.split('.').pop() ?? r;
  return last.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Reads the team's connected account from Stripe (status, bank, schedule,
 * requirements, balance) and keeps teams.payouts_status in step. Every call
 * to Stripe is wrapped so the page still renders when Stripe is down.
 */
export async function stripeInfo(team: { id: string; stripeAccountId: string | null; payoutsStatus: string }): Promise<StripeInfo> {
  const base: StripeInfo = {
    mode: mode.payments,
    status: team.payoutsStatus,
    accountId: team.stripeAccountId,
    bankLast4: null,
    bankName: null,
    schedule: null,
    requirements: [],
    availableCents: null,
    pendingCents: null,
    error: null,
  };
  if (mode.payments !== 'stripe' || !team.stripeAccountId) return base;
  try {
    const acct = await stripe().accounts.retrieve(team.stripeAccountId);
    const status = accountStatus(acct);
    if (status !== team.payoutsStatus) {
      await sys.query(`update teams set payouts_status = $2 where id = $1`, [team.id, status]);
      base.status = status;
    }
    const bank = acct.external_accounts?.data?.find((x) => x.object === 'bank_account') as { last4?: string; bank_name?: string | null } | undefined;
    base.bankLast4 = bank?.last4 ?? null;
    base.bankName = bank?.bank_name ?? null;
    const sch = acct.settings?.payouts?.schedule;
    if (sch) base.schedule = sch.interval === 'manual' ? 'Manual' : sch.interval === 'daily' ? `Daily, ${sch.delay_days} day delay` : sch.interval === 'weekly' ? `Weekly on ${sch.weekly_anchor}` : `Monthly on day ${sch.monthly_anchor}`;
    base.requirements = [...new Set([...(acct.requirements?.currently_due ?? []), ...(acct.requirements?.past_due ?? [])])].map(reqLabel);
  } catch (err) {
    console.error('stripe account retrieve failed', err);
    base.error = "We couldn't reach Stripe. Account details may be out of date.";
  }
  try {
    const bal = await stripe().balance.retrieve({}, { stripeAccount: team.stripeAccountId });
    base.availableCents = bal.available.filter((b) => b.currency === 'usd').reduce((s, b) => s + b.amount, 0);
    base.pendingCents = bal.pending.filter((b) => b.currency === 'usd').reduce((s, b) => s + b.amount, 0);
  } catch (err) {
    console.error('stripe balance failed', err);
    base.error ??= "We couldn't load the Stripe balance.";
  }
  return base;
}
