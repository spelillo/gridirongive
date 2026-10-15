/**
 * Fee configuration. This is the one place the platform fee is defined.
 *
 * Default: $1.00 + 1% of the gift, matching the old prototype. Override with
 * PLATFORM_FEE_FIXED_CENTS and PLATFORM_FEE_BASIS_POINTS (100 bps = 1%).
 * The Stripe numbers are Stripe's standard US card pricing; change them if
 * your Stripe account has different rates.
 */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name] ?? process.env[`NEXT_PUBLIC_${name}`];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export const FEES = {
  platformFixedCents: intFromEnv('PLATFORM_FEE_FIXED_CENTS', 100),
  platformBasisPoints: intFromEnv('PLATFORM_FEE_BASIS_POINTS', 100),
  stripeFixedCents: intFromEnv('STRIPE_FEE_FIXED_CENTS', 30),
  stripeBasisPoints: intFromEnv('STRIPE_FEE_BASIS_POINTS', 290),
} as const;

export const MIN_GIFT_CENTS = 500;
