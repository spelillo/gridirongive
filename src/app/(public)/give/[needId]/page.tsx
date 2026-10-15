import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getNeed, getTeamById, isPubliclyVisible } from '@/lib/queries/public';
import { sys } from '@/lib/db';
import { canViewAthlete } from '@/lib/access';
import { giveConfig } from '@/lib/queries/give-config';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { LockedRosterPanel } from '@/components/public/CodeEntry';
import { LiveRefresh } from '@/components/public/LiveRefresh';
import { env, mode } from '@/lib/env';
import { StandaloneGive } from './StandaloneGive';

export const metadata: Metadata = { title: 'Give', robots: { index: false, follow: false } };

type Props = { params: Promise<{ needId: string }> };

/** The give sheet as a page: for deep links and for browsers where the sheet can't open. */
export default async function GivePage({ params }: Props) {
  const { needId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(needId)) notFound();
  const need = await getNeed(needId);
  if (!need || need.request_status !== 'approved') notFound();
  const team = await getTeamById(need.team_id);
  if (!team || !isPubliclyVisible(team)) notFound();

  let athlete: { id: string; slug: string; share_token: string; status: string } | null = null;
  if (need.athlete_id) {
    athlete = await sys.one(`select id, slug, share_token, status from athletes where id = $1`, [need.athlete_id]);
    if (!athlete) notFound();
    if (!(await canViewAthlete(team, athlete))) {
      return (
        <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-6 py-8">
          <h1 className="t-section">Give to a player on {team.name}</h1>
          <LockedRosterPanel teamId={team.id} />
        </div>
      );
    }
  }
  const config = await giveConfig(team, athlete && athlete.status === 'live' ? [athlete.id] : []);
  const backHref = athlete ? `/t/${team.slug}/${athlete.slug}` : `/t/${team.slug}`;
  const target = need.kind === 'team_fund' ? ({ kind: 'team_fund' } as const) : ({ kind: 'need', needId: need.id, entry: 'page' } as const);

  return (
    <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-6 py-6 md:py-10">
      <LiveRefresh teamId={team.id} supabaseUrl={mode.realtime ? env.supabaseUrl : undefined} supabaseAnonKey={mode.realtime ? env.supabaseAnonKey : undefined} />
      <Breadcrumb items={[{ label: team.name, href: `/t/${team.slug}` }, ...(athlete ? [{ label: 'Player', href: backHref }] : []), { label: 'Give' }]} />
      <h1 className="t-section">{need.kind === 'team_fund' ? 'Give to the team fund' : 'Give to this item'}</h1>
      <StandaloneGive config={config} target={target} backHref={backHref} />
    </div>
  );
}
