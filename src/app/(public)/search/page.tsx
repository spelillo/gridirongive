import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { searchTeams, type PublicTeam } from '@/lib/queries/public';
import { SearchField } from '@/components/public/SearchField';
import { CodeEntryLink } from '@/components/public/CodeEntryLink';
import { TeamCard } from '@/components/public/TeamCard';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { pluralize } from '@/lib/domain/text';
import { SITE, STATES } from '@/config/site';
import { SearchFilters } from './Filters';
import { appliedCount, type FilterValues } from './values';

type Raw = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Raw> };

const PAGE_SIZE = 20;
const MAX_PAGES = 10;
const SORTS = ['relevance', 'nearest', 'needed', 'recent'] as const;
type Sort = (typeof SORTS)[number];

/** Repeated keys (open=0&open=1) come in as arrays; the last value wins. */
function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[v.length - 1] : v) ?? '';
}

function parse(raw: Raw, savedZip: string | undefined): FilterValues & { page: number } {
  const q = one(raw.q).trim().slice(0, 80);
  const sport = SITE.sports.some((s) => s.id === one(raw.sport)) ? one(raw.sport) : '';
  const level = SITE.levels.some((s) => s.id === one(raw.level)) ? one(raw.level) : '';
  const st = one(raw.state).toUpperCase();
  const state = (STATES as readonly string[]).includes(st) ? st : '';
  const zipIn = one(raw.zip);
  const zip = /^\d{5}$/.test(zipIn) ? zipIn : '';
  const sortIn = one(raw.sort) as Sort;
  const sort: Sort = SORTS.includes(sortIn) ? sortIn : zip ? 'nearest' : 'relevance';
  const open = one(raw.open) !== '0';
  const page = Math.min(Math.max(parseInt(one(raw.page), 10) || 1, 1), MAX_PAGES);
  // The ZIP saved on the landing page is used for "Nearest" when none is typed here.
  return { q, sport, level, state, zip: zip || (sort === 'nearest' && savedZip && /^\d{5}$/.test(savedZip) ? savedZip : ''), sort, open, page };
}

function href(v: FilterValues, page?: number) {
  const p = new URLSearchParams();
  if (v.q) p.set('q', v.q);
  if (v.sport) p.set('sport', v.sport);
  if (v.level) p.set('level', v.level);
  if (v.state) p.set('state', v.state);
  if (v.zip) p.set('zip', v.zip);
  if (v.sort !== 'relevance') p.set('sort', v.sort);
  if (!v.open) p.set('open', '0');
  if (page && page > 1) p.set('page', String(page));
  return `/search${p.size ? `?${p}` : ''}`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = one((await searchParams).q).trim().slice(0, 80);
  return {
    title: q ? `Teams matching "${q}"` : 'Search teams',
    description: 'Find a high school or youth team by school, team name or town.',
    // Result pages change constantly. Let crawlers follow them to team pages without indexing them.
    robots: { index: false, follow: true },
  };
}

/** Search results (ui-ux-spec 5.2). Teams only: athlete names are never searched or shown. */
export default async function SearchPage({ searchParams }: Props) {
  const store = await cookies();
  const v = parse(await searchParams, store.get('gg_zip')?.value);
  const values: FilterValues = { q: v.q, sport: v.sport, level: v.level, state: v.state, zip: v.zip, sort: v.sort, open: v.open };

  let teams: PublicTeam[] = [];
  let total = 0;
  let failed = false;
  try {
    // "Load more" keeps every loaded page in the URL so Back restores the same list.
    const pages = await Promise.all(
      Array.from({ length: v.page }, (_, i) =>
        searchTeams({ q: v.q, sport: v.sport, level: v.level, state: v.state, zip: v.zip || undefined, sort: v.sort as Sort, openNeeds: v.open, limit: PAGE_SIZE, offset: i * PAGE_SIZE }),
      ),
    );
    teams = pages.flatMap((p) => p.teams);
    total = pages[0]?.total ?? 0;
  } catch (e) {
    console.error('search failed', e);
    failed = true;
  }

  const filtered = appliedCount(values) > 0;
  const keep: Record<string, string> = {};
  new URLSearchParams(href({ ...values, q: '' }).split('?')[1] ?? '').forEach((val, key) => (keep[key] = val));
  const countText = `${pluralize(total, 'team')}${v.q ? ` for "${v.q}"` : ''}`;

  return (
    <>
    <div className="border-b border-hairline-soft bg-chrome">
      <div className="page-x mx-auto flex w-full max-w-[1280px] flex-col gap-4 py-8 md:py-10">
        <h1 className="t-hero">Find a team</h1>
        <p className="t-body -mt-2 max-w-2xl">Search by school, team or town. Players can&apos;t be searched by name.</p>
        <div className="max-w-3xl">
          <SearchField size="lg" defaultValue={v.q} keepParams={keep} showButton label="Search by school, team, or town" />
        </div>
      </div>
    </div>
    <div className="page-x mx-auto flex w-full max-w-[1280px] flex-col gap-6 py-6 md:py-8">

      <SearchFilters values={values} options={{ sports: SITE.sports, levels: SITE.levels, states: STATES }} />

      {v.sort === 'nearest' && !v.zip && <Banner tone="info">Add a ZIP code to sort by distance. Showing the most recently active teams for now.</Banner>}

      <section aria-labelledby="results-h" className="flex flex-col gap-4">
        <h2 id="results-h" className="sr-only">
          Results
        </h2>
        {failed ? (
          <Banner tone="error" action={<ButtonLink href={href(values, v.page)} variant="secondary" size="sm">Retry</ButtonLink>}>
            Search isn&apos;t working right now. Try again.
          </Banner>
        ) : total === 0 ? (
          <EmptyState
            action={
              <>
                {filtered && (
                  <ButtonLink href={v.q ? `/search?q=${encodeURIComponent(v.q)}` : '/search'} variant="secondary">
                    Remove filters
                  </ButtonLink>
                )}
                <CodeEntryLink label="Have a team code? Enter it" className="px-2" />
              </>
            }
          >
            {v.q ? <>No teams match &quot;{v.q}&quot;.</> : 'No teams match these filters.'} Check the spelling{filtered ? ', remove a filter,' : ''} or search by the school&apos;s name. Players
            can&apos;t be searched by name. If a coach or player gave you a team code, enter it to go straight to the team.
          </EmptyState>
        ) : (
          <>
            <p className="t-caption" role="status">
              {teams.length < total ? `Showing ${teams.length} of ${countText}` : countText}
            </p>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <TeamCard key={t.id} team={t} />
              ))}
            </ul>
            {teams.length < total && v.page < MAX_PAGES && (
              <div className="flex justify-center pt-2">
                <ButtonLink href={href(values, v.page + 1)} scroll={false} variant="secondary" fullMobile>
                  Load more
                </ButtonLink>
              </div>
            )}
            {teams.length < total && v.page >= MAX_PAGES && <p className="t-caption text-center">Narrow your search to see more teams.</p>}
            <div className="t-caption">
              Can&apos;t find the team? Ask the coach or a player for the team code or link.{' '}
              <CodeEntryLink label="Enter a team code" className="min-h-0 text-[14px] underline" />
            </div>
          </>
        )}
      </section>
    </div>
    </>
  );
}
