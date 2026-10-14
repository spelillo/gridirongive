import 'server-only';
import { headers } from 'next/headers';
import { sha256 } from '@/lib/crypto';

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || '0.0.0.0';
}

/** Rate-limit key that never stores the raw IP. */
export async function ipKey(scope: string): Promise<string> {
  return sha256(`${scope}:${await clientIp()}`).slice(0, 32);
}

/** Approximate location from the hosting platform, used for "Teams near you". */
export async function approxLocation(): Promise<{ zip?: string; state?: string }> {
  const h = await headers();
  const zip = h.get('x-vercel-ip-postal-code') ?? undefined;
  const country = h.get('x-vercel-ip-country');
  const region = h.get('x-vercel-ip-country-region') ?? undefined;
  if (country && country !== 'US') return {};
  return { zip: zip && /^\d{5}$/.test(zip) ? zip : undefined, state: region && /^[A-Z]{2}$/.test(region) ? region : undefined };
}
