'use client';
import { useState, useTransition } from 'react';
import { AddItemSheet, NeedRow, RequestRow, type Catalog, type ManagerNeed, type Res } from '@/components/manager/GearRows';
export type { ManagerNeed } from '@/components/manager/GearRows';
import { useRouter } from 'next/navigation';
import { MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { PinEditor } from '@/components/athlete/PinEditor';
import { savePins } from '@/lib/app/athlete-actions';
import { addNeed, approveGearRequest, moveTeamNeed, rejectGearRequest, setNeedActive, setNeedPrice, updateNeedDetails } from '@/lib/app/team-actions';
import { moneyWhole } from '@/lib/domain/money';

/** Staff gear editor for one athlete: price overrides within catalog bounds, requests, pins (ui-ux-spec 8.5). */
export function ManagerGear({
  teamId,
  athleteId,
  needs,
  catalog,
  photoSrc,
  canEdit,
  first,
}: {
  teamId: string;
  athleteId: string;
  needs: ManagerNeed[];
  catalog: Catalog[];
  photoSrc: string | null;
  canEdit: boolean;
  first: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [pins, setPins] = useState(false);
  const act = (fn: () => Promise<Res>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (r.message ?? 'Saved') : (r.error ?? 'Something went wrong.'));
      router.refresh();
    });

  const requests = needs.filter((n) => n.requestStatus === 'pending' && n.status !== 'removed');
  const list = needs.filter((n) => n.requestStatus === 'approved');
  const active = list.filter((n) => n.status !== 'removed');
  const total = active.reduce((s, n) => s + n.priceCents, 0);
  const pinnable = active.filter((n) => n.status !== 'delivered');

  return (
    <div className="flex flex-col gap-6">
      {requests.length > 0 && (
        <section aria-labelledby="req-h" className="flex flex-col gap-3">
          <h2 id="req-h" className="t-subhead">
            Requests from {first}
          </h2>
          <ul className="flex flex-col gap-3">
            {requests.map((n) => (
              <RequestRow key={n.id} n={n} canEdit={canEdit} busy={pending} onApprove={(c) => act(() => approveGearRequest(teamId, n.id, c))} onReject={(note) => act(() => rejectGearRequest(teamId, n.id, note))} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="gear-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="gear-h" className="t-subhead">
            Gear list <span className="t-caption font-normal">· {active.length} items · {moneyWhole(total)}</span>
          </h2>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {photoSrc && pinnable.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setPins(true)}>
                  <MapPin size={16} aria-hidden /> Place on photo
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                <Plus size={16} aria-hidden /> Add item
              </Button>
            </div>
          )}
        </div>
        {list.length === 0 ? (
          <p className="t-body">No gear on the list. Add items or apply a template from the roster.</p>
        ) : (
          <ol className="flex flex-col gap-3" aria-busy={pending}>
            {list.map((n, i) => (
              <NeedRow
                key={n.id}
                n={n}
                first={i === 0}
                last={i === list.length - 1}
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
      </section>

      <AddItemSheet
        open={adding}
        onClose={() => setAdding(false)}
        catalog={catalog}
        onAdd={async (data) => {
          const r = await addNeed(teamId, { athleteId, ...data });
          if (!r.ok) return r.error;
          toast('Item added');
          setAdding(false);
          router.refresh();
          return null;
        }}
      />
      {photoSrc && pins && (
        <PinEditor
          open={pins}
          onClose={() => setPins(false)}
          photoSrc={photoSrc}
          items={pinnable.map((n, i) => ({ id: n.id, number: i + 1, name: n.name, x: n.pinX, y: n.pinY }))}
          onSave={async (p) => {
            const r = await savePins(athleteId, p.map((x) => ({ needId: x.id, x: x.x, y: x.y })));
            if (!r.ok) {
              toast(r.error);
              return false;
            }
            toast('Markers saved');
            router.refresh();
            return true;
          }}
        />
      )}
    </div>
  );
}

