import 'server-only';
import { sys } from '@/lib/db';
import { athleteDisplayName } from '@/lib/domain/names';

/**
 * Everything a visitor can see. These run as the system role, so each query
 * names its columns explicitly and never touches athlete_contacts, donor
 * emails or anything else private. Roster and athlete functions must only be
 * called after src/lib/access.ts has confirmed access.
 */

export interface PublicTeam {
  id: string;
  slug: string;
  name: string;
  sport: string;
  level: string;
  mascot: string | null;
  city: string;
  state: string;
  zip: string | null;
  about: string;
  has_photo: boolean;
  photo_v: string | null;
  status: string;
  verification_status: string;
  verification_method: string | null;
  payouts_status: string;
  code_version: number;
  org_name: string;
  season_label: string | null;
  season_id: string | null;
  goal_cents: number;
  raised_cents: number;
  items_total: number;
  items_funded: number;
  team_fund_cents: number;
  athletes_live: number;
  team_fund_need_id: string | null;
  last_activity_at: Date;
}

const TEAM_COLUMNS = `
  t.id, t.slug, t.name, t.sport, t.level, t.mascot, t.city, t.state, t.zip, t.about,
  t.photo_path is not null as has_photo, md5(coalesce(t.photo_path, '')) as photo_v,
  t.status, t.verification_status, t.verification_method, t.payouts_status, t.code_version,
  o.name as org_name, s.label as season_label, s.id as season_id,
  coalesce(tt.goal_cents, 0) as goal_cents, coalesce(tt.raised_cents, 0) as raised_cents,
  coalesce(tt.items_total, 0) as items_total, coalesce(tt.items_funded, 0) as items_funded,
  coalesce(tt.team_fund_cents, 0) as team_fund_cents, coalesce(tt.athletes_live, 0) as athletes_live,
  (select n.id from needs n where n.team_id = t.id and n.season_id = t.current_season_id and n.kind = 'team_fund') as team_fund_need_id,
  t.last_activity_at`;

const TEAM_FROM = `
  from teams t
  join organizations o on o.id = t.org_id
  left join seasons s on s.id = t.current_season_id
  left join team_totals tt on tt.team_id = t.id`;

export async function getTeamBySlug(slug: string): Promise<PublicTeam | null> {
  return sys.one<PublicTeam>(`select ${TEAM_COLUMNS} ${TEAM_FROM} where t.slug = $1`, [slug]);
}

export async function getTeamById(id: string): Promise<PublicTeam | null> {
  return sys.one<PublicTeam>(`select ${TEAM_COLUMNS} ${TEAM_FROM} where t.id = $1`, [id]);
}

export function isPubliclyVisible(t: { status: string }) {
  return t.status === 'live' || t.status === 'season_closed';
}

export function acceptsGifts(t: { status: string; payouts_status: string }) {
  return t.status === 'live' && t.payouts_status === 'connected';
}

export interface SearchParams {
  q?: string;
  sport?: string;
  state?: string;
  openNeeds?: boolean;
  sort?: 'relevance' | 'nearest' | 'needed' | 'recent';
  zip?: string;
  limit?: number;
  offset?: number;
}

/** Team search. Covers team name, school, mascot, city and state. Never athletes. */
export async function searchTeams(p: SearchParams): Promise<{ teams: PublicTeam[]; total: number }> {
  const where = [`t.status in ('live', 'season_closed')`];
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const q = p.q?.trim().toLowerCase();
  let rank = '0';
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const term of terms) {
      const ph = add(`%${term}%`);
      where.push(`(lower(t.name) like ${ph} or lower(o.name) like ${ph} or lower(coalesce(t.mascot, '')) like ${ph} or lower(t.city) like ${ph} or lower(t.state) = ${add(term)})`);
    }
    const full = add(`${q}%`);
    rank = `(case when lower(t.name) like ${full} or lower(o.name) like ${full} then 0 else 1 end)`;
  }
  if (p.sport) where.push(`t.sport = ${add(p.sport)}`);
  if (p.state) where.push(`t.state = ${add(p.state.toUpperCase())}`);
  if (p.openNeeds) where.push(`coalesce(tt.raised_cents, 0) < coalesce(tt.goal_cents, 0)`);
  const zipPh = p.zip ? add(p.zip) : null;
  const near = zipPh
    ? `(case when t.zip = ${zipPh} then 0 when left(t.zip, 3) = left(${zipPh}, 3) then 1 else 2 end)`
    : '0';
  const pct = `(coalesce(tt.raised_cents, 0)::float / greatest(coalesce(tt.goal_cents, 0), 1))`;
  const order =
    p.sort === 'nearest' ? `${near}, abs(coalesce(nullif(regexp_replace(t.zip, '\\D', '', 'g'), '')::int, 0) - coalesce(${zipPh ?? 'null'}::int, 0)), t.last_activity_at desc`
    : p.sort === 'needed' ? `${pct} asc, t.name`
    : p.sort === 'recent' || !q ? `t.last_activity_at desc, t.name`
    : `${rank}, t.last_activity_at desc, t.name`;
  const whereSql = where.join(' and ');
  const total = await sys.one<{ n: number }>(`select count(*)::int as n ${TEAM_FROM} where ${whereSql}`, params);
  const limit = add(Math.min(p.limit ?? 20, 50));
  const offset = add(p.offset ?? 0);
  const teams = await sys.query<PublicTeam>(`select ${TEAM_COLUMNS} ${TEAM_FROM} where ${whereSql} order by ${order} limit ${limit} offset ${offset}`, params);
  return { teams, total: total?.n ?? 0 };
}

