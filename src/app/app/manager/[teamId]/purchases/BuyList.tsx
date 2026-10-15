'use client';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileCheck2 } from 'lucide-react';
import type { BuyGroup } from '@/lib/domain/buylist';
import { money, parseDollarsToCents } from '@/lib/domain/money';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Checkbox, Field, Input, Textarea, describedBy } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { recordPurchase } from '@/lib/app/team-money-actions';
import { uploadTeamFile } from '@/lib/app/upload-client';
import { MoveFunds, type MoveTarget } from './MoveFunds';

export interface NeedExtra {
  athleteId: string | null;
  hidden: boolean;
}

type Fund = { id: string; availableCents: number } | null;

const dollars = (c: number) => (c / 100).toFixed(2);

/** Funded needs grouped by item and size, with checkboxes (ui-ux-spec 8.9). */
export function BuyList({ teamId, groups, extras, fund, canEdit, fundTarget }: { teamId: string; groups: BuyGroup[]; extras: Record<string, NeedExtra>; fund: Fund; canEdit: boolean; fundTarget: MoveTarget | null }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [fundOnly, setFundOnly] = useState(false);
  const all = useMemo(() => groups.flatMap((g) => g.needs), [groups]);
  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const picked = all.filter((n) => selected.has(n.id));
  const pickedCents = picked.reduce((s, n) => s + n.raised_cents, 0);

  return (
    <div className="flex flex-col gap-4">
      {fund && (
        <p className="t-caption">
          Team fund: <span className="font-medium text-ink tabular">{money(fund.availableCents)}</span> unspent. It can pay for team gear or cover the gap on a purchase.
        </p>
      )}
      {groups.length > 0 && (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => {
            const ids = g.needs.map((n) => n.id);
            const allOn = ids.every((id) => selected.has(id));
            const someOn = !allOn && ids.some((id) => selected.has(id));
            const gid = `g-${g.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
            return (
              <li key={g.name} className="rounded-md border border-hairline-soft">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline-soft bg-chrome px-4 py-2">
                  {canEdit ? (
                    <label htmlFor={gid} className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
                      <input
                        id={gid}
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={allOn}
                        ref={(el) => {
                          if (el) el.indeterminate = someOn;
                        }}
                        onChange={(e) => toggle(ids, e.target.checked)}
                      />
                      <GroupTitle g={g} />
                    </label>
                  ) : (
                    <div className="flex min-h-11 flex-1 items-center">
                      <GroupTitle g={g} />
                    </div>
                  )}
                  <span className="t-caption tabular">{money(g.availableCents)} available</span>
                </div>
                <ul className="divide-y divide-hairline-soft">
                  {g.needs.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center justify-between gap-x-4 px-4">
                      {canEdit ? (
                        <Checkbox
                          id={`n-${n.id}`}
                          checked={selected.has(n.id)}
                          onChange={(e) => toggle([n.id], e.target.checked)}
                          label={
                            <>
                              {n.athlete_name} <span className="text-ink-meta">· {n.variant || 'No size'}</span>
                            </>
                          }
                          hint={extras[n.id]?.hidden ? 'Player page hidden or player left' : undefined}
                          className="flex-1"
                        />
                      ) : (
                        <p className="min-h-11 flex-1 py-2.5">
                          {n.athlete_name} <span className="text-ink-meta">· {n.variant || 'No size'}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="t-caption tabular">{money(n.raised_cents)}</span>
                        {canEdit && fundTarget && (
                          <MoveFunds teamId={teamId} from={{ id: n.id, label: `${n.name} · ${n.athlete_name}`, availableCents: n.raised_cents }} targets={[fundTarget]} compact />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="sticky bottom-[72px] z-10 flex flex-col gap-3 border-t border-hairline-soft bg-canvas py-3 sm:flex-row sm:items-center sm:justify-between lg:bottom-0">
          <p className="t-caption tabular" aria-live="polite">
            {picked.length ? `${picked.length} selected · ${money(pickedCents)} raised for them` : 'Select the items you bought.'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {fund && fund.availableCents > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setFundOnly(true);
                  setFormOpen(true);
                }}
              >
                Team fund purchase
              </Button>
            )}
            <Button
              disabled={!picked.length}
              onClick={() => {
                setFundOnly(false);
                setFormOpen(true);
              }}
            >
              Record purchase
            </Button>
          </div>
        </div>
      )}

      {formOpen && (
        <PurchaseForm
          teamId={teamId}
          lines={fundOnly ? [] : picked.map((n) => ({ id: n.id, label: `${n.name} · ${n.athlete_name}${n.variant ? ` · ${n.variant}` : ''}`, raised: n.raised_cents }))}
          fund={fund}
          fundOnly={fundOnly}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setSelected(new Set());
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

function GroupTitle({ g }: { g: BuyGroup }) {
  return (
    <span className="flex flex-col">
      <span className="text-[16px] font-medium text-ink">
        {g.name} × {g.count}
      </span>
      <span className="t-caption">{g.sizes.map((s) => `${s.size} ×${s.count}`).join(', ')}</span>
    </span>
  );
}

type Line = { id: string; label: string; raised: number };

function PurchaseForm({ teamId, lines, fund, fundOnly, onClose, onSaved }: { teamId: string; lines: Line[]; fund: Fund; fundOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(today);
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, dollars(l.raised)])));
  const [useFund, setUseFund] = useState(fundOnly);
  const [fundAmount, setFundAmount] = useState('');
  const [receipt, setReceipt] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const totalCents = parseDollarsToCents(total);
  const lineCents = lines.reduce((s, l) => s + (parseDollarsToCents(amounts[l.id] ?? '') ?? 0), 0);
  const raisedCents = lines.reduce((s, l) => s + l.raised, 0);
  const fundCents = useFund ? (parseDollarsToCents(fundAmount) ?? 0) : 0;
  const available = raisedCents + fundCents;
  const over = totalCents !== null && totalCents > available ? totalCents - available : 0;
  const lineOver = lines.filter((l) => (parseDollarsToCents(amounts[l.id] ?? '') ?? 0) > l.raised);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setErrors((e) => ({ ...e, receipt: '' }));
    const r = await uploadTeamFile(teamId, 'receipt', file);
    setUploading(false);
    if (r.ok) setReceipt({ key: r.key, name: file.name });
    else {
      setReceipt(null);
      setErrors((e) => ({ ...e, receipt: r.error }));
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!vendor.trim()) e.vendor = 'Enter the vendor name.';
    if (!date) e['order-date'] = 'Enter the order date.';
    if (!totalCents) e.total = 'Enter the total you paid, like 289.99.';
    if (!receipt) e.receipt = 'Upload the receipt (a photo or PDF).';
    if (useFund && (!fundCents || (fund && fundCents > fund.availableCents))) e['fund-amount'] = fund ? `Enter up to ${money(fund.availableCents)}.` : 'No team fund.';
    if (lineOver.length) e.lines = 'An item amount is more than what was raised for it.';
    if (!lines.length && !useFund) e.lines = 'Pick at least one item or use the team fund.';
    return e;
  };

  const submit = () => {
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.values(e).some(Boolean)) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    start(async () => {
      const payload = lines.map((l) => ({ needId: l.id, amount: amounts[l.id] ?? '0' }));
      if (useFund && fund) payload.push({ needId: fund.id, amount: fundAmount });
      const r = await recordPurchase(teamId, { vendor, orderDate: date, total, receiptKey: receipt!.key, note, lines: payload });
      if (!r.ok) {
        if (r.field) setErrors({ [r.field]: r.error });
        setFormError(r.error);
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }
      toast(r.message ?? 'Purchase saved');
      onSaved();
      router.refresh();
    });
  };

  const errorList = Object.entries(errors).filter(([, v]) => v);

  return (
    <Sheet
      open
      onClose={onClose}
      locked={pending}
      size="lg"
      title={fundOnly ? 'Record a team fund purchase' : 'Record purchase'}
      initialFocusSelector="#vendor"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} loadingLabel="Saving" disabled={uploading}>
            Save purchase
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          {(errorList.length > 0 || formError) && (
            <Banner tone="error" rounded>
              <p className="font-medium">Fix these to save:</p>
              <ul className="list-disc pl-5">
                {formError && !errorList.some(([, v]) => v === formError) && <li>{formError}</li>}
                {errorList.map(([k, v]) => (
                  <li key={k}>
                    <a href={`#${k}`}>{v}</a>
                  </li>
                ))}
              </ul>
            </Banner>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="vendor" label="Vendor" required error={errors.vendor} className="sm:col-span-2">
            <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={80} autoComplete="organization" aria-invalid={Boolean(errors.vendor) || undefined} aria-describedby={describedBy('vendor', errors.vendor)} />
          </Field>
          <Field id="order-date" label="Order date" required error={errors['order-date']}>
            <Input id="order-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors['order-date']) || undefined} aria-describedby={describedBy('order-date', errors['order-date'])} />
          </Field>
          <Field id="total" label="Total paid" required error={errors.total} helper="Including tax and shipping.">
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-meta">
                $
              </span>
              <Input id="total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className="pl-7 tabular" aria-invalid={Boolean(errors.total) || undefined} aria-describedby={describedBy('total', errors.total, true)} />
            </div>
          </Field>
        </div>

        <Field id="receipt" label="Receipt" required error={errors.receipt} helper="A photo or PDF, up to 4 MB. Only team staff can see it.">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              id="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
              aria-invalid={Boolean(errors.receipt) || undefined}
              aria-describedby={describedBy('receipt', errors.receipt, true)}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner /> : <Upload size={18} aria-hidden />}
              {receipt ? 'Replace file' : 'Upload receipt'}
            </Button>
            <span className="t-caption" aria-live="polite">
              {uploading ? 'Uploading' : receipt ? (
                <span className="inline-flex items-center gap-1.5 text-funded">
                  <FileCheck2 size={16} aria-hidden /> {receipt.name}
                </span>
              ) : null}
            </span>
          </div>
        </Field>

        {lines.length > 0 && (
          <fieldset className="flex flex-col gap-2" id="lines" tabIndex={-1}>
            <legend className="t-label mb-1">Items covered</legend>
            <p className="t-caption">Prefilled with what was raised for each item. Lower an amount if the item cost less.</p>
            <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
              {lines.map((l) => {
                const bad = (parseDollarsToCents(amounts[l.id] ?? '') ?? 0) > l.raised;
                return (
                  <li key={l.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <label htmlFor={`amt-${l.id}`} className="text-[15px] text-ink-body">
                      {l.label}
                      <span className="t-caption block">{money(l.raised)} raised</span>
                    </label>
                    <div className="relative w-full sm:w-36">
                      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-meta">
                        $
                      </span>
                      <Input
                        id={`amt-${l.id}`}
                        inputMode="decimal"
                        value={amounts[l.id] ?? ''}
                        onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))}
                        className="pl-7 text-right tabular"
                        aria-invalid={bad || undefined}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {errors.lines && <p className="text-[14px] text-error">{errors.lines}</p>}
          </fieldset>
        )}

        {fund && (
          <div className="flex flex-col gap-2 rounded-md border border-hairline-soft p-3">
            <Checkbox
              id="use-fund"
              checked={useFund}
              onChange={(e) => setUseFund(e.target.checked)}
              disabled={fundOnly}
              label="Use money from the team fund"
              hint={`${money(fund.availableCents)} unspent`}
            />
            {useFund && (
              <Field id="fund-amount" label="Amount from the team fund" required error={errors['fund-amount']}>
                <div className="relative sm:w-48">
                  <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-meta">
                    $
                  </span>
                  <Input
                    id="fund-amount"
                    inputMode="decimal"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="pl-7 tabular"
                    aria-invalid={Boolean(errors['fund-amount']) || undefined}
                    aria-describedby={describedBy('fund-amount', errors['fund-amount'])}
                  />
                </div>
              </Field>
            )}
          </div>
        )}

        <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[15px]">
          {lines.length > 0 && (
            <>
              <dt className="t-caption">Raised for these items</dt>
              <dd className="tabular">{money(raisedCents)}</dd>
              <dt className="t-caption">Recorded against items</dt>
              <dd className="tabular">{money(lineCents)}</dd>
            </>
          )}
          {useFund && (
            <>
              <dt className="t-caption">From the team fund</dt>
              <dd className="tabular">{money(fundCents)}</dd>
            </>
          )}
          <dt className="t-caption">Total paid</dt>
          <dd className="tabular font-medium text-ink">{totalCents ? money(totalCents) : '$0.00'}</dd>
        </dl>
        <div aria-live="polite">
          {over > 0 && (
            <Banner tone="warn" rounded>
              You paid {money(over)} more than the money available for these items. Add team fund money, or check the total.
            </Banner>
          )}
        </div>

        <Field id="note" label="Note" optional>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
        </Field>
        <p className="t-caption">Saving moves the items to Purchased and emails their donors.</p>
      </form>
    </Sheet>
  );
}
