import { notFound } from 'next/navigation';
import { loadTeamCtx } from '@/lib/app/team';
import { rosterFor } from '@/lib/app/team-data';
import { asUser } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { TemplateEditor } from './TemplateEditor';

export const metadata = { title: 'Gear template' };

/** Template editor and "Apply to athletes" (ui-ux-spec 8.7). `new` creates one. */
export default async function TemplatePage({ params }: { params: Promise<{ teamId: string; templateId: string }> }) {
  const { teamId, templateId } = await params;
  const ctx = await loadTeamCtx(teamId);
  const isNew = templateId === 'new';
  if (!isNew && !/^[0-9a-f-]{36}$/.test(templateId)) notFound();
  if (isNew && !ctx.canEdit) notFound();
  const data = await asUser(ctx.user.id, async (tx) => {
    const t = isNew ? null : await tx.one<any>(`select * from gear_templates where id = $1 and team_id = $2`, [templateId, teamId]);
    if (!isNew && !t) return null;
    const items = isNew ? [] : await tx.query<any>(`select catalog_id, size, price_cents, sort from gear_template_items where template_id = $1 order by sort`, [templateId]);
    const catalog = await tx.query<any>(
      `select id, name, category, description, sizes, positions, safety_note, default_price_cents, price_min_cents, price_max_cents
       from gear_catalog where sport = $1 and active and category <> 'Team equipment' order by sort, name`,
      [ctx.team.sport],
    );
    return { t, items, catalog };
  });
  if (!data) notFound();
  const roster = await rosterFor(ctx.user.id, teamId);
  const base = `/app/manager/${teamId}/templates`;
  return (
    <div className="flex flex-col">
      <PageHeader
        crumbs={<Breadcrumb items={[{ label: 'Gear templates', href: base }, { label: isNew ? 'New template' : data.t.name }]} />}
        title={isNew ? 'New template' : data.t.name}
        sub={isNew ? 'Pick the items an athlete starts with.' : templateId === ctx.team.defaultTemplateId ? 'Default template' : undefined}
      />
      <TemplateEditor
        teamId={teamId}
        templateId={isNew ? null : templateId}
        isDefault={templateId === ctx.team.defaultTemplateId}
        canEdit={ctx.canEdit}
        initial={{ name: data.t?.name ?? '', positions: data.t?.positions ?? [], items: data.items.map((i: any) => ({ catalogId: i.catalog_id, size: i.size, priceCents: i.price_cents })) }}
        catalog={data.catalog.map((c: any) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          description: c.description,
          sizes: c.sizes,
          safetyNote: c.safety_note,
          defaultCents: c.default_price_cents,
          minCents: c.price_min_cents,
          maxCents: c.price_max_cents,
        }))}
        roster={roster.map((r) => ({ id: r.id, name: r.name, jersey: r.jersey, position: r.position }))}
      />
    </div>
  );
}
