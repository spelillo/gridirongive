'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip, NeedStatusChip } from '@/components/ui/Chip';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { Meter } from '@/components/ui/Meter';
import { money, moneyWhole, parseDollarsToCents } from '@/lib/domain/money';
import { cn } from '@/components/ui/cn';

/** Gear rows shared by the athlete detail page, team equipment and the approvals queue. */
export interface ManagerNeed {
  id: string;
  name: string;
  variant: string | null;
  sizes: string[];
  priceCents: number;
  raisedCents: number;
  status: string;
  requestStatus: string;
  requestReason: string | null;
  whyNote: string | null;
  priceNote: string | null;
  minCents: number | null;
  maxCents: number | null;
  safetyNote: string | null;
  pinX: number | null;
  pinY: number | null;
  purchasedAt: string | null;
  deliveredAt: string | null;
}

export type Catalog = { id: string; name: string; category: string; sizes: string[]; default_price_cents: number; price_min_cents: number; price_max_cents: number };
export type Res = { ok: boolean; message?: string; error?: string };

const bounds = (n: { minCents: number | null; maxCents: number | null }) =>
  n.minCents != null ? `Typical ${moneyWhole(n.minCents)} to ${moneyWhole(n.maxCents!)}` : 'Custom item';

function PriceInput({ n, disabled, onSave }: { n: ManagerNeed; disabled: boolean; onSave: (cents: number) => void }) {
  const [v, setV] = useState((n.priceCents / 100).toFixed(2));
  const [err, setErr] = useState<string | null>(null);
  const id = `price-${n.id}`;
  return (
    <Field id={id} label="Price" helper={bounds(n)} error={err} className="w-40">
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-meta">
          $
        </span>
        <Input
          id={id}
          inputMode="decimal"
          value={v}
          disabled={disabled}
          className="pl-7 tabular"
          aria-invalid={Boolean(err)}
          aria-describedby={err ? `${id}-error` : `${id}-help`}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            const c = parseDollarsToCents(v);
            if (c === null) return setErr('Enter a dollar amount.');
            if (n.minCents != null && (c < n.minCents || c > n.maxCents!)) return setErr(`Keep it ${moneyWhole(n.minCents)} to ${moneyWhole(n.maxCents!)}.`);
            if (c < n.raisedCents) return setErr(`At least ${money(n.raisedCents)} was given.`);
            setErr(null);
            if (c !== n.priceCents) onSave(c);
          }}
        />
      </div>
    </Field>
  );
}

