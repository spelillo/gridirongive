import { cn } from './cn';
import { moneyWhole, moneyWholeUp, percentFunded } from '@/lib/domain/money';

/** Rounded bar in the team's color (blue by default), always with text: "$140 of $300" and "47%" (ui-ux-spec 3). */
export function Meter({ raised, goal, label, compact, thick, className, showText = true }: { raised: number; goal: number; label?: string; compact?: boolean; thick?: boolean; className?: string; showText?: boolean }) {
  const pct = percentFunded(raised, goal);
  const done = goal > 0 && raised >= goal;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {showText && (
        <div className={cn('flex items-baseline justify-between gap-3', compact ? 'text-[14px] leading-5' : '')}>
          <span className={cn(compact ? 'tabular font-medium text-ink' : 't-figure')}>
            {moneyWhole(raised)} <span className={cn('font-normal text-ink-meta', compact ? '' : 'text-[15px]')}>of {moneyWholeUp(goal)}</span>
          </span>
          <span className={cn('tabular', compact ? 'text-ink-meta' : 't-figure', done && 'text-funded')}>{pct}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label ?? `${moneyWhole(raised)} of ${moneyWholeUp(goal)} raised`}
        className={cn('w-full overflow-hidden rounded-full bg-meter-track', thick ? 'h-2.5' : 'h-2')}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', done ? 'bg-funded' : 'bg-[var(--team,var(--color-primary))]')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
