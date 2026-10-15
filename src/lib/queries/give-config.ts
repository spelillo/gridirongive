import 'server-only';
import { cookies } from 'next/headers';
import { sys } from '@/lib/db';
import { env, mode, paymentsAvailable } from '@/lib/env';
import { FEES, MIN_GIFT_CENTS } from '@/config/fees';
import { athleteDisplayName } from '@/lib/domain/names';
import { acceptsGifts, type PublicTeam } from '@/lib/queries/public';
import type { GiveConfig, GiveNeed } from '@/components/give/types';

/**
 * Data for the give sheet. `athleteIds` limits which athletes' needs are
 * included (the page must already have checked access to them); team needs
 * and the team fund are always included.
 */
export async function giveConfig(team: PublicTeam, athleteIds: string[]): Promise<GiveConfig> {
  const rows = await sys.query<any>(
    `select n.id, n.athlete_id, n.kind, n.name, n.variant, c.category, n.price_cents, n.raised_cents, n.status,
       a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name
     from needs n left join gear_catalog c on c.id = n.catalog_id left join athletes a on a.id = n.athlete_id
     join teams t on t.id = n.team_id
     where n.team_id = $1 and n.season_id = t.current_season_id and n.status <> 'removed' and n.request_status = 'approved'
       and (n.athlete_id is null or (n.athlete_id = any($2::uuid[]) and a.status = 'live'))`,
    [team.id, athleteIds],
  );
  const needs: GiveNeed[] = rows.map((r) => ({
    id: r.id,
    athleteId: r.athlete_id,
    athleteName: r.athlete_id ? athleteDisplayName(r, r.pub_preferred_name) : null,
    kind: r.kind,
    name: r.name,
    variant: r.variant,
    category: r.category,
    priceCents: r.price_cents,
    raisedCents: r.raised_cents,
    status: r.status,
  }));
  const t = await sys.one<{ require_message_approval: boolean; stripe_account_id: string | null }>(
    `select require_message_approval, stripe_account_id from teams where id = $1`,
    [team.id],
  );
  const store = await cookies();
  return {
    team: {
      id: team.id,
      name: team.name,
      slug: team.slug,
      color: team.color ?? null,
      acceptsGifts: acceptsGifts(team) && paymentsAvailable(),
      requireMessageApproval: t?.require_message_approval ?? true,
      stripeAccountId: mode.payments === 'stripe' ? t?.stripe_account_id ?? null : null,
    },
    teamFundNeedId: team.team_fund_need_id,
    needs,
    payments: { mode: mode.payments, publishableKey: env.stripePublishableKey ?? null },
    fees: FEES,
    minGiftCents: MIN_GIFT_CENTS,
    sourceToken: store.get('gg_src')?.value ?? null,
  };
}
