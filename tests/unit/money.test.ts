import { describe, it, expect } from 'vitest';
import {
  platformFee,
  stripeFee,
  quoteGift,
  isValidGift,
  money,
  moneyWhole,
  moneyWholeUp,
  percentFunded,
  remainingCents,
  parseDollarsToCents,
  type FeeConfig,
} from '@/lib/domain/money';
import { FEES, MIN_GIFT_CENTS } from '@/config/fees';

describe('fee config', () => {
  it('defaults to $1 + 1% platform fee and standard Stripe pricing', () => {
    expect(FEES).toEqual({ platformFixedCents: 100, platformBasisPoints: 100, stripeFixedCents: 30, stripeBasisPoints: 290 });
    expect(MIN_GIFT_CENTS).toBe(500);
  });
});

describe('platformFee', () => {
  it('is $1 plus 1% of the gift', () => {
    expect(platformFee(10_000)).toBe(200);
    expect(platformFee(500)).toBe(105);
    expect(platformFee(16_000)).toBe(260);
  });
  it('rounds the percentage half up to the nearest cent', () => {
    expect(platformFee(2_550)).toBe(126); // 25.5 -> 26
    expect(platformFee(2_549)).toBe(125); // 25.49 -> 25
  });
  it('uses the passed config', () => {
    const cfg: FeeConfig = { platformFixedCents: 0, platformBasisPoints: 500, stripeFixedCents: 0, stripeBasisPoints: 0 };
    expect(platformFee(10_000, cfg)).toBe(500);
  });
});

describe('stripeFee', () => {
  it('is 2.9% + 30 cents', () => {
    expect(stripeFee(10_000)).toBe(320);
    expect(stripeFee(500)).toBe(45); // 14.5 -> 15, + 30
    expect(stripeFee(0)).toBe(30);
  });
});

describe('quoteGift', () => {
  it('without covering fees charges the gift and takes fees out of it', () => {
    const q = quoteGift(10_000, false);
    expect(q).toEqual({
      giftCents: 10_000,
      coverFees: false,
      platformFeeCents: 200,
      stripeFeeCents: 320,
      totalCents: 10_000,
      netCents: 9_480,
      feesAddedCents: 0,
    });
  });

  it('when covering fees grosses up so the full gift reaches the team', () => {
    const q = quoteGift(10_000, true);
    expect(q.totalCents).toBe(10_536);
    expect(q.stripeFeeCents).toBe(336);
    expect(q.platformFeeCents).toBe(200);
    expect(q.netCents).toBe(10_000);
    expect(q.feesAddedCents).toBe(536);
  });

  it('matches the $160 checkout example', () => {
    const q = quoteGift(16_000, true);
    expect(q.totalCents).toBe(16_777);
    expect(q.netCents).toBe(16_000);
    expect(q.feesAddedCents).toBe(777);
    expect(money(q.totalCents)).toBe('$167.77');
  });

  it('always picks the smallest total that still nets the full gift', () => {
    for (let gift = 500; gift <= 60_000; gift += 137) {
      const q = quoteGift(gift, true);
      const pf = platformFee(gift);
      expect(q.totalCents - stripeFee(q.totalCents) - pf).toBeGreaterThanOrEqual(gift);
      expect(q.totalCents - 1 - stripeFee(q.totalCents - 1) - pf).toBeLessThan(gift);
      // The parts add up and the platform fee absorbs any rounding cent.
      expect(q.totalCents).toBe(q.giftCents + q.platformFeeCents + q.stripeFeeCents);
      expect(q.platformFeeCents).toBeGreaterThanOrEqual(pf);
      expect(q.platformFeeCents - pf).toBeLessThanOrEqual(1);
      expect(q.stripeFeeCents).toBe(stripeFee(q.totalCents));
    }
  });

  it('never returns a negative net when fees exceed a tiny gift', () => {
    const q = quoteGift(50, false);
    expect(q.netCents).toBe(0);
  });

  it('rejects non-integer or non-positive amounts', () => {
    expect(() => quoteGift(0, true)).toThrow();
    expect(() => quoteGift(-500, false)).toThrow();
    expect(() => quoteGift(10.5, true)).toThrow();
    expect(() => quoteGift(Number.NaN, true)).toThrow();
  });

  it('honors a custom config', () => {
    const cfg: FeeConfig = { platformFixedCents: 0, platformBasisPoints: 0, stripeFixedCents: 0, stripeBasisPoints: 0 };
    expect(quoteGift(1_000, true, cfg)).toMatchObject({ totalCents: 1_000, netCents: 1_000, feesAddedCents: 0, platformFeeCents: 0, stripeFeeCents: 0 });
  });
});

describe('isValidGift', () => {
  it('accepts $5 up to $10,000 in whole cents', () => {
    expect(isValidGift(500)).toBe(true);
    expect(isValidGift(1_000_000)).toBe(true);
    expect(isValidGift(2_501)).toBe(true);
  });
  it('rejects amounts under $5, over $10,000, or fractional', () => {
    expect(isValidGift(499)).toBe(false);
    expect(isValidGift(0)).toBe(false);
    expect(isValidGift(1_000_001)).toBe(false);
    expect(isValidGift(500.5)).toBe(false);
    expect(isValidGift(Number.NaN)).toBe(false);
  });
});

describe('money formatting', () => {
  it('money shows dollars and cents with separators', () => {
    expect(money(16_621)).toBe('$166.21');
    expect(money(0)).toBe('$0.00');
    expect(money(5)).toBe('$0.05');
    expect(money(123_456_789)).toBe('$1,234,567.89');
    expect(money(-2_500)).toBe('-$25.00');
  });
  it('moneyWhole rounds down and moneyWholeUp rounds up', () => {
    expect(moneyWhole(14_099)).toBe('$140');
    expect(moneyWhole(14_000)).toBe('$140');
    expect(moneyWholeUp(30_001)).toBe('$301');
    expect(moneyWholeUp(30_000)).toBe('$300');
    expect(moneyWhole(150_000_00)).toBe('$150,000');
  });
});

describe('percentFunded', () => {
  it('rounds down and only shows 100 when actually funded', () => {
    expect(percentFunded(14_000, 30_000)).toBe(46);
    expect(percentFunded(29_999, 30_000)).toBe(99);
    expect(percentFunded(30_000, 30_000)).toBe(100);
    expect(percentFunded(40_000, 30_000)).toBe(100);
    expect(percentFunded(0, 30_000)).toBe(0);
  });
  it('handles a zero goal', () => {
    expect(percentFunded(0, 0)).toBe(0);
    expect(percentFunded(100, 0)).toBe(100);
  });
});

describe('remainingCents', () => {
  it('is never negative and infinite for the team fund', () => {
    expect(remainingCents(30_000, 14_000)).toBe(16_000);
    expect(remainingCents(30_000, 31_000)).toBe(0);
    expect(remainingCents(null, 500)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('parseDollarsToCents', () => {
  it.each([
    ['25', 2_500],
    ['25.5', 2_550],
    ['25.50', 2_550],
    ['25.05', 2_505],
    ['25.', 2_500],
    ['$1,234.50', 123_450],
    [' $ 40 ', 4_000],
    ['0', 0],
    ['0.99', 99],
    ['007', 700],
  ])('parses %j as %i cents', (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });

  it.each(['', '   ', 'abc', '25.555', '.5', '-5', '1e3', '25.5.5', '12a', '$'])('returns null for %j', (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });
});
