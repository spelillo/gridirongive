import { NextResponse } from 'next/server';
import { GiftRequest, createGift } from '@/lib/payments/checkout';
import { grantDonorAccess } from '@/lib/payments/donor-access';
import { getUser } from '@/lib/auth/session';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = GiftRequest.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message ?? 'Check the form and try again.', field: issue?.path[0] }, { status: 400 });
  }
  const user = await getUser();
  const result = await createGift(parsed.data, user?.id ?? null);
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  await grantDonorAccess(result.donationId);
  return NextResponse.json(result);
}
