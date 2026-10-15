import { requireAdmin } from '@/lib/auth/session';
import { sys } from '@/lib/db';
import { money } from '@/lib/domain/money';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { CatalogItemButton, type CatalogItem } from './CatalogForm';

export const metadata = { title: 'Gear catalog' };

/** Catalog editor (ui-ux-spec 9): items, categories, price bounds, safety notes and position presets per sport. */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  await requireAdmin();
  const { sport: wanted } = await searchParams;
  const sports = (await sys.query<{ sport: string; n: number }>(`select sport, count(*)::int as n from gear_catalog group by sport order by min(case sport when 'football' then 0 else 1 end), sport`)).map((s) => s);
  const sport = sports.find((s) => s.sport === wanted)?.sport ?? sports[0]?.sport ?? 'football';
  const items = await sys.query<CatalogItem>(
    `select id, sport, category, name, description, price_min_cents, price_max_cents, default_price_cents, safety_note, sizes, positions, active, sort
     from gear_catalog where sport = $1 order by sort, name`,
    [sport],
  );
  const categories = [...new Set(items.map((i) => i.category))];
  const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="flex max-w-[1040px] flex-col gap-6">
      <PageHeader title="Gear catalog" sub="Coaches build gear lists from these items. Price changes apply to new items only." actions={<CatalogItemButton item={null} sport={sport} categories={categories} />} />
      <div className="-mt-4">
        <Tabs label="Sport" active={sport} tabs={sports.map((s) => ({ id: s.sport, label: label(s.sport), href: `/app/admin/catalog?sport=${encodeURIComponent(s.sport)}`, count: s.n }))} />
      </div>
      {items.length === 0 ? (
        <EmptyState>No items for this sport yet. Use Add item to start the list.</EmptyState>
      ) : (
        categories.map((cat) => (
          <section key={cat} aria-labelledby={`cat-${cat.replace(/\W+/g, '-')}`} className="flex flex-col gap-3">
            <h2 id={`cat-${cat.replace(/\W+/g, '-')}`} className="t-subhead">
              {cat}
            </h2>
            <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
              {items
                .filter((i) => i.category === cat)
                .map((i) => (
                  <li key={i.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[16px] font-medium text-ink">{i.name}</span>
                        {!i.active && <Chip tone="muted">Inactive</Chip>}
                        {i.safety_note && <Chip tone="info" icon="shield">Safety note</Chip>}
                      </div>
                      <p className="t-caption tabular">
                        {money(i.price_min_cents)} to {money(i.price_max_cents)}, default {money(i.default_price_cents)}
                        {i.sizes.length ? ` · Sizes ${i.sizes.join(', ')}` : ''}
                        {i.positions.length ? ` · ${i.positions.join(', ')}` : ''}
                      </p>
                      {i.description && <p className="t-caption">{i.description}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="t-caption tabular">Sort {i.sort}</span>
                      <CatalogItemButton item={i} sport={sport} categories={categories} />
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