/** Suggestions for the search field: teams and schools. */
export async function suggest(q: string): Promise<{ type: 'team' | 'school'; label: string; sub: string; href: string }[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];
  const rows = await sys.query<{ slug: string; name: string; org: string; city: string; state: string }>(
    `select t.slug, t.name, o.name as org, t.city, t.state from teams t join organizations o on o.id = t.org_id
     where t.status in ('live', 'season_closed') and (lower(t.name) like $1 or lower(o.name) like $1 or lower(t.city) like $1 or lower(coalesce(t.mascot, '')) like $1)
     order by (case when lower(t.name) like $2 then 0 when lower(o.name) like $2 then 1 else 2 end), t.name limit 8`,
    [`%${term}%`, `${term}%`],
  );
  const schools = new Map<string, { label: string; sub: string; href: string }>();
  const out: { type: 'team' | 'school'; label: string; sub: string; href: string }[] = [];
  for (const r of rows) {
    out.push({ type: 'team', label: r.name, sub: `${r.org} · ${r.city}, ${r.state}`, href: `/t/${r.slug}` });
    if (r.org.toLowerCase().includes(term) && !schools.has(r.org)) {
      schools.set(r.org, { label: r.org, sub: `${r.city}, ${r.state}`, href: `/search?q=${encodeURIComponent(r.org)}` });
    }
  }
  return [...out, ...[...schools.values()].map((s) => ({ type: 'school' as const, ...s }))].slice(0, 8);
}

export interface RosterTile {
  id: string;
  slug: string;
  display_name: string;
  jersey: string | null;
  position: string | null;
  position_group: string | null;
  has_photo: boolean;
  photo_v: string;
  goal_cents: number;
  raised_cents: number;
  items_total: number;
  items_funded: number;
}

export async function getRoster(teamId: string): Promise<RosterTile[]> {
  const rows = await sys.query<any>(
    `select a.id, a.slug, a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name, a.jersey, a.position, a.position_group,
       a.pub_photo_path is not null as has_photo, md5(coalesce(a.pub_photo_path, '')) as photo_v,
       at.goal_cents, at.raised_cents, at.items_total, at.items_funded
     from athletes a join athlete_totals at on at.athlete_id = a.id
     where a.team_id = $1 and a.status = 'live' and a.archived_at is null`,
    [teamId],
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    display_name: athleteDisplayName(r, r.pub_preferred_name),
    jersey: r.jersey,
    position: r.position,
    position_group: r.position_group,
    has_photo: r.has_photo,
    photo_v: r.photo_v,
    goal_cents: r.goal_cents,
    raised_cents: r.raised_cents,
    items_total: r.items_total,
    items_funded: r.items_funded,
  }));
}

export interface PublicNeed {
  id: string;
  athlete_id: string | null;
  kind: 'athlete' | 'team' | 'team_fund';
  name: string;
  variant: string | null;
  category: string | null;
  price_cents: number | null;
  raised_cents: number;
  status: string;
  sort: number;
  pin_x: number | null;
  pin_y: number | null;
  why_note: string | null;
  purchased_at: Date | null;
  delivered_at: Date | null;
}

const NEED_COLUMNS = `n.id, n.athlete_id, n.kind, n.name, n.variant, c.category, n.price_cents, n.raised_cents, n.status, n.sort,
  n.pin_x, n.pin_y, n.why_note, n.purchased_at, n.delivered_at`;

/** Spec 5.4: open items first (largest remaining first), then funded, then purchased or delivered. */
export function sortNeedsForDisplay<T extends { status: string; price_cents: number | null; raised_cents: number; sort: number }>(needs: T[]): T[] {
  const rank = (s: string) => (s === 'open' || s === 'partially_funded' ? 0 : s === 'funded' ? 1 : 2);
  return [...needs].sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r) return r;
    if (rank(a.status) === 0) return ((b.price_cents ?? 0) - b.raised_cents) - ((a.price_cents ?? 0) - a.raised_cents) || a.sort - b.sort;
    return a.sort - b.sort;
  });
}

export interface PublicAthlete {
  id: string;
  team_id: string;
  slug: string;
  share_token: string;
  status: string;
  display_name: string;
  first: string;
  jersey: string | null;
  position: string | null;
  grade: number | null;
  bio: string;
  has_photo: boolean;
  photo_v: string;
  photo_alt: string | null;
  goal_cents: number;
  raised_cents: number;
  remaining_cents: number;
  items_total: number;
  items_funded: number;
}

