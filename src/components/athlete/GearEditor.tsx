'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip, NeedStatusChip } from '@/components/ui/Chip';
import { Switch, Select, Input, Field, Textarea } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { Banner } from '@/components/ui/Banner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { money, moneyWhole } from '@/lib/domain/money';
import { formatDate } from '@/lib/domain/text';
import { toggleNeed, updateNeed, moveNeed, requestItem, withdrawRequest, savePins } from '@/lib/app/athlete-actions';
import { PinEditor } from './PinEditor';
import type { EditNeed } from '@/lib/app/athlete-data';

type CatalogItem = { id: string; name: string; category: string; sizes: string[]; default_price_cents: number };

/** Editable gear list for players and guardians (ui-ux-spec 6.3 editable variant, 7.5). */
export function GearEditor({
  athleteId,
  needs,
  catalog,
  photoSrc,
  canEdit,
  first,
}: {
  athleteId: string;
  needs: EditNeed[];
  catalog: CatalogItem[];
  photoSrc: string | null;
  canEdit: boolean;
  first: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [requestOpen, setRequestOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const active = needs.filter((n) => n.status !== 'removed' && n.requestStatus === 'approved');
  const total = active.reduce((s, n) => s + n.priceCents, 0);
  const approvedForPins = active.filter((n) => !['delivered'].includes(n.status));

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? 'That did not work. Try again.');
      else if (success || r.message) toast(success ?? r.message!);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {!canEdit && <Banner tone="info">Your parent or guardian manages this list.</Banner>}
      {needs.length === 0 ? (
        <p className="t-body">Your coach hasn&apos;t added a gear list yet. You can request items below.</p>
      ) : (
        <ol className="flex flex-col gap-3" aria-busy={pending}>
          {needs.map((n, i) => {
            const removed = n.status === 'removed';
            const requested = n.requestStatus === 'pending';
            const locked = n.raisedCents > 0;
            const doneState = ['funded', 'purchased', 'delivered'].includes(n.status);
            return (
              <li key={n.id} className={cn('flex flex-col gap-3 rounded-md border p-4', removed ? 'border-dashed border-hairline-soft bg-chrome' : 'border-hairline-soft bg-canvas')}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[16px] font-medium', removed ? 'text-ink-meta' : 'text-ink')}>{n.name}</p>
                    <p className="t-caption tabular">
                      {requested ? 'Price set by your coach' : money(n.priceCents).replace(/\.00$/, '')}
                      {n.raisedCents > 0 && ` · ${moneyWhole(n.raisedCents)} raised`}
                    </p>
                  </div>
                  {requested ? (
                    <Chip tone="warn" icon="clock">
                      Waiting for coach
                    </Chip>
                  ) : doneState ? (
                    <NeedStatusChip status={n.status} date={n.deliveredAt ? formatDate(n.deliveredAt) : n.purchasedAt ? formatDate(n.purchasedAt) : null} />
                  ) : (
                    <div title={locked ? 'Already has donations. Ask your coach to remove it.' : undefined}>
                      <Switch
                        id={`inc-${n.id}`}
                        label={<span className="sr-only">Include {n.name}</span>}
                        checked={!removed}
                        disabled={!canEdit || pending || (locked && !removed)}
                        onChange={(e) => act(() => toggleNeed(athleteId, n.id, e.target.checked))}
                        className="min-h-0 py-0"
                      />
                    </div>
                  )}
                </div>
                {locked && !doneState && !removed && <p className="t-caption">Already has donations, so it stays on the list. Ask your coach to remove it.</p>}
                {requested && n.requestReason && <p className="t-caption">Your reason: {n.requestReason}</p>}
                {!removed && !doneState && canEdit && (
                  <div className="flex flex-wrap items-end gap-3">
                    {n.sizes.length > 0 ? (
                      <label className="flex flex-col gap-1">
                        <span className="t-caption">Size</span>
                        <Select
                          className="h-11 w-36"
                          defaultValue={n.variant ?? ''}
                          onChange={(e) => act(() => updateNeed(athleteId, n.id, { variant: e.target.value }), 'Saved')}
                        >
                          <option value="">Pick a size</option>
                          {n.sizes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1">
                        <span className="t-caption">Size or details</span>
                        <Input className="h-11 w-44" defaultValue={n.variant ?? ''} maxLength={40} onBlur={(e) => e.target.value !== (n.variant ?? '') && act(() => updateNeed(athleteId, n.id, { variant: e.target.value }), 'Saved')} />
                      </label>
                    )}
                    <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                      <span className="t-caption">Why this item (optional)</span>
                      <Input
                        className="h-11"
                        defaultValue={n.whyNote ?? ''}
                        maxLength={140}
                        placeholder="My current one is two sizes too small"
                        onBlur={(e) => e.target.value !== (n.whyNote ?? '') && act(() => updateNeed(athleteId, n.id, { whyNote: e.target.value }), 'Saved')}
                      />
                    </label>
                    <div className="flex gap-1">
                      <button type="button" aria-label={`Move ${n.name} up`} disabled={i === 0 || pending} onClick={() => act(() => moveNeed(athleteId, n.id, -1))} className="flex size-11 items-center justify-center rounded-md border border-hairline-soft text-ink-nav hover:bg-band disabled:opacity-40">
                        <ArrowUp size={18} aria-hidden />
                      </button>
                      <button type="button" aria-label={`Move ${n.name} down`} disabled={i === needs.length - 1 || pending} onClick={() => act(() => moveNeed(athleteId, n.id, 1))} className="flex size-11 items-center justify-center rounded-md border border-hairline-soft text-ink-nav hover:bg-band disabled:opacity-40">
                        <ArrowDown size={18} aria-hidden />
                      </button>
                    </div>
                    {requested && (
                      <Button variant="tertiary" size="sm" onClick={() => act(() => withdrawRequest(athleteId, n.id), 'Request withdrawn')}>
                        Withdraw request
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-[16px] font-medium text-ink tabular" aria-live="polite">
        {active.length} {active.length === 1 ? 'item' : 'items'} · {money(total).replace(/\.00$/, '')}
      </p>

      {canEdit && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" onClick={() => setRequestOpen(true)}>
            <Plus size={18} aria-hidden /> Request an item
          </Button>
          {photoSrc && approvedForPins.length > 0 && (
            <Button variant="secondary" onClick={() => setPinsOpen(true)}>
              <MapPin size={18} aria-hidden /> Place items on your photo
            </Button>
          )}
        </div>
      )}

      <RequestSheet open={requestOpen} onClose={() => setRequestOpen(false)} catalog={catalog} athleteId={athleteId} first={first} onDone={() => router.refresh()} />
      {photoSrc && pinsOpen && (
        <PinEditor
          open={pinsOpen}
          onClose={() => setPinsOpen(false)}
          photoSrc={photoSrc}
          items={approvedForPins.map((n, i) => ({ id: n.id, number: i + 1, name: n.name, x: n.pinX, y: n.pinY }))}
          onSave={async (pins) => {
            const r = await savePins(athleteId, pins.map((p) => ({ needId: p.id, x: p.x, y: p.y })));
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

function RequestSheet({ open, onClose, catalog, athleteId, first, onDone }: { open: boolean; onClose: () => void; catalog: CatalogItem[]; athleteId: string; first: string; onDone: () => void }) {
  const [catalogId, setCatalogId] = useState('');
  const [custom, setCustom] = useState('');
  const [size, setSize] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const item = catalog.find((c) => c.id === catalogId);
  const reset = () => {
    setCatalogId('');
    setCustom('');
    setSize('');
    setReason('');
    setError(null);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await requestItem(athleteId, { catalogId: catalogId && catalogId !== 'custom' ? catalogId : null, name: custom, size, reason });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    reset();
    onClose();
    onDone();
  };
  const groups = [...new Set(catalog.map((c) => c.category))];
  return (
    <Sheet open={open} onClose={onClose} title="Request an item" size="md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="t-body">Requests go to the coach. Once approved, the item shows on {first === 'you' ? 'your' : 'the'} page with its price.</p>
        {error && <Banner tone="error">{error}</Banner>}
        <Field id="req-item" label="Item" required>
          <Select id="req-item" value={catalogId} onChange={(e) => setCatalogId(e.target.value)} required>
            <option value="">Choose an item</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {catalog
                  .filter((c) => c.category === g)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (about {moneyWhole(c.default_price_cents)})
                    </option>
                  ))}
              </optgroup>
            ))}
            <option value="custom">Something else</option>
          </Select>
        </Field>
        {catalogId === 'custom' && (
          <Field id="req-name" label="What do you need?" required>
            <Input id="req-name" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={80} required />
          </Field>
        )}
        <Field id="req-size" label="Size" optional>
          {item?.sizes.length ? (
            <Select id="req-size" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">Pick a size</option>
              {item.sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          ) : (
            <Input id="req-size" value={size} onChange={(e) => setSize(e.target.value)} maxLength={40} />
          )}
        </Field>
        <Field id="req-reason" label="Why do you need it?" required helper="A sentence is enough. Only your coach sees this.">
          <Textarea id="req-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required aria-describedby="req-reason-help" />
        </Field>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} loadingLabel="Sending">
            Send to coach
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
