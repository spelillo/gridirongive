import type { ReactNode } from 'react';
import { cn } from './cn';

/** One line saying what's missing and one way to fix it. No illustrations. */
export function EmptyState({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-4 rounded-lg border border-dashed border-[#cfd6e1] bg-chrome/60 px-6 py-10 text-center', className)}>
      <p className="text-[16px] leading-6 text-ink-body">{children}</p>
      {action && <div className="flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