export async function getAthleteRow(teamId: string, slug: string) {
  return sys.one<{ id: string; share_token: string; status: string }>(
    `select id, share_token, status from athletes where team_id = $1 and slug = $2 and archived_at is null`,
    [teamId, slug],
  );
}

export async function getPublicAthlete(teamId: string, slug: string): Promise<PublicAthlete | null> {
  const r = await sys.one<any>(
    `select a.id, a.team_id, a.slug, a.share_token, a.status, a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name,
       a.jersey, a.position, a.grade, coalesce(a.pub_bio, '') as bio, a.pub_photo_path is not null as has_photo,
       md5(coalesce(a.pub_photo_path, '')) as photo_v, a.photo_alt,
       at.goal_cents, at.raised_cents, at.remaining_cents, at.items_total, at.items_funded
     from athletes a join athlete_totals at on at.athlete_id = a.id
     where a.team_id = $1 and a.slug = $2 and a.archived_at is null`,
    [teamId, slug],
  );
  if (!r) return null;
  return {
    id: r.id,
    team_id: r.team_id,
    slug: r.slug,
    share_token: r.share_token,
    status: r.status,
    display_name: athleteDisplayName(r, r.pub_preferred_name),
    first: (r.pub_preferred_name || r.first_name).trim(),
    jersey: r.jersey,
    position: r.position,
    grade: r.grade,
    bio: r.bio,
    has_photo: r.has_photo,
    photo_v: r.photo_v,
    photo_alt: r.photo_alt,
    goal_cents: r.goal_cents,
    raised_cents: r.raised_cents,
    remaining_cents: r.remaining_cents,
    items_total: r.items_total,
    items_funded: r.items_funded,
  };
}

export async function getAthleteNeeds(athleteId: string): Promise<PublicNeed[]> {
  const rows = await sys.query<PublicNeed>(
    `select ${NEED_COLUMNS} from needs n
     join athletes a on a.id = n.athlete_id join teams t on t.id = a.team_id
     left join gear_catalog c on c.id = n.catalog_id
     where n.athlete_id = $1 and n.season_id = t.current_season_id and n.status <> 'removed' and n.request_status = 'approved'`,
    [athleteId],
  );
  return sortNeedsForDisplay(rows);
}

export async function getTeamNeeds(teamId: string): Promise<PublicNeed[]> {
  return sys.query<PublicNeed>(
    `select ${NEED_COLUMNS} from needs n join teams t on t.id = n.team_id left join gear_catalog c on c.id = n.catalog_id
     where n.team_id = $1 and n.athlete_id is null and n.season_id = t.current_season_id and n.status <> 'removed'
     order by n.kind desc, n.sort`,
    [teamId],
  );
}

export async function getNeed(needId: string) {
  return sys.one<PublicNeed & { team_id: string; season_id: string; request_status: string }>(
    `select ${NEED_COLUMNS}, n.team_id, n.season_id, n.request_status from needs n left join gear_catalog c on c.id = n.catalog_id where n.id = $1`,
    [needId],
  );
}

export interface Supporter {
  id: string;
  name: string;
  message: string | null;
  created_at: Date;
  amount_cents: number;
}

/** Recent supporters of an athlete. Amounts are returned for staff views; public pages don't render them. */
export async function getAthleteSupporters(athleteId: string, limit = 10): Promise<{ list: Supporter[]; total: number }> {
  const rows = await sys.query<any>(
    `select d.id, case when d.show_name then d.donor_name else 'A supporter' end as name,
       case when d.message_status = 'approved' then d.message end as message,
       d.succeeded_at as created_at, sum(al.amount_cents)::int as amount_cents, count(*) over ()::int as total
     from donations d join allocations al on al.donation_id = d.id and al.reversed_at is null
     join needs n on n.id = al.need_id
     where n.athlete_id = $1 and d.status = 'succeeded'
     group by d.id order by d.succeeded_at desc limit $2`,
    [athleteId, limit],
  );
  return { list: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0 };
}

/** Teams in the same ZIP region, then the same state (ui-ux-spec 5.1). */
export async function teamsNear(zip: string | undefined, state: string | undefined, limit = 6): Promise<PublicTeam[]> {
  if (!zip && !state) return [];
  return sys.query<PublicTeam>(
    `select ${TEAM_COLUMNS} ${TEAM_FROM}
     where t.status = 'live' and (($1::text is not null and left(t.zip, 3) = left($1::text, 3)) or ($2::text is not null and t.state = $2::text))
     order by (case when t.zip = $1::text then 0 when left(t.zip, 3) = left($1::text, 3) then 1 else 2 end), t.last_activity_at desc
     limit $3`,
    [zip ?? null, state ?? null, limit],
  );
}

export async function zipToState(zip: string): Promise<string | null> {
  const row = await sys.one<{ state: string }>(`select state from teams where left(zip, 3) = left($1, 3) limit 1`, [zip]);
  return row?.state ?? null;
}
