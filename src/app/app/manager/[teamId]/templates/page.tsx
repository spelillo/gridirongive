import Link from 'next/link';
import { loadTeamCtx } from '@/lib/app/team';
import { teamTemplates } from '@/lib/app/team-data';
import { asUser } from '@/lib/db';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { moneyWhole } from '@/lib/domain/money';
import { formatDate } from '@/lib/domain/text';
import { StarterTemplatesButton } from './StarterTemplatesButton';
import { TeamGear } from './TeamGear';

export const metadata = { title: 'Gear templates' };

/** Gear templates and team equipment (ui-ux-spec 8.7). */
export default async function TemplatesPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  const base = `/app/manager/${teamId}/templates`;
  const [templates, teamNeeds, catalog] = await Promise.all([
    teamTemplates(ctx.user.id, teamId),
    asUser(ctx.user.id, (tx) =>
      tx.query<any>(
        `select n.*, c.price_min_cents, c.price_max_cents from needs n left join gear_catalog c on c.id = n.catalog_id
         where n.team_id = $1 and n.season_id = $2 and n.kind = 'team' order by (n.status = 'removed'), n.sort, n.created_at`,
        [teamId, ctx.team.seasonId],
      ),
    ),
    asUser(ctx.user.id, (tx) =>
      tx.query<any>(`select id, name, category, sizes, default_price_cents, price_min_cents, price_max_cents from gear_catalog where sport = $1 and active order by sort, name`, [
        ctx.team.sport,
      ]),
    ),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Gear templates"
        sub="Templates set the starting gear list for each athlete. Changing a template doesn't change athletes until you apply it."
        actions={ctx.canEdit && templates.length > 0 ? <ButtonLink href={`${base}/new`}>New template</ButtonLink> : undefined}
      />
      <Section title="Templates" id="templates">
        {templates.length === 0 ? (
          <EmptyState action={ctx.canEdit ? <StarterTemplatesButton teamId={teamId} /> : undefined}>No templates yet. Start from the standard {ctx.team.sport} kits.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {templates.map((t) => (
              <li key={t.id}>
                <Link href={`${base}/${t.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 text-ink no-underline hover:bg-band">
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[16px] font-medium">
                      {t.name}
                      {t.id === ctx.team.defaultTemplateId && <Chip tone="info">Default</Chip>}
                    </span>
                    <span className="t-caption">
                      {t.positions.length ? `For ${t.positions.join(', ')}` : 'Any position'} · {t.items} items
                    </span>
                  </span>
                  <span className="t-figure tabular">{moneyWhole(t.total_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="t-caption">When an athlete is added, they get the template that matches their position, or the default.</p>
      </Section>

      <TeamGear
        teamId={teamId}
        canEdit={ctx.canEdit}
        catalog={catalog.filter((c: any) => c.category === 'Team equipment')}
        needs={teamNeeds.map((n: any) => ({
          id: n.id,
          name: n.name,
          variant: n.variant,
          sizes: [],
          priceCents: n.price_cents ?? 0,
          raisedCents: n.raised_cents,
          status: n.status,
          requestStatus: n.request_status,
          requestReason: null,
          whyNote: n.why_note,
          priceNote: n.price_note,
          minCents: n.price_min_cents,
          maxCents: n.price_max_cents,
          safetyNote: null,
          pinX: null,
          pinY: null,
          purchasedAt: n.purchased_at ? formatDate(n.purchased_at) : null,
          deliveredAt: n.delivered_at ? formatDate(n.delivered_at) : null,
        }))}
      />
    </div>
  );
}
