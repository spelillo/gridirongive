import { FEES } from '@/config/fees';
import { money, quoteGift } from '@/lib/domain/money';

/** The fee formula in words, from the single fee config. */
export function feeFormula(): string {
  const fixed = money(FEES.platformFixedCents).replace(/\.00$/, '');
  const pct = `${FEES.platformBasisPoints / 100}%`;
  const sPct = `${FEES.stripeBasisPoints / 100}%`;
  const sFixed = `${FEES.stripeFixedCents}¢`;
  return `${fixed} + ${pct} per gift for Gridiron Give, plus Stripe's card fee of ${sPct} + ${sFixed}`;
}

export function feeExample(giftCents = 10000) {
  const covered = quoteGift(giftCents, true);
  const notCovered = quoteGift(giftCents, false);
  return { covered, notCovered };
}
