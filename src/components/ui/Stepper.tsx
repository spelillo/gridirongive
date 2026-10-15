import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from './cn';

/** Numbered rail on desktop; "Step 2 of 4" plus a thin meter on mobile. */
export function Stepper({ steps, current, hrefFor }: { steps: { label: string; done?: boolean }[]; current: number; hrefFor?: (i: number) => string | undefined }) {
  return (
    <nav aria-label="Progress" className="w-full">
      <div className="md:hidden">
        <p className="t-caption">
          Step {current + 1} of {steps.length}: <span className="font-medium text-ink">{steps[current]?.label}</span>
        </p>
        <div className="mt-2 h-1 w-full rounded-[2px] bg-meter-track">
          <div className="h-1 rounded-[2px] bg-primary" style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="hidden items-center gap-2 md:flex">
        {steps.map((s, i) => {
          const href = hrefFor?.(i);
          const state = i === current ? 'current' : s.done ? 'done' : 'todo';
          const inner = (
            <>
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-md text-[14px] font-medium tabular',
                  state === 'current' && 'bg-primary text-on-primary',
                  state === 'done' && 'bg-band-blue text-primary-deep',
                  state === 'todo' && 'border border-hairline-soft text-ink-meta',
                )}
              >
                {state === 'done' ? <Check size={16} aria-hidden /> : i + 1}
              </span>
              <span className={cn('text-[15px]', state === 'current' ? 'font-medium text-ink' : 'text-ink-nav')}>{s.label}</span>
              <span className="sr-only">{state === 'done' ? '(done)' : state === 'current' ? '(current step)' : ''}</span>
            </>
          );
          return (
            <li key={s.label} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-px w-6 bg-hairline-soft lg:w-10" />}
              {href && state !== 'current' ? (
                <Link href={href} className="flex items-center gap-2 no-underline" aria-current={undefined}>
                  {inner}
                </Link>
              ) : (
                <span className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
