import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mode } from '@/lib/env';
import { hasDonorAccess } from '@/lib/payments/donor-access';
import { markDonationFailed, markDonationSucceeded } from '@/lib/payments/process';

const Body = z.object({ donationId: z.uuid(), cardNumber: z.string().regex(/^\d{12,19}$/) });

/** Test card numbers behave like Stripe's test cards. */
const DECLINES: Record<string, { reason: string; error: string }> = {
  '4000000000000002': { reason: 'card_declined', error: 'Your card was declined. Try a different card.' },
  '4000000000009995': { reason: 'insufficient_funds', error: 'The card has insufficient funds. Try a different card.' },
  '4000000000000069': { reason: 'expired_card', error: 'The card has expired. Check the date or use a different card.' },
};

/** Simulated checkout. Only exists when Stripe isn't configured. */
export async function POST(request: Request) {
  if (mode.payments !== 'simulated') return NextResponse.json({ ok: false, error: 'Not available.' }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "The card number isn't complete." }, { status: 400 });
  const { donationId, cardNumber } = parsed.data;
  if (!(await hasDonorAccess(donationId))) return NextResponse.json({ ok: false, error: 'This payment has expired. Start again.' }, { status: 403 });

  const decline = DECLINES[cardNumber];
  if (decline) {
    await markDonationFailed(donationId, decline.reason);
    return NextResponse.json({ ok: false, error: decline.error }, { status: 402 });
  }
  const brand = cardNumber.startsWith('4') ? 'visa' : cardNumber.startsWith('5') ? 'mastercard' : cardNumber.startsWith('3') ? 'amex' : 'card';
  await markDonationSucceeded({ donationId, paymentIntentId: `sim_${donationId.slice(0, 8)}`, cardBrand: brand, cardLast4: cardNumber.slice(-4) });
  return NextResponse.json({ ok: true });
}
