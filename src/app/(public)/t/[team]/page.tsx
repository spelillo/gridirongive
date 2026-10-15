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
import { TeamThumb, sportLabel } from '@/components/public/TeamRow';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Meter } from '@/components/ui/Meter';
import { Chip } from '@/components/ui/Chip';
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

  return (
    <GiveProvider config={config}>
      <TrackView name="team_viewed" props={{ unlocked }} />
      <LiveRefresh teamId={team.id} supabaseUrl={mode.realtime ? env.supabaseUrl : undefined} supabaseAnonKey={mode.realtime ? env.supabaseAnonKey : undefined} />
      <div className="page-x mx-auto flex w-full max-w-[1200px] flex-col gap-8 py-6 md:py-8">
        <Breadcrumb items={[{ label: 'Teams', href: '/search' }, { label: team.state, href: `/search?state=${team.state}` }, { label: team.name }]} />
        {team.status === 'draft' && <Banner tone="warn">Only your staff can see this page. It goes public when you publish the team.</Banner>}
        {team.status === 'season_closed' && <Banner tone="info">The {team.season_label} season is closed. Thank you to everyone who gave.</Banner>}
        {paused && <Banner tone="warn">This team can&apos;t accept gifts right now.</Banner>}
        {expired && !unlocked && <Banner tone="warn">That team link was replaced. Enter the current team code to see players.</Banner>}

        <header className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start">
          <TeamThumb team={team} className="w-full rounded-lg" />
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="t-hero">{team.name}</h1>
              <p className="t-body">
                {team.org_name} · {team.city}, {team.state}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="neutral">{sportLabel(team.sport)}</Chip>
                {team.season_label && <Chip tone="muted">{team.season_label}</Chip>}
                {team.verification_status === 'verified' && (
                  <span title={verifiedHow[team.verification_method ?? ''] ?? 'Verified by Gridiron Give'}>
                    <Chip tone="info" icon="shield">Verified team</Chip>
                    <span className="sr-only">{verifiedHow[team.verification_method ?? ''] ?? 'Verified by Gridiron Give'}</span>
                  </span>
                )}
              </div>
              {team.verification_status === 'verified' && (
                <p className="flex items-center gap-1.5 t-caption">
                  <ShieldCheck size={16} aria-hidden /> {verifiedHow[team.verification_method ?? ''] ?? 'Verified by Gridiron Give'}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-hairline-soft pt-4">
              <p className="t-figure">
                {moneyWhole(team.raised_cents)} raised <span className="font-normal text-ink-meta">of {moneyWholeUp(team.goal_cents)}</span>
              </p>
              <Meter raised={team.raised_cents} goal={team.goal_cents} showText={false} label={`${team.name} funding`} />
              <p className="t-caption tabular">
                {pluralize(team.athletes_live, 'athlete')} · {pluralize(team.items_total, 'item')} · {team.items_funded} funded
              </p>
            </div>
          </div>
        </header>

        {team.about && (
          <section aria-labelledby="about-h" className="flex max-w-3xl flex-col gap-2">
            <h2 id="about-h" className="t-subhead">
              About the team
            </h2>
            <ClampText text={team.about} lines={4} />
          </section>
        )}

        <section aria-label="Team fund" className="max-w-3xl">
          <TeamNeeds />
        </section>

        <section aria-labelledby="players-h" className="flex flex-col gap-4 border-t border-hairline-soft pt-8">
          {unlocked ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="players-h" className="t-section">
                  Players <span className="text-ink-meta tabular">{roster.length}</span>
                </h2>
                {access === 'code' && <LockLink teamId={team.id} />}
              </div>
              <RosterBrowser tiles={roster} teamSlug={team.slug} sport={team.sport} />
            </>
          ) : (
            <>
              <h2 id="players-h" className="sr-only">
                Players
              </h2>
              <LockedRosterPanel teamId={team.id} />
            </>
          )}
        </section>

        <p className="t-caption border-t border-hairline-soft pt-4">
          Something wrong on this page? <Link href={`/report?team=${encodeURIComponent(team.slug)}`} className="underline">Report this page</Link>
        </p>
      </div>
    </GiveProvider>
  );
}
