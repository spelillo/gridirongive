import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from './cn';

const tones = {
  info: { cls: 'bg-band-blue text-ink-body', Icon: Info, icon: 'text-primary' },
  warn: { cls: 'bg-warn-bg text-ink-body', Icon: AlertTriangle, icon: 'text-warn' },
  error: { cls: 'bg-error-bg text-ink-body', Icon: XCircle, icon: 'text-error' },
  success: { cls: 'bg-funded-bg text-ink-body', Icon: CheckCircle2, icon: 'text-funded' },
};

/** Full-width, square corners. Icon, one sentence, one action (ui-ux-spec 3). */
export function Banner({ tone = 'info', children, action, className, role, id, rounded }: { tone?: keyof typeof tones; children: ReactNode; action?: ReactNode; className?: string; role?: 'alert' | 'status'; id?: string; rounded?: boolean }) {
  const t = tones[tone];
  return (
    <div id={id} role={role ?? (tone === 'error' ? 'alert' : 'status')} tabIndex={-1} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 outline-none', rounded && 'rounded-md', t.cls, className)}>
      <t.Icon aria-hidden size={20} strokeWidth={1.75} className={cn('shrink-0', t.icon)} />
      <div className="min-w-0 flex-1 text-[15px] leading-[22px]">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
