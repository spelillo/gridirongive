import 'server-only';
import type { Queryable } from '@/lib/db';

type Q = Pick<Queryable, 'query'>;

/** Ledger filters (ui-ux-spec 8.8). All optional; read from searchParams. */
export interface DonationFilters {
  from?: string;
  to?: string;
  athlete?: string;
  item?: string;
  status?: string;
  q?: string;
  page?: number;
}

export const LEDGER_STATUSES = ['succeeded', 'refunded', 'disputed', 'pending', 'failed'] as const;
export const PAGE_SIZE = 50;

const isDate = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
const isUuid = (s?: string) => Boolean(s && /^[0-9a-f-]{36}$/.test(s));

export function parseDonationFilters(sp: Record<string, string | string[] | undefined>): DonationFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const page = Number(one('page') ?? '1');
  return {
    from: isDate(one('from')) ? one('from') : undefined,
    to: isDate(one('to')) ? one('to') : undefined,
    athlete: one('athlete') === 'team' || isUuid(one('athlete')) ? one('athlete') : undefined,
    item: one('item')?.slice(0, 80),
    status: (LEDGER_STATUSES as readonly string[]).includes(one('status') ?? '') || one('status') === 'any' ? one('status') : undefined,
    q: one('q')?.slice(0, 80),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Query string for links that keep the current filters. */
export function filterQuery(f: DonationFilters, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams();
  const all: Record<string, string | number | undefined> = { from: f.from, to: f.to, athlete: f.athlete, item: f.item, status: f.status, q: f.q, ...extra };
  for (const [k, v] of Object.entries(all)) {
    if (v !== undefined && v !== '' && !(k === 'page' && Number(v) === 1)) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * WHERE clause for the ledger. Donor email search is only allowed for coach
 * and staff, since viewers never see emails.
 */
export function donationWhere(teamId: string, f: DonationFilters, canEdit: boolean): { sql: string; params: unknown[] } {
  const params: unknown[] = [teamId];
  const parts = ['d.team_id = $1'];
  const add = (fn: (p: string) => string, v: unknown) => {
    params.push(v);
    parts.push(fn(`$${params.length}`));
  };
  if (!f.status) parts.push(`d.status in ('succeeded', 'refunded', 'disputed')`);
  else if (f.status !== 'any') add((p) => `d.status = ${p}::donation_status`, f.status);
  if (f.from) add((p) => `d.created_at >= ${p}::date`, f.from);
  if (f.to) add((p) => `d.created_at < (${p}::date + 1)`, f.to);
  if (f.athlete === 'team') parts.push('d.athlete_id is null');
  else if (f.athlete) add((p) => `d.athlete_id = ${p}::uuid`, f.athlete);
  if (f.item) {
    add(
      (p) => `(exists (select 1 from allocations al join needs n on n.id = al.need_id where al.donation_id = d.id and n.name = ${p})
        or exists (select 1 from donation_lines dl join needs n on n.id = dl.need_id where dl.donation_id = d.id and n.name = ${p}))`,
      f.item,
    );
  }
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    if (canEdit) add((p) => `(d.donor_name ilike ${p} or d.donor_email ilike ${p})`, like);
    else add((p) => `(d.show_name and d.donor_name ilike ${p})`, like);
  }
  return { sql: parts.join(' and '), params };
}

export interface LedgerRow {
  id: string;
  created_at: Date;
  donor_name: string;
  donor_email: string;
  show_name: boolean;
  athlete_id: string | null;
  athlete_first: string | null;
  athlete_last: string | null;
  athlete_preferred: string | null;
  athlete_full: boolean | null;
  items: string | null;
  gift_cents: number;
  fees_cents: number;
  cover_fees: boolean;
  net_cents: number;
  status: string;
  message: string | null;
  message_status: string;
  target: string;
}

export function ledgerSelect(where: string) {
  return `select d.id, d.created_at, d.donor_name, d.donor_email, d.show_name, d.athlete_id,
      a.first_name as athlete_first, a.last_name as athlete_last, a.preferred_name as athlete_preferred, a.show_full_last_name as athlete_full,
      coalesce(
        (select string_agg(distinct n.name, ', ') from allocations al join needs n on n.id = al.need_id where al.donation_id = d.id),
        (select string_agg(distinct coalesce(n.name, case when dl.athlete_id is null then 'Team fund' else 'Open items' end), ', ')
           from donation_lines dl left join needs n on n.id = dl.need_id where dl.donation_id = d.id)
      ) as items,
      d.gift_cents, (d.total_cents - d.gift_cents) as fees_cents, d.cover_fees, d.net_cents, d.status, d.message, d.message_status, d.target
    from donations d left join athletes a on a.id = d.athlete_id
    where ${where}`;
}

export async function ledgerTotals(tx: Q, where: { sql: string; params: unknown[] }) {
  const rows = await tx.query<{ n: number; gift: number; fees: number; net: number }>(
    `select count(*)::int as n, coalesce(sum(d.gift_cents), 0)::int as gift,
       coalesce(sum(d.total_cents - d.gift_cents) filter (where d.cover_fees), 0)::int as fees, coalesce(sum(d.net_cents), 0)::int as net
     from donations d where ${where.sql}`,
    where.params,
  );
  return rows[0] ?? { n: 0, gift: 0, fees: 0, net: 0 };
}

/** What a donor sees on public pages: their name, or "Anonymous". */
export function donorDisplay(r: { donor_name: string; show_name: boolean }) {
  return r.show_name ? r.donor_name : 'Anonymous';
}

/** The team fund for a season and what is still unspent in it. */
export async function teamFund(tx: Q, teamId: string, seasonId: string | null) {
  if (!seasonId) return null;
  const rows = await tx.query<{ id: string; raised_cents: number; spent_cents: number }>(
    `select n.id, n.raised_cents,
       coalesce((select sum(pn.amount_cents) from purchase_needs pn where pn.need_id = n.id), 0)::int as spent_cents
     from needs n where n.team_id = $1 and n.season_id = $2 and n.kind = 'team_fund'`,
    [teamId, seasonId],
  );
  const f = rows[0];
  if (!f) return null;
  return { id: f.id, raisedCents: f.raised_cents, spentCents: f.spent_cents, availableCents: Math.max(f.raised_cents - f.spent_cents, 0) };
}

/** Money in the team's care that hasn't been spent yet (earmarked plus team fund), across every season. */
export async function fundsHeld(tx: Q, teamId: string) {
  const rows = await tx.query<{ earmarked: number; fund: number }>(
    `select
       coalesce(sum(n.raised_cents) filter (where n.kind <> 'team_fund' and n.status not in ('purchased', 'delivered')), 0)::int as earmarked,
       coalesce(sum(greatest(n.raised_cents - coalesce((select sum(pn.amount_cents) from purchase_needs pn where pn.need_id = n.id), 0), 0))
         filter (where n.kind = 'team_fund'), 0)::int as fund
     from needs n where n.team_id = $1`,
    [teamId],
  );
  const r = rows[0] ?? { earmarked: 0, fund: 0 };
  return { earmarkedCents: r.earmarked, fundCents: r.fund, totalCents: r.earmarked + r.fund };
}
