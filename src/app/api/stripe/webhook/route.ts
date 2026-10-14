import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { stripe } from '@/lib/payments/stripe';
import { handleStripeEvent } from '@/lib/payments/webhook';

/**
 * Stripe webhook. Register https://<your domain>/api/stripe/webhook in the
 * Stripe dashboard with "Listen to events on Connected accounts" turned on
 * (see docs/SETUP.md for the event list).
 */
export async function POST(request: Request) {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) return NextResponse.json({ error: 'Stripe is not configured' }, { status: 404 });
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature ?? '', env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }
  try {
    const applied = await handleStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: !applied });
  } catch (err) {
    console.error('stripe webhook failed', event.type, err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}
