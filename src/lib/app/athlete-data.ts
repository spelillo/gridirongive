import 'server-only';
import { asUser } from '@/lib/db';

export interface EditNeed {
  id: string;
  name: string;
  variant: string | null;
  sizes: string[];
  priceCents: number;
  raisedCents: number;
  status: string;
  requestStatus: string;
  requestReason: string | null;
  whyNote: string | null;
  pinX: number | null;
  pinY: number | null;
  sort: number;
  purchasedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
}

/** The athlete's needs for the current season, including turned-off items, as the signed-in person sees them. */
export async function athleteNeeds(userId: string, athleteId: string): Promise<EditNeed[]> {
  const rows = await asUser(userId, (tx) =>
    tx.query<any>(
      `select n.id, n.name, n.variant, coalesce(c.sizes, '{}') as sizes, n.price_cents, n.raised_cents, n.status, n.request_status, n.request_reason,
         n.why_note, n.pin_x, n.pin_y, n.sort, n.purchased_at, n.delivered_at, n.updated_at
       from needs n join athletes a on a.id = n.athlete_id join teams t on t.id = a.team_id left join gear_catalog c on c.id = n.catalog_id
       where n.athlete_id = $1 and n.season_id = t.current_season_id and not (n.request_status = 'rejected')
         and not (n.status = 'removed' and n.request_status = 'pending')
       order by n.sort, n.created_at`,
      [athleteId],
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    variant: r.variant,
    sizes: r.sizes,
    priceCents: r.price_cents ?? 0,
    raisedCents: r.raised_cents,
    status: r.status,
    requestStatus: r.request_status,
    requestReason: r.request_reason,
    whyNote: r.why_note,
    pinX: r.pin_x,
    pinY: r.pin_y,
    sort: r.sort,
    purchasedAt: r.purchased_at ? new Date(r.purchased_at).toISOString() : null,
    deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function catalogFor(userId: string, sport: string) {
  return asUser(userId, (tx) =>
    tx.query<{ id: string; name: string; category: string; sizes: string[]; default_price_cents: number }>(
      `select id, name, category, sizes, default_price_cents from gear_catalog where sport = $1 and active order by sort, name`,
      [sport],
    ),
  );
}
