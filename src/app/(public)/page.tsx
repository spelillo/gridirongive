import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowRight, KeyRound, Receipt, Search, ShieldCheck, Shirt } from 'lucide-react';
import { SearchField } from '@/components/public/SearchField';
import { CodeEntryLink } from '@/components/public/CodeEntryLink';
import { TeamCard } from '@/components/public/TeamCard';
import { GearArt } from '@/components/gear/GearArt';
import { ButtonLink } from '@/components/ui/Button';
import { activeTeams, platformTotals, recentGifts, teamsNear } from '@/lib/queries/public';
import { approxLocation } from '@/lib/request';
import { feeFormula } from '@/lib/fees-copy';
import { moneyWhole } from '@/lib/domain/money';
import { relativeTime } from '@/lib/domain/text';
import { teamVars } from '@/config/team-colors';
import { SITE } from '@/config/site';
import { ZipForm } from './ZipForm';

export const metadata = { title: { absolute: 'Gridiron Give: fund gear for local athletes' } };

const STEPS = [
  { icon: Search, title: 'Find the team', body: 'Search by school, team or town.' },
  { icon: KeyRound, title: 'Enter the team code', body: 'Players and coaches share it. It opens the roster.' },
  { icon: Shirt, title: 'Pick a player and an item', body: 'Every gift goes to one piece of gear on their list.' },
  { icon: Receipt, title: 'See the receipt', body: 'The coach buys it and you get an update with the purchase.' },
];

