import 'server-only';
import { cookies } from 'next/headers';
import { sign, verifySigned, receiptSig, safeEqual } from '@/lib/crypto';

/**
 * The browser that started a gift gets a signed cookie for it, so only that
 * browser can confirm it, see its success page, or report a failure.
 * Receipt links in email use a separate signature instead.
 */
const cookieName = (id: string) => `gg_d_${id.replace(/-/g, '').slice(0, 16)}`;

export async function grantDonorAccess(donationId: string) {
  (await cookies()).set(cookieName(donationId), sign('donor', donationId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function hasDonorAccess(donationId: string, sig?: string | null): Promise<boolean> {
  if (sig && safeEqual(sig, receiptSig(donationId))) return true;
  const value = (await cookies()).get(cookieName(donationId))?.value;
  return verifySigned('donor', value) === donationId;
}