export function NeedRow({
  n,
  first,
  last,
  canEdit,
  busy,
  onPrice,
  onVariant,
  onActive,
  onMove,
}: {
  n: ManagerNeed;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  busy: boolean;
  onPrice: (c: number) => void;
  onVariant: (v: string) => void;
  onActive: (on: boolean) => void;
  onMove: (d: -1 | 1) => void;
}) {
  const removed = n.status === 'removed';
  const locked = ['purchased', 'delivered'].includes(n.status);
  return (
    <li className={cn('flex flex-col gap-3 rounded-md border border-hairline-soft p-4', removed && 'bg-chrome')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={cn('text-[16px] font-medium', removed ? 'text-ink-meta line-through' : 'text-ink')}>
            {n.name}
            {n.variant && <span className="font-normal text-ink-meta"> · {n.variant}</span>}
          </p>
          {n.whyNote && <p className="t-caption">&ldquo;{n.whyNote}&rdquo;</p>}
          {n.safetyNote && !removed && (
            <p className="t-caption flex items-start gap-1">
              <ShieldAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-warn" />
              {n.safetyNote}
            </p>
          )}
        </div>
        <NeedStatusChip status={n.status} date={n.deliveredAt ?? n.purchasedAt} />
      </div>
      {!removed && <Meter raised={n.raisedCents} goal={n.priceCents || 1} compact />}
      {canEdit && (
        <div className="flex flex-wrap items-start gap-3">
          {!removed && !locked && <PriceInput key={n.priceCents} n={n} disabled={busy} onSave={onPrice} />}
          {!removed && !locked && n.sizes.length > 0 && (
            <Field id={`size-${n.id}`} label="Size" className="w-36">
              <Select id={`size-${n.id}`} defaultValue={n.variant ?? ''} disabled={busy} onChange={(e) => onVariant(e.target.value)}>
                <option value="">Not set</option>
                {n.sizes.map((s) => (
                  <option key={s} value={`Adult ${s}`}>
                    Adult {s}
                  </option>
                ))}
                {n.variant && !n.sizes.some((s) => `Adult ${s}` === n.variant) && <option value={n.variant}>{n.variant}</option>}
              </Select>
            </Field>
          )}
          <div className="ml-auto flex items-center gap-2 self-end">
            {!removed && (
              <>
                <button type="button" aria-label={`Move ${n.name} up`} disabled={first || busy} onClick={() => onMove(-1)} className="flex size-11 items-center justify-center rounded-md border border-hairline-soft hover:bg-band disabled:opacity-40">
                  <ArrowUp size={18} aria-hidden />
                </button>
                <button type="button" aria-label={`Move ${n.name} down`} disabled={last || busy} onClick={() => onMove(1)} className="flex size-11 items-center justify-center rounded-md border border-hairline-soft hover:bg-band disabled:opacity-40">
                  <ArrowDown size={18} aria-hidden />
                </button>
              </>
            )}
            {removed ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onActive(true)}>
                Put back
              </Button>
            ) : (
              !locked &&
              (n.raisedCents > 0 ? (
                <span className="t-caption w-24 text-right">Has gifts, so it stays</span>
              ) : (
                <Button size="sm" variant="tertiary" disabled={busy} onClick={() => onActive(false)}>
                  Remove
                </Button>
              ))
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function RequestRow({ n, canEdit, busy, onApprove, onReject }: { n: ManagerNeed; canEdit: boolean; busy: boolean; onApprove: (c: number) => void; onReject: (note: string) => void }) {
  const [price, setPrice] = useState(((n.minCents != null ? n.priceCents : n.priceCents > 100 ? n.priceCents : 0) / 100 || '').toString());
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const cents = parseDollarsToCents(price);
  const id = `rq-${n.id}`;
  return (
    <li className="flex flex-col gap-3 rounded-md border border-warn/40 bg-warn-bg/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[16px] font-medium text-ink">
          {n.name}
          {n.variant && <span className="font-normal text-ink-meta"> · {n.variant}</span>}
        </p>
        <Chip tone="warn" icon="clock">Requested</Chip>
      </div>
      {n.requestReason && <p className="t-body">&ldquo;{n.requestReason}&rdquo;</p>}
      {canEdit && !rejecting && (
        <div className="flex flex-wrap items-end gap-3">
          <Field id={id} label="Price" helper={bounds(n)} className="w-40">
            <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby={`${id}-help`} />
          </Field>
          <Button size="sm" disabled={busy || cents === null} onClick={() => cents !== null && onApprove(cents)}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
            Decline
          </Button>
        </div>
      )}
      {canEdit && rejecting && (
        <div className="flex flex-col gap-3">
          <Field id={`${id}-note`} label="Note to the family" optional>
            <Textarea id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} />
          </Field>
          <div className="flex gap-3">
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onReject(note)}>
              Decline request
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function AddItemSheet({
  open,
  onClose,
  catalog,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  catalog: Catalog[];
  onAdd: (d: { catalogId: string | null; name?: string; variant?: string; priceCents: number; whyNote?: string }) => Promise<string | null>;
}) {
  const [catalogId, setCatalogId] = useState('');
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [why, setWhy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const item = catalog.find((c) => c.id === catalogId);
  const groups = [...new Set(catalog.map((c) => c.category))];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a gear item"
      footer={
        <div className="flex gap-3">
          <Button
            loading={busy}
            onClick={async () => {
              const c = parseDollarsToCents(price);
              if (!catalogId) return setErr('Pick an item.');
              if (catalogId === 'custom' && !name.trim()) return setErr('Name the item.');
              if (c === null) return setErr('Enter a price.');
              setBusy(true);
              const e = await onAdd({ catalogId: catalogId === 'custom' ? null : catalogId, name, variant: size, priceCents: c, whyNote: why });
              setBusy(false);
              setErr(e);
              if (!e) {
                setCatalogId('');
                setName('');
                setSize('');
                setPrice('');
                setWhy('');
              }
            }}
          >
            Add item
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id="ai-item" label="Item" required>
          <Select
            id="ai-item"
            value={catalogId}
            onChange={(e) => {
              setCatalogId(e.target.value);
              const c = catalog.find((x) => x.id === e.target.value);
              if (c) setPrice((c.default_price_cents / 100).toFixed(2));
              setSize('');
            }}
          >
            <option value="">Choose an item</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {catalog
                  .filter((c) => c.category === g)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            <option value="custom">Something else</option>
          </Select>
        </Field>
        {catalogId === 'custom' && (
          <Field id="ai-name" label="Item name" required>
            <Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
        )}
        {item && item.sizes.length > 0 && (
          <Field id="ai-size" label="Size" optional>
            <Select id="ai-size" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">Not set</option>
              {item.sizes.map((s) => (
                <option key={s} value={`Adult ${s}`}>
                  Adult {s}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field id="ai-price" label="Price" required helper={item ? `Typical ${moneyWhole(item.price_min_cents)} to ${moneyWhole(item.price_max_cents)}` : undefined}>
          <Input id="ai-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby={item ? 'ai-price-help' : undefined} />
        </Field>
        <Field id="ai-why" label="Why it's needed" optional helper="Shown on the gear card. 140 characters.">
          <Input id="ai-why" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={140} aria-describedby="ai-why-help" />
        </Field>
        {err && (
          <p role="alert" className="text-[14px] text-error">
            {err}
          </p>
        )}
      </div>
    </Sheet>
  );
}
