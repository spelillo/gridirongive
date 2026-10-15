'use client';
import { useImperativeHandle, useMemo, type Ref } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { PayHandle } from './SimulatedPay';

const cache = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string) {
  if (!cache.has(key)) cache.set(key, loadStripe(key));
  return cache.get(key)!;
}

const appearance = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#0057d2',
    colorText: '#223548',
    colorDanger: '#bb0000',
    fontFamily: 'Inter Variable, Inter, system-ui, sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: { '.Input': { border: '1px solid #475e75', boxShadow: 'none' }, '.Label': { fontWeight: '500', color: '#000' } },
};

/**
 * Stripe Payment Element (Apple Pay and Google Pay on top when available,
 * then card). Uses deferred intent creation so the amount can change until
 * the donor taps Pay; Stripe.js loads only when the sheet opens.
 */
export function StripePay({ ref, publishableKey, amountCents, onBehalfOf, email }: { ref: Ref<PayHandle | null>; publishableKey: string; amountCents: number; onBehalfOf: string | null; email: string }) {
  const stripePromise = useMemo(() => stripeFor(publishableKey), [publishableKey]);
  return (
    <Elements
      stripe={stripePromise}
      options={{ mode: 'payment', amount: amountCents, currency: 'usd', appearance, onBehalfOf: onBehalfOf ?? undefined }}
    >
      <Inner handleRef={ref} email={email} />
    </Elements>
  );
}

function Inner({ handleRef, email }: { handleRef: Ref<PayHandle | null>; email: string }) {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(handleRef, () => ({
    async validate() {
      if (!stripe || !elements) return { ok: false, error: 'The payment form is still loading. Try again in a moment.' };
      const { error } = await elements.submit();
      return error ? { ok: false, error: error.message ?? 'Check your payment details.' } : { ok: true };
    },
    async confirm({ donationId, clientSecret }) {
      if (!stripe || !elements || !clientSecret) return { ok: false, error: 'Payments are not available right now.' };
      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: `${window.location.origin}/give/success/${donationId}`, receipt_email: email || undefined },
        redirect: 'if_required',
      });
      if (error) {
        await fetch('/api/give/failed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ donationId, code: error.decline_code ?? error.code }) }).catch(() => {});
        return { ok: false, error: plain(error.decline_code ?? error.code, error.message) };
      }
      return { ok: true };
    },
  }));

  return <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }} />;
}

function plain(code?: string, fallback?: string) {
  switch (code) {
    case 'card_declined':
    case 'generic_decline':
      return 'Your card was declined. Try a different card.';
    case 'insufficient_funds':
      return 'The card has insufficient funds. Try a different card.';
    case 'expired_card':
      return 'The card has expired. Check the date or use a different card.';
    case 'incorrect_cvc':
      return "The security code doesn't match.";
    default:
      return fallback ?? 'The payment did not go through. Try again.';
  }
}
