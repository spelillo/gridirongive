import { describe, it, expect } from 'vitest';
import { allocateGift, needRemaining, type NeedState } from '@/lib/domain/allocation';

const fund: NeedState = { id: 'fund', athleteId: null, kind: 'team_fund', priceCents: null, raisedCents: 0, status: 'open', sort: 0 };
const need = (id: string, price: number, raised = 0, o: Partial<NeedState> = {}): NeedState => ({
  id, athleteId: 'jayden', kind: 'athlete', priceCents: price, raisedCents: raised,
  status: raised >= price ? 'funded' : raised > 0 ? 'partially_funded' : 'open', sort: 1, ...o,
});
const byId = (r: ReturnType<typeof allocateGift>) => Object.fromEntries(r.allocations.map((a) => [a.needId, a]));
const total = (r: ReturnType<typeof allocateGift>) => r.allocations.reduce((s, a) => s + a.amountCents, 0);

describe('needRemaining', () => {
  it('is price minus raised for open needs', () => {
    expect(needRemaining(need('h', 30_000, 14_000))).toBe(16_000);
  });
  it('is zero for funded, purchased, delivered or removed needs', () => {
    expect(needRemaining(need('h', 30_000, 30_000))).toBe(0);
    for (const status of ['funded', 'purchased', 'delivered', 'removed']) {
      expect(needRemaining(need('h', 30_000, 0, { status }))).toBe(0);
    }
  });
  it('is unlimited for the team fund', () => {
    expect(needRemaining(fund)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('allocateGift', () => {
  it('requires a team fund', () => {
    expect(() => allocateGift([], [need('h', 1000)], 500)).toThrow(/Team fund/);
  });

  it('puts a single-need gift on that need', () => {
    const r = allocateGift([{ needId: 'helmet', requestedCents: 5_000 }], [fund, need('helmet', 30_000, 14_000)], 5_000);
    expect(r).toEqual({ allocations: [{ needId: 'helmet', amountCents: 5_000, overflow: false }], overflowCents: 0 });
  });

  it('caps a need at what is left and overflows the rest to the team fund', () => {
    const r = allocateGift([{ needId: 'helmet', requestedCents: 20_000 }], [fund, need('helmet', 30_000, 14_000)], 20_000);
    expect(byId(r).helmet).toEqual({ needId: 'helmet', amountCents: 16_000, overflow: false });
    expect(byId(r).fund).toEqual({ needId: 'fund', amountCents: 4_000, overflow: true });
    expect(r.overflowCents).toBe(4_000);
  });

  it('sends everything to the fund when the need filled up while paying', () => {
    const r = allocateGift([{ needId: 'helmet', requestedCents: 5_000 }], [fund, need('helmet', 30_000, 30_000)], 5_000);
    expect(r.allocations).toEqual([{ needId: 'fund', amountCents: 5_000, overflow: true }]);
    expect(r.overflowCents).toBe(5_000);
  });

  it('overflows when the target need is unknown', () => {
    const r = allocateGift([{ needId: 'gone', requestedCents: 1_000 }], [fund], 1_000);
    expect(r.allocations).toEqual([{ needId: 'fund', amountCents: 1_000, overflow: true }]);
  });

  it('fund the rest: fills each picked need to its remaining amount', () => {
    const needs = [fund, need('helmet', 30_000, 14_000), need('cleats', 9_000, 2_500, { sort: 2 }), need('gloves', 4_000, 0, { sort: 3 })];
    const lines = [
      { needId: 'helmet', requestedCents: 16_000 },
      { needId: 'cleats', requestedCents: 6_500 },
      { needId: 'gloves', requestedCents: 4_000 },
    ];
    const r = allocateGift(lines, needs, 26_500);
    expect(r.allocations.map((a) => [a.needId, a.amountCents])).toEqual([['helmet', 16_000], ['cleats', 6_500], ['gloves', 4_000]]);
    expect(r.overflowCents).toBe(0);
    expect(total(r)).toBe(26_500);
  });

  it('a gift to the team fund line goes to the fund without overflow', () => {
    const r = allocateGift([{ needId: 'fund', requestedCents: 2_500 }], [fund], 2_500);
    expect(r.allocations).toEqual([{ needId: 'fund', amountCents: 2_500, overflow: false }]);
    const r2 = allocateGift([{ requestedCents: 2_500 }], [fund], 2_500);
    expect(r2.allocations).toEqual([{ needId: 'fund', amountCents: 2_500, overflow: false }]);
  });

  it('an athlete gift fills the smallest remaining need first, then by sort', () => {
    const needs = [
      fund,
      need('helmet', 30_000, 14_000, { sort: 1 }), // 16,000 left
      need('mouthguard', 1_500, 0, { sort: 2 }), // 1,500 left
      need('gloves', 4_000, 2_500, { sort: 4 }), // 1,500 left, later sort
      need('cleats', 9_000, 0, { sort: 3 }), // 9,000 left
      need('other', 1_000, 0, { athleteId: 'liam' }),
    ];
    const r = allocateGift([{ athleteId: 'jayden', requestedCents: 5_000 }], needs, 5_000);
    expect(r.allocations.map((a) => [a.needId, a.amountCents])).toEqual([['mouthguard', 1_500], ['gloves', 1_500], ['cleats', 2_000]]);
    expect(r.overflowCents).toBe(0);
  });

  it('an athlete gift larger than all open needs overflows to the fund', () => {
    const r = allocateGift([{ athleteId: 'jayden', requestedCents: 10_000 }], [fund, need('a', 3_000), need('b', 2_000)], 10_000);
    expect(byId(r).a.amountCents).toBe(3_000);
    expect(byId(r).b.amountCents).toBe(2_000);
    expect(byId(r).fund).toEqual({ needId: 'fund', amountCents: 5_000, overflow: true });
    expect(r.overflowCents).toBe(5_000);
  });

  it('never allocates more than the net amount when fees come out of the gift', () => {
    // Donor asked for $100 across two needs but $94.80 arrived.
    const lines = [{ needId: 'a', requestedCents: 6_000 }, { needId: 'b', requestedCents: 4_000 }];
    const r = allocateGift(lines, [fund, need('a', 6_000), need('b', 4_000)], 9_480);
    expect(total(r)).toBe(9_480);
    expect(byId(r).a.amountCents).toBe(6_000);
    expect(byId(r).b.amountCents).toBe(3_480);
    expect(r.overflowCents).toBe(0);
  });

  it('stops filling lines once the budget is spent', () => {
    const lines = [{ needId: 'a', requestedCents: 6_000 }, { needId: 'b', requestedCents: 4_000 }];
    const r = allocateGift(lines, [fund, need('a', 6_000), need('b', 4_000)], 5_000);
    expect(r.allocations).toEqual([{ needId: 'a', amountCents: 5_000, overflow: false }]);
  });

  it('sends leftover net to the fund when the lines ask for less', () => {
    const r = allocateGift([{ needId: 'a', requestedCents: 1_000 }], [fund, need('a', 6_000)], 1_500);
    expect(byId(r).a.amountCents).toBe(1_000);
    expect(byId(r).fund).toEqual({ needId: 'fund', amountCents: 500, overflow: true });
    expect(r.overflowCents).toBe(500);
  });

  it('merges repeated allocations to the same need and keeps the overflow flag', () => {
    const lines = [{ needId: 'fund', requestedCents: 1_000 }, { needId: 'a', requestedCents: 3_000 }];
    const r = allocateGift(lines, [fund, need('a', 2_000)], 4_000);
    expect(byId(r).fund).toEqual({ needId: 'fund', amountCents: 2_000, overflow: true });
    expect(byId(r).a.amountCents).toBe(2_000);
    expect(r.allocations).toHaveLength(2);
  });

  it('two lines on the same need do not over-fill it', () => {
    const lines = [{ needId: 'a', requestedCents: 1_500 }, { needId: 'a', requestedCents: 1_500 }];
    const r = allocateGift(lines, [fund, need('a', 2_000)], 3_000);
    expect(byId(r).a.amountCents).toBe(2_000);
    expect(byId(r).fund.amountCents).toBe(1_000);
  });

  it('does not mutate the input needs', () => {
    const needs = [fund, need('a', 2_000)];
    allocateGift([{ needId: 'a', requestedCents: 2_000 }], needs, 2_000);
    expect(needs[1].raisedCents).toBe(0);
    expect(needs[0].raisedCents).toBe(0);
  });

  it('allocates exactly the net amount for random inputs and never over-funds a need', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 200; trial++) {
      const needs: NeedState[] = [fund];
      for (let i = 0; i < 5; i++) {
        const price = 500 + Math.floor(rand() * 30_000);
        needs.push(need(`n${i}`, price, Math.floor(rand() * price), { sort: i, athleteId: rand() > 0.3 ? 'jayden' : 'liam' }));
      }
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () =>
        rand() > 0.5 ? { needId: `n${Math.floor(rand() * 5)}`, requestedCents: 1 + Math.floor(rand() * 20_000) } : { athleteId: 'jayden', requestedCents: 1 + Math.floor(rand() * 20_000) },
      );
      const net = Math.floor(rand() * 40_000);
      const r = allocateGift(lines, needs, net);
      expect(total(r)).toBe(Math.max(net, 0));
      for (const a of r.allocations) {
        expect(a.amountCents).toBeGreaterThan(0);
        const n = needs.find((x) => x.id === a.needId)!;
        if (n.kind !== 'team_fund') expect(a.amountCents).toBeLessThanOrEqual(n.priceCents! - n.raisedCents);
      }
      const overflow = r.allocations.filter((a) => a.needId === 'fund' && a.overflow).reduce((s, a) => s + a.amountCents, 0);
      expect(r.overflowCents).toBeLessThanOrEqual(overflow);
    }
  });
});
