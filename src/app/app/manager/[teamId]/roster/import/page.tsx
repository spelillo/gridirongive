import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { loadTeamCtx } from '@/lib/app/team';
import { rosterFor, teamTemplates } from '@/lib/app/team-data';
import { asUser } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { ImportWizard } from './ImportWizard';

export const metadata = { title: 'Import roster' };

/** Import roster (ui-ux-spec 8.4). */
export default async function ImportPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  if (!ctx.canEdit) notFound();
  const [rows, templates, contacts] = await Promise.all([
    rosterFor(ctx.user.id, teamId),
    teamTemplates(ctx.user.id, teamId),
    asUser(ctx.user.id, (tx) =>
      tx.query<{ athlete_id: string; guardian_email: string | null; athlete_email: string | null }>(
        `select c.athlete_id, c.guardian_email, c.athlete_email from athlete_contacts c join athletes a on a.id = c.athlete_id where a.team_id = $1 and a.archived_at is null`,
        [teamId],
      ),
    ),
  ]);
  const byId = new Map(contacts.map((c) => [c.athlete_id, c]));
  const existing = rows.map((r) => ({
    first_name: r.firstName,
    last_name: r.lastName,
    jersey: r.jersey,
    guardian_email: byId.get(r.id)?.guardian_email ?? null,
    athlete_email: byId.get(r.id)?.athlete_email ?? null,
  }));
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Import roster"
        sub="Upload a CSV or Excel file, or paste rows from a spreadsheet."
        crumbs={<Breadcrumb items={[{ label: 'Roster', href: `/app/manager/${teamId}/roster` }, { label: 'Import' }]} />}
      />
      <ImportWizard teamId={teamId} existing={existing} templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
