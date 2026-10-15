import { Chip, type ChipTone } from '@/components/ui/Chip';

export const DONATION_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  succeeded: { label: 'Paid', tone: 'funded' },
  pending: { label: 'Processing', tone: 'warn' },
  failed: { label: 'Failed', tone: 'muted' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  disputed: { label: 'Disputed', tone: 'error' },
};

export function DonationStatus({ status }: { status: string }) {
  const s = DONATION_STATUS[status] ?? { label: status, tone: 'muted' as const };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}
