import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EyeOff } from 'lucide-react';
import { getTeamBySlug, getPublicAthlete, getAthleteNeeds, getAthleteSupporters, isPubliclyVisible } from '@/lib/queries/public';
import { canViewAthlete, memberAccess } from '@/lib/access';
import { giveConfig } from '@/lib/queries/give-config';
import { GiveProvider } from '@/components/give/GiveProvider';
import { AthleteView } from '@/components/gear/AthleteView';
import { LockedRosterPanel } from '@/components/public/CodeEntry';
import { LiveRefresh } from '@/components/public/LiveRefresh';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { gradeLabel } from '@/lib/domain/names';
import { env, mode } from '@/lib/env';

type Props = { params: Promise<{ team: string; athlete: string }> };

/** Athlete pages are never indexed and never put a name or photo in link previews. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { team: slug } = await params;
  const team = await getTeamBySlug(slug);
  return {
    title: team ? `A player on ${team.name}` : 'Player',
    description: team ? `Help a player on ${team.name} get the gear they need.` : undefined,
    robots: { index: false, follow: false },
    openGraph: team ? { title: `A player on ${team.name}`, description: 'Help a player get the gear they need.' } : undefined,
  };
}

export default async function AthletePage({ params }: Props) {
  const { team: slug, athlete: athleteSlug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();
  const member = await memberAccess(team.id);
  if (!isPubliclyVisible(team) && !member.staff) notFound();
  const athlete = await getPublicAthlete(team.id, athleteSlug);
  if (!athlete) notFound();

  const allowed = await canViewAthlete(team, athlete);
  if (!allowed) {
    return (
      <div className="page-x mx-auto flex w-full max-w-[720px] flex-col gap-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="t-section">A player on {team.name}</h1>
          <p className="t-body">Player pages are visible to people with the team code or the player&apos;s own link.</p>
        </div>
        <LockedRosterPanel teamId={team.id} />
        <p className="t-body">
          You can still <Link href={`/t/${team.slug}`}>support the whole team</Link>.
        </p>
      </div>
    );
  }

  const insider = member.staff || member.family;
  if (athlete.status !== 'live' && !insider) {
    return (
      <div className="page-x mx-auto w-full max-w-[720px] py-12">
        <EmptyState action={<ButtonLink href={`/t/${team.slug}`}>Go to {team.name}</ButtonLink>}>
          <span className="t-subhead mb-1 flex items-center justify-center gap-2">
            <EyeOff aria-hidden size={20} /> This page isn&apos;t available right now
          </span>
          The player or their family has paused this page. You can still support {team.name}.
        </EmptyState>
      </div>
    );
  }

  const [needs, supporters, config] = await Promise.all([
    getAthleteNeeds(athlete.id),
    getAthleteSupporters(athlete.id, 50),
    giveConfig(team, athlete.status === 'live' ? [athlete.id] : []),
  ]);
  const meta = [athlete.jersey ? `#${athlete.jersey}` : null, athlete.position, gradeLabel(athlete.grade)].filter(Boolean).join(' · ');
  const preview = athlete.status !== 'live';

  return (
    <GiveProvider config={config}>
      <LiveRefresh teamId={team.id} supabaseUrl={mode.realtime ? env.supabaseUrl : undefined} supabaseAnonKey={mode.realtime ? env.supabaseAnonKey : undefined} />
      {preview && (
        <div className="page-x mx-auto w-full max-w-[1200px] pt-4">
          <Banner tone="warn">
            {athlete.status === 'hidden' ? 'This page is hidden. Only the team and family can see it.' : 'This page is not live yet. Only the team and family can see it.'}
          </Banner>
        </div>
      )}
      <AthleteView
        data={{
          id: athlete.id,
          displayName: athlete.display_name,
          first: athlete.first,
          meta,
          jersey: athlete.jersey,
          bio: athlete.bio,
          photoSrc: athlete.has_photo ? `/media/athlete/${athlete.id}?v=${athlete.photo_v}` : null,
          photoAlt: athlete.photo_alt || `${athlete.first} in uniform`,
          goalCents: athlete.goal_cents,
          raisedCents: athlete.raised_cents,
          remainingCents: athlete.remaining_cents,
          itemsTotal: athlete.items_total,
          itemsFunded: athlete.items_funded,
          team: { name: team.name, slug: team.slug },
          needs: needs.map((n, i) => ({
            id: n.id,
            number: i + 1,
            name: n.name,
            variant: n.variant,
            priceCents: n.price_cents ?? 0,
            raisedCents: n.raised_cents,
            status: n.status,
            whyNote: n.why_note,
            purchasedAt: n.purchased_at ? new Date(n.purchased_at).toISOString() : null,
            deliveredAt: n.delivered_at ? new Date(n.delivered_at).toISOString() : null,
            pinX: n.pin_x,
            pinY: n.pin_y,
          })),
          supporters: supporters.list.map((s) => ({ id: s.id, name: s.name, message: s.message, createdAt: new Date(s.created_at).toISOString() })),
          supportersTotal: supporters.total,
          preview,
        }}
      />
    </GiveProvider>
  );
}
