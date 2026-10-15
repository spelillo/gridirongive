'use client';
import { forwardRef } from 'react';
import { Meter } from '@/components/ui/Meter';
import { NeedStatusChip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { moneyWhole } from '@/lib/domain/money';
import { formatDate } from '@/lib/domain/text';

export interface CardNeed {
  id: string;
  number: number;
  name: string;
  variant: string | null;
  priceCents: number;
  raisedCents: number;
  status: string;
  whyNote: string | null;
  purchasedAt: string | null;
  deliveredAt: string | null;
}

/** Public gear card (ui-ux-spec 6.3). */
export const GearCard = forwardRef<HTMLLIElement, {
  need: CardNeed;
  highlighted: boolean;
  flashKey: number;
  canGive: boolean;
  onGive: () => void;
  onHover: (on: boolean) => void;
}>(function GearCard({ need, highlighted, flashKey, canGive, onGive, onHover }, ref) {
  const open = need.status === 'open' || need.status === 'partially_funded';
  const left = Math.max(need.priceCents - need.raisedCents, 0);
  const date = need.status === 'delivered' && need.deliveredAt ? formatDate(need.deliveredAt) : need.status === 'purchased' && need.purchasedAt ? formatDate(need.purchasedAt) : null;
  return (
    <li
      ref={ref}
      id={`need-${need.id}`}
      key={flashKey}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={cn(
        'flex scroll-mt-24 flex-col gap-3 rounded-md border bg-canvas p-4 transition-colors duration-150',
        highlighted ? 'border-primary' : 'border-hairline-soft',
        flashKey > 0 && 'gg-flash',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[14px] font-medium tabular',
            open ? 'border-2 border-primary text-primary' : need.status === 'funded' ? 'bg-funded text-white' : 'bg-ink text-white',
          )}
        >
          {need.number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="t-subhead">
            <span className="sr-only">{need.number}. </span>
            {need.name}
          </h3>
          {need.variant && <p className="t-caption mt-0.5">{need.variant}</p>}
        </div>
        {!open && <NeedStatusChip status={need.status} date={date} />}
      </div>
      <div className="flex flex-col gap-1">
        <Meter raised={need.raisedCents} goal={need.priceCents} compact showText={false} label={`${need.name}: ${moneyWhole(need.raisedCents)} of ${moneyWhole(need.priceCents)}`} />
        <div className="flex justify-between text-[14px] leading-5 tabular">
          <span className="text-ink-body">
            {moneyWhole(need.raisedCents)} <span className="text-ink-meta">of {moneyWhole(need.priceCents)}</span>
          </span>
          {open && <span className="font-medium text-ink">{moneyWhole(left)} left</span>}
        </div>
      </div>
      {need.whyNote && <p className="t-caption">{need.whyNote}</p>}
      {open && canGive && (
        <Button variant="secondary" onClick={onGive} className="w-full sm:w-auto sm:self-start" aria-label={`Give to ${need.name}`}>
          Give
        </Button>
      )}
    </li>
  );
});
