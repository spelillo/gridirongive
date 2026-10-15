/**
 * Splits a successful gift across needs. Pure function: the payment
 * processor loads the current need state (locked), calls this, and writes the
 * result as allocation rows.
 *
 * Rules (rebuild-architecture.md, Money rules):
 * - A need never takes more than what's left on it.
 * - Money aimed at an athlete in general fills their open needs, smallest
 *   remaining first.
 * - Anything that can't land on its target goes to the team fund. The donor
 *   is told in advance when they choose to send extra, and by email when a
 *   need filled up while they were paying.
 * - The total allocated is the net amount (the gift when fees are covered,
 *   or the gift minus fees when not). Lines are filled in order.
 */
export interface NeedState {
  id: string;
  athleteId: string | null;
  kind: 'athlete' | 'team' | 'team_fund';
  priceCents: number | null;
  raisedCents: number;
  status: string;
  sort: number;
}

export interface GiftLine {
  needId?: string | null;
  athleteId?: string | null;
  requestedCents: number;
}

export interface AllocationResult {
  allocations: { needId: string; amountCents: number; overflow: boolean }[];
  /** Cents that went to the team fund because the target couldn't take them. */
  overflowCents: number;
}

const OPEN = new Set(['open', 'partially_funded']);

export function needRemaining(n: NeedState): number {
  if (n.kind === 'team_fund') return Number.POSITIVE_INFINITY;
  if (!OPEN.has(n.status) || n.priceCents === null) return 0;
  return Math.max(n.priceCents - n.raisedCents, 0);
}

export function allocateGift(lines: GiftLine[], needs: NeedState[], netCents: number): AllocationResult {
  const teamFund = needs.find((n) => n.kind === 'team_fund');
  if (!teamFund) throw new Error('Team fund need is missing');
  const state = new Map(needs.map((n) => [n.id, { ...n }]));
  const out = new Map<string, { amountCents: number; overflow: boolean }>();
  let budget = netCents;
  let overflowCents = 0;

  const give = (need: NeedState, amount: number, overflow: boolean) => {
    if (amount <= 0) return;
    need.raisedCents += amount;
    const prev = out.get(need.id);
    out.set(need.id, { amountCents: (prev?.amountCents ?? 0) + amount, overflow: (prev?.overflow ?? false) || overflow });
  };
  const fund = state.get(teamFund.id)!;

  for (const line of lines) {
    if (budget <= 0) break;
    let want = Math.min(line.requestedCents, budget);
    budget -= want;

    if (line.needId) {
      const need = state.get(line.needId);
      if (need && need.kind !== 'team_fund') {
        const take = Math.min(want, needRemaining(need));
        give(need, take, false);
        want -= take;
      } else if (need && need.kind === 'team_fund') {
        give(fund, want, false);
        want = 0;
      }
    } else if (line.athleteId) {
      const open = [...state.values()]
        .filter((n) => n.athleteId === line.athleteId && needRemaining(n) > 0)
        .sort((a, b) => needRemaining(a) - needRemaining(b) || a.sort - b.sort);
      for (const need of open) {
        if (want <= 0) break;
        const take = Math.min(want, needRemaining(need));
        give(need, take, false);
        want -= take;
      }
    } else {
      give(fund, want, false);
      want = 0;
    }

    if (want > 0) {
      give(fund, want, true);
      overflowCents += want;
    }
  }
  // Only possible when the lines ask for less than the net amount.
  if (budget > 0) {
    give(fund, budget, true);
    overflowCents += budget;
  }

  return {
    allocations: [...out.entries()].map(([needId, v]) => ({ needId, ...v })),
    overflowCents,
  };
}
