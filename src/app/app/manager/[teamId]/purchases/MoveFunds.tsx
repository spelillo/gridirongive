'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft } from 'lucide-react';
import { money } from '@/lib/domain/money';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea, describedBy } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { moveFunds } from '@/lib/app/team-money-actions';

export interface MoveTarget {
  id: string;
  label: string;
  maxCents: number;
}

/**
 * "Move funds" (rebuild-architecture 3, money rules): removed or overfunded
 * items go to the team fund, and the team fund can finish an open item. A
 * reason is required because donors see it.
 */
export function MoveFunds({ teamId, from, targets, label = 'Move funds', compact }: { teamId: string; from: { id: string; label: string; availableCents: number }; targets: MoveTarget[]; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(targets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const target = targets.find((t) => t.id === to);
  const max = Math.min(from.availableCents, target?.maxCents ?? from.availableCents);
  const toFund = target?.label === 'Team fund';
  const ids = `mf-${from.id.slice(0, 8)}`;

  const submit = () =>
    start(async () => {
      const r = await moveFunds(teamId, { fromNeedId: from.id, toNeedId: to, amount, reason });
      if (!r.ok) {
        setErrors({ [r.field ?? 'reason']: r.error });
        return;
      }
      toast(r.message ?? 'Moved');
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button
        variant={compact ? 'tertiary' : 'secondary'}
        size={compact ? undefined : 'sm'}
        onClick={() => {
          setAmount((max / 100).toFixed(2));
          setErrors({});
          setOpen(true);
        }}
        aria-label={compact ? `Move funds from ${from.label}` : undefined}
      >
        <ArrowRightLeft size={16} aria-hidden /> {compact ? 'Move' : label}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        locked={pending}
        title="Move funds"
        initialFocusSelector={`#${ids}-amount`}
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} loadingLabel="Moving">
              Move {amount ? `$${amount}` : 'funds'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="t-body">
            From <span className="font-medium text-ink">{from.label}</span>, which has <span className="tabular">{money(from.availableCents)}</span> available.
          </p>
          {targets.length > 1 ? (
            <Field id={`${ids}-to`} label="Move to" required error={errors.to}>
              <Select id={`${ids}-to`} value={to} onChange={(e) => setTo(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} (needs {money(t.maxCents)})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="t-body">
              To <span className="font-medium text-ink">{target?.label}</span>
            </p>
          )}
          <Field id={`${ids}-amount`} label="Amount" required error={errors.amount} helper={`Up to ${money(max)}.`}>
            <div className="relative sm:w-48">
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-meta">
                $
              </span>
              <Input
                id={`${ids}-amount`}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7 tabular"
                aria-invalid={Boolean(errors.amount) || undefined}
                aria-describedby={describedBy(`${ids}-amount`, errors.amount, true)}
              />
            </div>
          </Field>
          <Field id={`${ids}-reason`} label="Reason" required error={errors.reason} helper={toFund ? 'Donors and the family get an email with this reason.' : 'The family sees this in their notifications.'}>
            <Textarea
              id={`${ids}-reason`}
              value={reason}
              maxLength={300}
              rows={2}
              onChange={(e) => setReason(e.target.value)}
              placeholder={toFund ? 'For example: The player left the team.' : undefined}
              aria-invalid={Boolean(errors.reason) || undefined}
              aria-describedby={describedBy(`${ids}-reason`, errors.reason, true)}
            />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
