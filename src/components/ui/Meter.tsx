import { cn } from './cn';
import { moneyWhole, moneyWholeUp, percentFunded } from '@/lib/domain/money';

/** 8px bar, always with text: "$140 of $300" and "47%" (ui-ux-spec 3). */
export function Meter({ raised, goal, label, compact, className, showText = true }: { raised: number; goal: number; label?: string; compact?: boolean; className?: string; showText?: boolean }) {
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
        className="h-2 w-full overflow-hidden rounded-[4px] bg-meter-track"
      >
        <div className={cn('h-full rounded-[4px] transition-[width] duration-300 ease-out', done ? 'bg-funded' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
