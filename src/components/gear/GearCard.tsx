'use client';
import { forwardRef } from 'react';
import { Meter } from '@/components/ui/Meter';
import { NeedStatusChip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { moneyWhole } from '@/lib/domain/money';
import { formatDate } from '@/lib/domain/text';
import { GearArt } from './GearArt';

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

/** Public gear row: drawing, name and size, progress, and Give. The number matches the marker on the photo. */
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
        'card flex scroll-mt-24 flex-row items-center gap-3 p-3.5 transition-[border-color,box-shadow] duration-150 sm:gap-4 sm:p-4',
        highlighted && 'border-[var(--team,#1747d1)] shadow-[0_0_0_3px_var(--team-line,#c7d6ff)]',
        !open && 'bg-chrome/60 shadow-none',
        flashKey > 0 && 'gg-flash',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span className="relative shrink-0">
          <GearArt name={need.name} size={52} />
          <span
            aria-hidden
            className={cn(
              'absolute -left-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full text-[12px] font-bold tabular ring-2 ring-white',
              open ? 'bg-ink text-white' : need.status === 'funded' ? 'bg-funded text-white' : 'bg-ink-meta text-white',
            )}
          >
            {need.number}
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[16px] leading-[22px] font-semibold text-ink">
                <span className="sr-only">{need.number}. </span>
                {need.name}
              </h3>
              {need.variant && <p className="text-[13px] leading-5 text-ink-meta">{need.variant}</p>}
            </div>
            {!open && <NeedStatusChip status={need.status} date={date} />}
          </div>
          <Meter raised={need.raisedCents} goal={need.priceCents} compact showText={false} label={`${need.name}: ${moneyWhole(need.raisedCents)} of ${moneyWhole(need.priceCents)}`} />
          <div className="flex justify-between text-[13.5px] leading-5 tabular">
            <span className="text-ink-body">
              {moneyWhole(need.raisedCents)} <span className="text-ink-meta">of {moneyWhole(need.priceCents)}</span>
            </span>
            {open && <span className="font-semibold text-ink">{moneyWhole(left)} left</span>}
          </div>
          {need.whyNote && <p className="t-caption">{need.whyNote}</p>}
        </div>
      </div>
      {open && canGive && (
        <Button variant="secondary" onClick={onGive} className="shrink-0 px-3.5 sm:px-4" aria-label={`Give to ${need.name}`}>
          Give
        </Button>
      )}
    </li>
  );
});
