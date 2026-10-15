import { loadTeamCtx } from '@/lib/app/team';
import { rosterFor, teamTemplates } from '@/lib/app/team-data';
import { PageHeader } from '@/components/ui/PageHeader';
import { RosterTable } from './RosterTable';

export const metadata = { title: 'Roster' };

/** Roster (ui-ux-spec 8.3). */
export default async function RosterPage({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { teamId } = await params;
  const sp = await searchParams;
  const ctx = await loadTeamCtx(teamId);
  const [rows, templates] = await Promise.all([rosterFor(ctx.user.id, teamId), teamTemplates(ctx.user.id, teamId)]);
  return (
    <div className="flex flex-col">
      <PageHeader title="Roster" sub={`${rows.length} ${rows.length === 1 ? 'athlete' : 'athletes'} · ${ctx.team.seasonLabel || 'Current season'}`} />
      <RosterTable
        teamId={teamId}
        rows={rows}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        canEdit={ctx.canEdit}
        initialFilter={{ invite: sp.invite === 'pending' ? 'pending' : '', status: sp.status ?? '' }}
      />
    </div>
  );
}
