import { Check, Clock, EyeOff, FileEdit, Lock, ShieldCheck, AlertTriangle, Package, Truck } from 'lucide-react';
import { cn } from './cn';

export type ChipTone = 'funded' | 'warn' | 'error' | 'neutral' | 'muted' | 'info';

const tones: Record<ChipTone, string> = {
  funded: 'bg-funded-bg text-funded',
  warn: 'bg-warn-bg text-warn',
  error: 'bg-error-bg text-error',
  neutral: 'bg-band text-ink-list',
  muted: 'bg-chrome text-ink-meta',
  info: 'bg-band-blue text-primary-deep',
};

const icons = { check: Check, clock: Clock, hidden: EyeOff, draft: FileEdit, lock: Lock, shield: ShieldCheck, alert: AlertTriangle, package: Package, truck: Truck };

export function Chip({ tone = 'neutral', icon, children, className }: { tone?: ChipTone; icon?: keyof typeof icons; children: React.ReactNode; className?: string }) {
  const Icon = icon ? icons[icon] : null;
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] leading-5 font-semibold whitespace-nowrap', tones[tone], className)}>
      {Icon && <Icon aria-hidden size={14} strokeWidth={2} />}
      {children}
    </span>
  );
}

/** Need status (Open is shown as no chip on public pages). */
export function NeedStatusChip({ status, date }: { status: string; date?: string | null }) {
  switch (status) {
    case 'funded':
      return <Chip tone="funded" icon="check">Funded</Chip>;
    case 'purchased':
      return <Chip tone="neutral" icon="package">Purchased{date ? ` ${date}` : ''}</Chip>;
    case 'delivered':
      return <Chip tone="neutral" icon="check">Delivered{date ? ` ${date}` : ''}</Chip>;
    case 'partially_funded':
      return <Chip tone="info">Partly funded</Chip>;
    case 'removed':
      return <Chip tone="muted">Removed</Chip>;
    default:
      return <Chip tone="muted">Open</Chip>;
  }
}

export const ATHLETE_STATUS: Record<string, { label: string; tone: ChipTone; icon?: keyof typeof icons }> = {
  needs_consent: { label: 'Needs consent', tone: 'warn', icon: 'clock' },
  draft: { label: 'Draft', tone: 'muted', icon: 'draft' },
  awaiting_guardian: { label: 'Waiting for guardian', tone: 'warn', icon: 'clock' },
  awaiting_coach: { label: 'Pending approval', tone: 'warn', icon: 'clock' },
  changes_requested: { label: 'Changes requested', tone: 'error', icon: 'alert' },
  live: { label: 'Live', tone: 'funded', icon: 'check' },
  hidden: { label: 'Hidden', tone: 'muted', icon: 'hidden' },
};

export function AthleteStatusChip({ status }: { status: string }) {
  const s = ATHLETE_STATUS[status] ?? { label: status, tone: 'muted' as const };
  return <Chip tone={s.tone} icon={s.icon}>{s.label}</Chip>;
}

export const INVITE_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  not_sent: { label: 'Not sent', tone: 'muted' },
  sent: { label: 'Sent', tone: 'info' },
  opened: { label: 'Opened', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'funded' },
  bounced: { label: 'Bounced', tone: 'error' },
};
