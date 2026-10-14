import type { FeeConfig } from '@/lib/domain/money';

export interface GiveNeed {
  id: string;
  athleteId: string | null;
  athleteName: string | null;
  kind: 'athlete' | 'team' | 'team_fund';
  name: string;
  variant: string | null;
  category: string | null;
  priceCents: number | null;
  raisedCents: number;
  status: string;
}

export interface GiveConfig {
  team: { id: string; name: string; slug: string; acceptsGifts: boolean; requireMessageApproval: boolean; stripeAccountId: string | null };
  teamFundNeedId: string | null;
  needs: GiveNeed[];
  payments: { mode: 'stripe' | 'simulated'; publishableKey: string | null };
  fees: FeeConfig;
  minGiftCents: number;
  sourceToken: string | null;
}

export type GiveTarget =
  | { kind: 'need'; needId: string; entry: 'pin' | 'card' | 'page' }
  | { kind: 'fund_rest'; athleteId: string; athleteName: string }
  | { kind: 'athlete'; athleteId: string; athleteName: string }
  | { kind: 'team_fund' };

export function needLeft(n: GiveNeed): number {
  if (n.kind === 'team_fund' || n.priceCents === null) return Number.POSITIVE_INFINITY;
  if (n.status !== 'open' && n.status !== 'partially_funded') return 0;
  return Math.max(n.priceCents - n.raisedCents, 0);
}
