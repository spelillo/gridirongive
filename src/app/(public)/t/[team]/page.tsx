import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getTeamBySlug, getRoster, isPubliclyVisible, acceptsGifts } from '@/lib/queries/public';
import { rosterAccess } from '@/lib/access';
import { giveConfig } from '@/lib/queries/give-config';
import { GiveProvider } from '@/components/give/GiveProvider';
import { TeamNeeds } from '@/components/public/TeamNeeds';
import { RosterBrowser } from '@/components/public/RosterBrowser';
import { LockedRosterPanel } from '@/components/public/CodeEntry';
import { LiveRefresh } from '@/components/public/LiveRefresh';
import { ClampText } from '@/components/public/Collapsible';
import { sportLabel } from '@/components/public/sport';
import { TeamCover } from '@/components/public/TeamCard';
import { TeamCrest } from '@/components/public/TeamCrest';
import { buttonClass } from '@/components/ui/Button';
import { teamVars } from '@/config/team-colors';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Meter } from '@/components/ui/Meter';
import { Banner } from '@/components/ui/Banner';
import { moneyWhole, moneyWholeUp } from '@/lib/domain/money';
import { pluralize } from '@/lib/domain/text';
import { env, mode } from '@/lib/env';
import { TrackView } from '@/components/public/TrackView';
import { LockLink } from './LockLink';

