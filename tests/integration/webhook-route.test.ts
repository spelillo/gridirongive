import { describe, it, expect, beforeAll, vi } from 'vitest';
import Stripe from 'stripe';
import { freshDb } from '../support/db';

// Two event destinations, two signing secrets (platform and connected accounts).
// Hoisted so the values are in place before env.ts is first imported.
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_route_only';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_platform_test';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_test';
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { POST } = await import('@/app/api/stripe/webhook/route');
const stripe = new Stripe('sk_test_route_only');

beforeAll(async () => {
  await freshDb();
});

const post = (payload: string, signature: string) =>
  POST(new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));

const eventPayload = (id: string) => JSON.stringify({ id, object: 'event', type: 'customer.created', data: { object: { id: 'cus_1' } }, created: 1, livemode: false });

describe('stripe webhook route', () => {
  it('accepts events signed by either destination', async () => {
    for (const [id, secret] of [['evt_platform_1', 'whsec_platform_test'], ['evt_connect_1', 'whsec_connect_test']]) {
      const payload = eventPayload(id);
      const res = await post(payload, stripe.webhooks.generateTestHeaderString({ payload, secret }));
      expect(res.status, id).toBe(200);
    }
  });

  it('rejects a bad signature', async () => {
    const payload = eventPayload('evt_forged');
    const res = await post(payload, stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_someone_else' }));
    expect(res.status).toBe(400);
  });

  it('treats a repeated event as a duplicate', async () => {
    const payload = eventPayload('evt_platform_1');
    const res = await post(payload, stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_platform_test' }));
    expect(await res.json()).toEqual({ received: true, duplicate: true });
  });
});
