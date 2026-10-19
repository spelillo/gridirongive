import { it, expect } from 'vitest';
import { stripeRefundParams } from '@/lib/payments/stripe';

it('refunds take the gift back from the team account', () => {
  expect(stripeRefundParams('pi_123', 'd-1')).toEqual({
    payment_intent: 'pi_123',
    reason: 'requested_by_customer',
    reverse_transfer: true,
    metadata: { donation_id: 'd-1' },
  });
});