export default async function Landing() {
  const store = await cookies();
  const savedZip = store.get('gg_zip')?.value;
  const approx = savedZip ? { zip: savedZip } : await approxLocation();
  const located = Boolean(approx.zip || approx.state);
  const [near, active, gifts, totals] = await Promise.all([
    located ? teamsNear(approx.zip, approx.state) : Promise.resolve([]),
    activeTeams(6),
    recentGifts(5),
    platformTotals(),
  ]);
  const where = approx.zip ? `near ${approx.zip}` : approx.state ? `in ${approx.state}` : '';
  const teams = near.length ? near : active;

  return (
    <>
      <section aria-labelledby="find" className="relative isolate overflow-hidden bg-night text-white">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(80%_70%_at_20%_0%,rgba(42,92,240,0.45)_0%,transparent_60%),radial-gradient(60%_60%_at_100%_100%,rgba(23,71,209,0.35)_0%,transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.07] [background-image:repeating-linear-gradient(90deg,#fff_0_2px,transparent_2px_120px)] [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]"
        />
        <div className="page-x mx-auto grid max-w-[1280px] grid-cols-1 gap-10 py-12 md:py-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
          <div className="flex min-w-0 flex-col gap-5">
            <p className="text-[13px] font-semibold tracking-[0.08em] text-[#9db5ff] uppercase">Gear for school and youth teams</p>
            <h1 id="find" className="text-[40px] leading-[44px] font-bold tracking-[-0.03em] text-white md:text-[60px] md:leading-[62px]">
              Find a team
            </h1>
            <p className="max-w-xl text-[17px] leading-7 text-[#c7d2ea] md:text-[19px] md:leading-8">
              Search by school, team or town, then fund a specific piece of gear for a specific player. You&apos;ll need the team code from a player or coach to see the roster.
            </p>
            <div className="max-w-2xl [&_label.sr-only+svg]:text-ink-nav">
              <SearchField size="lg" withSport sports={[...SITE.sports]} label="Search by school, team, or town" />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <CodeEntryLink
                bare
                label="Have a team code or link?"
                className="inline-flex min-h-11 items-center gap-2 font-semibold text-white underline decoration-white/40 underline-offset-4 hover:text-white hover:decoration-white"
              />
              <span className="flex items-center gap-1.5 text-[14px] text-[#aebbd6]">
                <ShieldCheck size={16} aria-hidden /> Player pages are private until a parent consents
              </span>
            </div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm md:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-white">Latest gifts</h2>
              <p className="text-[13px] text-[#aebbd6]">Across all teams</p>
            </div>
            {gifts.length ? (
              <ul className="mt-4 flex flex-col">
                {gifts.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 border-t border-white/10 py-3 first:border-t-0 first:pt-0" style={teamVars(g.team_color) as React.CSSProperties}>
                    <GearArt name={g.item} size={44} className="bg-white" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-white">
                        {moneyWhole(g.amount_cents)} toward {g.item}
                      </p>
                      <p className="truncate text-[13px] text-[#aebbd6]">
                        <Link href={`/t/${g.team_slug}`} className="text-[#cdd8f0] no-underline hover:text-white hover:underline">
                          {g.team_name}
                        </Link>{' '}
                        · {relativeTime(g.created_at)}
                      </p>
                    </div>
                    {g.funded && <span className="shrink-0 rounded-full bg-[#16a34a]/20 px-2 py-0.5 text-[12px] font-semibold text-[#86efac]">Funded</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[15px] text-[#c7d2ea]">Gifts will show here as teams start receiving them.</p>
            )}
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
              <div>
                <dt className="text-[12px] text-[#aebbd6]">Raised</dt>
                <dd className="t-score text-[30px] text-white">{moneyWhole(totals.raised_cents)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#aebbd6]">Items funded</dt>
                <dd className="t-score text-[30px] text-white">{totals.items_funded.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#aebbd6]">Teams</dt>
                <dd className="t-score text-[30px] text-white">{totals.teams}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section aria-labelledby="near" className="bg-chrome">
        <div className="page-x mx-auto w-full max-w-[1280px] py-12 md:py-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="near" className="t-section">
                {near.length ? 'Teams near you' : 'Teams raising now'}
              </h2>
              <p className="t-caption mt-1 text-[15px]">
                {near.length
                  ? `Ranked by distance ${where}.`
                  : located
                    ? `No teams ${where} yet. These teams were active most recently.`
                    : 'Add your ZIP code to see teams nearby first.'}
              </p>
            </div>
            <div className="flex items-end gap-4">
              {located ? <ZipForm current={approx.zip} compact /> : <ZipForm inline />}
              <Link href="/search" className="hidden min-h-11 items-center gap-1 text-[15px] font-semibold no-underline hover:underline md:inline-flex">
                All teams <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <TeamCard key={t.id} team={t} />
            ))}
          </ul>
          <Link href="/search" className="mt-6 inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold no-underline md:hidden">
            All teams <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how" className="page-x mx-auto w-full max-w-[1280px] scroll-mt-20 py-12 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div className="flex flex-col gap-4">
            <h2 id="how" className="t-section">
              How it works
            </h2>
            <p className="t-body">Gifts are earmarked for one item on one player&apos;s list. Coaches buy the gear and log the receipt, so every dollar can be traced.</p>
            <div className="rounded-[14px] bg-chrome p-4">
              <h3 className="t-label">Fees</h3>
              <p className="t-caption mt-1 text-[15px] leading-6">{feeFormula()}. Donors can cover the fees so the player gets the full amount.</p>
              <Link href="/for-teams#fees" className="mt-2 inline-flex min-h-9 items-center gap-1 text-[14px] font-semibold no-underline hover:underline">
                Fee details <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
          <ol className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="relative flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-band-blue text-primary">
                  <s.icon size={22} strokeWidth={1.9} aria-hidden />
                  <span className="t-score absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-ink text-[14px] text-white">{i + 1}</span>
                </span>
                <div>
                  <h3 className="text-[17px] leading-6 font-semibold text-ink">{s.title}</h3>
                  <p className="t-caption mt-1 text-[15px] leading-6">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="coaches" className="page-x mx-auto w-full max-w-[1280px] pb-12 md:pb-20">
        <div className="relative isolate overflow-hidden rounded-[24px] bg-navy px-6 py-10 text-white md:px-12 md:py-14">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(70%_120%_at_100%_0%,rgba(42,92,240,0.55),transparent_60%)]" />
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 id="coaches" className="text-[26px] leading-8 font-bold tracking-[-0.02em] text-white md:text-[32px] md:leading-10">
                Running a team?
              </h2>
              <p className="mt-3 text-[16px] leading-7 text-[#c7d2ea]">
                Import your roster, apply a gear list by position, and share one code with families. Money lands in your team&apos;s Stripe account, and the buy list tells you what to order.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
              <ButtonLink href="/app/manager/new" variant="inverse">
                Set up a team
              </ButtonLink>
              <ButtonLink href="/for-teams" variant="ghost-inverse">
                How it works for coaches
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
