import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { stripe } from '@/lib/payments/stripe';
import { handleStripeEvent } from '@/lib/payments/webhook';

/**
 * Stripe webhook. Stripe needs two event destinations pointing here, one for
 * events on the platform account (payments, refunds, disputes) and one for
 * events on connected accounts (onboarding, payouts). Each has its own
 * signing secret: STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET.
 * See docs/SETUP.md for the event lists.
 */
export async function POST(request: Request) {
  if (!env.stripeSecretKey || !env.stripeWebhookSecrets.length) return NextResponse.json({ error: 'Stripe is not configured' }, { status: 404 });
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  let event;
  for (const secret of env.stripeWebhookSecrets) {
    try {
      event = stripe().webhooks.constructEvent(payload, signature ?? '', secret);
      break;
    } catch {
      // Try the next destination's secret.
    }
  }
  if (!event) return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  try {
    const applied = await handleStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: !applied });
  } catch (err) {
    console.error('stripe webhook failed', event.type, err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}
