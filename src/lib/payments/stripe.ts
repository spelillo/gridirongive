import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!env.stripeSecretKey) throw new Error('Stripe is not configured');
  client ??= new Stripe(env.stripeSecretKey, { appInfo: { name: 'Gridiron Give' }, maxNetworkRetries: 2 });
  return client;
}

export function isTestKey(): boolean {
  return Boolean(env.stripeSecretKey?.startsWith('sk_test_') || env.stripeSecretKey?.startsWith('rk_test_'));
}

/** Maps a Connect account to our payouts status. */
export function accountStatus(acct: Stripe.Account): 'pending' | 'connected' | 'restricted' {
  if (acct.charges_enabled && acct.payouts_enabled) return 'connected';
  if (acct.requirements?.disabled_reason && !acct.requirements.disabled_reason.startsWith('requirements.pending')) return acct.details_submitted ? 'restricted' : 'pending';
  return 'pending';
}

/** Card errors in plain words (ui-ux-spec 5.5: "Stripe's reason in plain words"). */
export function plainDeclineReason(code?: string | null, fallback?: string | null): string {
  switch (code) {
    case 'card_declined':
    case 'generic_decline':
    case 'do_not_honor':
      return 'Your card was declined. Try a different card.';
    case 'insufficient_funds':
      return 'The card has insufficient funds. Try a different card.';
    case 'expired_card':
      return 'The card has expired. Check the date or use a different card.';
    case 'incorrect_cvc':
    case 'invalid_cvc':
      return "The security code doesn't match. Check the 3 or 4 digits on the card.";
    case 'incorrect_number':
    case 'invalid_number':
      return "The card number isn't valid. Check it and try again.";
    case 'processing_error':
      return 'The card could not be processed. Try again in a moment.';
    case 'authentication_required':
      return 'Your bank needs you to confirm this payment. Try again and follow the prompt.';
    default:
      return fallback || 'The payment did not go through. Try again or use a different card.';
  }
}
