'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Section } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { AddItemSheet, NeedRow, type ManagerNeed } from '@/components/manager/GearRows';
import { addNeed, moveTeamNeed, setNeedActive, setNeedPrice, updateNeedDetails } from '@/lib/app/team-actions';
import { moneyWhole } from '@/lib/domain/money';

type Catalog = { id: string; name: string; category: string; sizes: string[]; default_price_cents: number; price_min_cents: number; price_max_cents: number };

/** Team equipment (sleds, nets, jersey sets): needs that belong to the team, not a player. */
export function TeamGear({ teamId, needs, catalog, canEdit }: { teamId: string; needs: ManagerNeed[]; catalog: Catalog[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (r.message ?? 'Saved') : (r.error ?? 'Something went wrong.'));
      router.refresh();
    });
  const active = needs.filter((n) => n.status !== 'removed');
  return (
    <Section
      title="Team equipment"
      id="team-gear"
      actions={
        canEdit ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden /> Add team item
          </Button>
        ) : undefined
      }
    >
      <p className="t-caption -mt-2">
        Shared gear shown on the team page. {active.length} items · {moneyWhole(active.reduce((s, n) => s + n.priceCents, 0))}
      </p>
      {needs.length === 0 ? (
        <p className="t-body">No team equipment listed.</p>
      ) : (
        <ol className="flex flex-col gap-3" aria-busy={pending}>
          {needs.map((n, i) => (
            <NeedRow
              key={n.id}
              n={n}
              first={i === 0}
              last={i === needs.length - 1}
              canEdit={canEdit}
              busy={pending}
              onPrice={(c) => act(() => setNeedPrice(teamId, n.id, c))}
              onVariant={(v) => act(() => updateNeedDetails(teamId, n.id, { variant: v }))}
              onActive={(on) => act(() => setNeedActive(teamId, n.id, on))}
              onMove={(d) => act(() => moveTeamNeed(teamId, n.id, d))}
            />
          ))}
        </ol>
      )}
      <AddItemSheet
        open={adding}
        onClose={() => setAdding(false)}
        catalog={catalog}
        onAdd={async (data) => {
          const r = await addNeed(teamId, { athleteId: null, ...data });
          if (!r.ok) return r.error;
          toast('Item added');
          setAdding(false);
          router.refresh();
          return null;
        }}
      />
    </Section>
  );
}
