import { getUser } from '@/lib/auth/session';
import { asUser } from '@/lib/db';
import { groupBuyList, toCsv } from '@/lib/domain/buylist';
import { athleteDisplayName } from '@/lib/domain/names';

/** "Export list" on the buy list (ui-ux-spec 8.9): totals by item and size, then one row per player. */
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const user = await getUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(teamId)) return new Response('Not found', { status: 404 });
  const out = await asUser(user.id, async (tx) => {
    const t = await tx.one<{ member: boolean; slug: string; season: string | null }>(
      `select is_team_member(id) as member, slug, current_season_id as season from teams where id = $1`,
      [teamId],
    );
    if (!t?.member) return null;
    const needs = await tx.query<any>(
      `select n.id, n.name, n.variant, n.raised_cents, n.price_cents, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, a.jersey
       from needs n left join athletes a on a.id = n.athlete_id
       where n.team_id = $1 and n.season_id = $2 and n.kind <> 'team_fund' and n.status = 'funded' and n.request_status = 'approved'
       order by n.name, a.first_name`,
      [teamId, t.season],
    );
    return { slug: t.slug, needs };
  });
  if (!out) return new Response('Not found', { status: 404 });
  const who = (n: any) => (n.first_name ? `${athleteDisplayName(n)}${n.jersey ? ` #${n.jersey}` : ''}` : 'Team');
  const groups = groupBuyList(out.needs.map((n: any) => ({ id: n.id, name: n.name, variant: n.variant, raised_cents: n.raised_cents, price_cents: n.price_cents, athlete_name: who(n) })));
  const rows: (string | number)[][] = [['Item', 'Size', 'Quantity', 'Available']];
  for (const g of groups) {
    for (const s of g.sizes) {
      const cents = g.needs.filter((n) => (n.variant?.trim() || 'No size') === s.size).reduce((x, n) => x + n.raised_cents, 0);
      rows.push([g.name, s.size, s.count, (cents / 100).toFixed(2)]);
    }
  }
  rows.push([], ['Item', 'Size', 'Player', 'Available']);
  for (const g of groups) for (const n of g.needs) rows.push([g.name, n.variant ?? '', n.athlete_name, (n.raised_cents / 100).toFixed(2)]);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${toCsv(rows)}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${out.slug}-buy-list-${day}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
