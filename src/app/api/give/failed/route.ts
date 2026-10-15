import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasDonorAccess } from '@/lib/payments/donor-access';
import { markDonationFailed } from '@/lib/payments/process';

const Body = z.object({ donationId: z.uuid(), code: z.string().max(64).nullish() });

/**
 * The browser reports a declined card so the pending gift is closed out.
 * Only a pending gift can be marked failed, and a later webhook for a
 * successful charge still wins (see the webhook handler).
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  if (!(await hasDonorAccess(parsed.data.donationId))) return NextResponse.json({ ok: false }, { status: 403 });
  await markDonationFailed(parsed.data.donationId, parsed.data.code ?? 'declined');
  return NextResponse.json({ ok: true });
}