type Props = { params: Promise<{ team: string }>; searchParams: Promise<{ code?: string; expired?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { team: slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team || !isPubliclyVisible(team)) return { title: 'Team not found', robots: { index: false } };
  const description = `${team.org_name} · ${team.city}, ${team.state}. ${moneyWhole(team.raised_cents)} raised of ${moneyWholeUp(team.goal_cents)} for player gear.`;
  return {
    title: team.name,
    description,
    alternates: { canonical: `/t/${team.slug}` },
    // Team links show the team photo (never a player's), or the default image.
    openGraph: { title: team.name, description, type: 'website', images: [team.has_photo ? `/media/team/${team.id}?v=${team.photo_v}` : '/opengraph-image'] },
  };
}

const verifiedHow: Record<string, string> = {
  domain: "Verified with the school's email domain",
  document: 'Verified by Gridiron Give from a staff ID or booster club letter',
  athletic_director: "Verified by the school's athletic director",
};

export default async function TeamPage({ params, searchParams }: Props) {
  const { team: slug } = await params;
  const { code, expired } = await searchParams;
  if (code) redirect(`/api/unlock/link?slug=${encodeURIComponent(slug)}&code=${encodeURIComponent(code)}`);
  const team = await getTeamBySlug(slug);
  if (!team) notFound();
  const access = await rosterAccess(team);
  if (!isPubliclyVisible(team) && access !== 'staff') notFound();

  const roster = access ? await getRoster(team.id) : [];
  const config = await giveConfig(team, []);
  const unlocked = Boolean(access);
  const paused = team.status === 'live' && !acceptsGifts(team);

  const verifiedText = verifiedHow[team.verification_method ?? ''] ?? 'Verified by Gridiron Give';
  const crestName = team.mascot ? `${team.org_name} ${team.mascot}` : team.org_name;

  return (
    <GiveProvider config={config}>
      <TrackView name="team_viewed" props={{ unlocked }} />
      <LiveRefresh teamId={team.id} supabaseUrl={mode.realtime ? env.supabaseUrl : undefined} supabaseAnonKey={mode.realtime ? env.supabaseAnonKey : undefined} />
      <div style={teamVars(team.color) as React.CSSProperties}>
        <header className="relative isolate overflow-hidden bg-[var(--team-night)] text-white">
          <div aria-hidden className="absolute inset-0 -z-10">
            <TeamCover team={team} eager className="object-[50%_72%] opacity-90" />
            <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,15,36,0.35)_0%,rgba(7,15,36,0.55)_45%,var(--team-night)_100%)]" />
          </div>
          <div className="page-x mx-auto flex max-w-[1280px] flex-col gap-6 pb-8 pt-5 md:pb-10 md:pt-6">
            <Breadcrumb tone="light" items={[{ label: 'Teams', href: '/search' }, { label: team.state, href: `/search?state=${team.state}` }, { label: team.name }]} />
            <div className="flex flex-col gap-5 pt-16 md:flex-row md:items-end md:gap-6 md:pt-36">
              <TeamCrest name={crestName} color={team.color} size={84} className="hidden md:block" />
              <TeamCrest name={crestName} color={team.color} size={60} className="md:hidden" />
              <div className="flex min-w-0 flex-col gap-2">
                <h1 className="text-[30px] leading-[34px] font-bold tracking-[-0.025em] text-white md:text-[48px] md:leading-[52px]">{team.name}</h1>
                <p className="text-[16px] text-white/85 md:text-[18px]">
                  {team.org_name}
                  {team.mascot ? ` ${team.mascot}` : ''} · {team.city}, {team.state}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold text-white backdrop-blur">{sportLabel(team.sport)}</span>
                  {team.season_label && <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold text-white backdrop-blur">{team.season_label}</span>}
                  {team.verification_status === 'verified' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-primary-deep" title={verifiedText}>
                      <ShieldCheck size={14} aria-hidden /> Verified team
                      <span className="sr-only">: {verifiedText}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="page-x mx-auto flex w-full max-w-[1280px] flex-col gap-8 pb-12">
          <div className="card relative z-10 -mt-px grid gap-5 p-5 md:-mt-6 md:grid-cols-[1fr_auto] md:items-center md:gap-10 md:p-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
                <p className="flex items-baseline gap-2">
                  <span className="t-score text-[40px] text-ink md:text-[48px]">{moneyWhole(team.raised_cents)}</span>
                  <span className="text-[16px] text-ink-meta">raised of {moneyWholeUp(team.goal_cents)}</span>
                </p>
                <p className="t-caption tabular">
                  {pluralize(team.athletes_live, 'player')} · {team.items_funded} of {pluralize(team.items_total, 'item')} funded
                </p>
              </div>
              <Meter raised={team.raised_cents} goal={team.goal_cents} showText={false} thick label={`${team.name} funding`} />
            </div>
            <a href="#players" className={buttonClass('primary', { fullMobile: true })}>
              {unlocked ? 'Choose a player' : 'Enter team code'}
            </a>
          </div>

          {(team.status !== 'live' || paused || (expired && !unlocked)) && (
            <div className="flex flex-col gap-3">
              {team.status === 'draft' && <Banner rounded tone="warn">Only your staff can see this page. It goes public when you publish the team.</Banner>}
              {team.status === 'season_closed' && <Banner rounded tone="info">The {team.season_label} season is closed. Thank you to everyone who gave.</Banner>}
              {paused && <Banner rounded tone="warn">This team can&apos;t accept gifts right now.</Banner>}
              {expired && !unlocked && <Banner rounded tone="warn">That team link was replaced. Enter the current team code to see players.</Banner>}
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
            <section aria-labelledby="players-h" className="flex min-w-0 scroll-mt-24 flex-col gap-5 lg:order-1" id="players">
              {unlocked ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 id="players-h" className="t-section scroll-mt-24">
                      Players <span className="text-ink-meta tabular">{roster.length}</span>
                    </h2>
                    {access === 'code' && <LockLink teamId={team.id} />}
                  </div>
                  <RosterBrowser tiles={roster} teamSlug={team.slug} sport={team.sport} />
                </>
              ) : (
                <>
                  <h2 id="players-h" className="sr-only scroll-mt-24">
                    Players
                  </h2>
                  <LockedRosterPanel teamId={team.id} />
                </>
              )}
            </section>

            <aside className="flex flex-col gap-6 lg:order-2" aria-label="About the team">
              {team.about && (
                <section aria-labelledby="about-h" className="flex flex-col gap-2">
                  <h2 id="about-h" className="t-subhead">
                    About the team
                  </h2>
                  <ClampText text={team.about} lines={5} />
                </section>
              )}
              <section aria-labelledby="needs-h" className="flex flex-col gap-3">
                <h2 id="needs-h" className="t-subhead">
                  Team needs
                </h2>
                <TeamNeeds />
              </section>
              {team.verification_status === 'verified' && (
                <p className="flex items-start gap-2 rounded-[12px] bg-chrome p-3 text-[14px] leading-5 text-ink-list">
                  <ShieldCheck size={18} aria-hidden className="mt-px shrink-0 text-primary" /> {verifiedText}. Every purchase is logged with its receipt.
                </p>
              )}
              <p className="t-caption">
                Something wrong on this page? <Link href={`/report?team=${encodeURIComponent(team.slug)}`} className="underline">Report this page</Link>
              </p>
            </aside>
          </div>
        </div>
      </div>
    </GiveProvider>
  );
}
