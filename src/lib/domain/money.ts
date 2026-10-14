import { FEES, MIN_GIFT_CENTS } from '@/config/fees';

export interface FeeQuote {
  giftCents: number;
  coverFees: boolean;
  platformFeeCents: number;
  stripeFeeCents: number;
  /** What the donor is charged. */
  totalCents: number;
  /** What reaches the team and counts toward needs. */
  netCents: number;
  /** Fees the donor pays on top of the gift (0 when not covering). */
  feesAddedCents: number;
}

export type FeeConfig = typeof FEES;

export function platformFee(giftCents: number, cfg: FeeConfig = FEES): number {
  return cfg.platformFixedCents + Math.round((giftCents * cfg.platformBasisPoints) / 10_000);
}

export function stripeFee(chargeCents: number, cfg: FeeConfig = FEES): number {
  return Math.round((chargeCents * cfg.stripeBasisPoints) / 10_000) + cfg.stripeFixedCents;
}

/**
 * Prices a gift. When the donor covers fees we gross the charge up so that,
 * after Stripe's fee and the platform fee, exactly `giftCents` reaches the
 * team. Any rounding cent is absorbed by the platform fee, never by the team.
 */
export function quoteGift(giftCents: number, coverFees: boolean, cfg: FeeConfig = FEES): FeeQuote {
  if (!Number.isInteger(giftCents) || giftCents <= 0) throw new Error('Gift must be a positive whole number of cents');
  const pf = platformFee(giftCents, cfg);
  if (!coverFees) {
    const sf = stripeFee(giftCents, cfg);
    return {
      giftCents,
      coverFees,
      platformFeeCents: pf,
      stripeFeeCents: sf,
      totalCents: giftCents,
      netCents: Math.max(giftCents - sf - pf, 0),
      feesAddedCents: 0,
    };
  }
  const rate = cfg.stripeBasisPoints / 10_000;
  let total = Math.ceil((giftCents + pf + cfg.stripeFixedCents) / (1 - rate));
  // Walk to the smallest total that still nets the full gift.
  while (total - stripeFee(total, cfg) - pf < giftCents) total += 1;
  while (total - 1 - stripeFee(total - 1, cfg) - pf >= giftCents) total -= 1;
  const sf = stripeFee(total, cfg);
  return {
    giftCents,
    coverFees,
    platformFeeCents: total - sf - giftCents,
    stripeFeeCents: sf,
    totalCents: total,
    netCents: giftCents,
    feesAddedCents: total - giftCents,
  };
}

export function isValidGift(cents: number): boolean {
  return Number.isInteger(cents) && cents >= MIN_GIFT_CENTS && cents <= 10_000_00;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** $166.21: checkout, receipts and ledgers. */
export function money(cents: number): string {
  return usd.format(cents / 100);
}

/** $140: public meters. Rounded down so a total never looks bigger than it is. */
export function moneyWhole(cents: number): string {
  return usdWhole.format(Math.floor(cents / 100));
}

/** Goals are rounded up for the same reason. */
export function moneyWholeUp(cents: number): string {
  return usdWhole.format(Math.ceil(cents / 100));
}

/** Percent funded, rounded down; 100 only when actually funded. */
export function percentFunded(raisedCents: number, goalCents: number): number {
  if (goalCents <= 0) return raisedCents > 0 ? 100 : 0;
  if (raisedCents >= goalCents) return 100;
  return Math.min(99, Math.floor((raisedCents * 100) / goalCents));
}

export function remainingCents(priceCents: number | null, raisedCents: number): number {
  if (priceCents === null) return Number.POSITIVE_INFINITY;
  return Math.max(priceCents - raisedCents, 0);
}

/** Parses "$1,234.50", "25", "25.5" into cents. Returns null when unreadable. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}
