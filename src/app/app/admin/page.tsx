import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { adminCounts } from '@/lib/app/admin';
import { PageHeader } from '@/components/ui/PageHeader';
import { Chip } from '@/components/ui/Chip';

export const metadata = { title: 'Overview' };

/** Admin overview: what is waiting, with a link to each queue. */
export default async function AdminHome() {
  await requireAdmin();
  const c = await adminCounts();
  const queues = [
    { href: '/app/admin/verification', label: 'Verification queue', detail: 'Teams waiting for a document check', n: c.verification },
    { href: '/app/admin/donations#refunds', label: 'Refund requests', detail: 'Open requests from coaches', n: c.refunds },
    { href: '/app/admin/moderation', label: 'Moderation', detail: `${c.reports} open ${c.reports === 1 ? 'report' : 'reports'}, ${c.flagged} flagged ${c.flagged === 1 ? 'message' : 'messages'}`, n: c.moderation },
    { href: '/app/admin/outbox', label: 'Failed emails', detail: 'Emails the provider did not accept', n: c.failed },
  ];
  const other = [
    { href: '/app/admin/teams', label: 'Teams', detail: `${c.teams} teams${c.suspended ? `, ${c.suspended} suspended` : ''}` },
    { href: '/app/admin/donations', label: 'Donations', detail: 'Search gifts, see allocations, refund' },
    { href: '/app/admin/catalog', label: 'Gear catalog', detail: `${c.catalog} active items` },
  ];
  const row = 'flex min-h-16 items-center gap-4 px-4 py-3 no-underline hover:bg-chrome';
  const waiting = queues.reduce((s, q) => s + q.n, 0);
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <PageHeader title="Admin" sub={waiting ? `${waiting} ${waiting === 1 ? 'item needs' : 'items need'} a look.` : 'Nothing is waiting.'} />
      <section aria-labelledby="queues-h" className="-mt-4 flex flex-col gap-3">
        <h2 id="queues-h" className="t-subhead">
          Queues
        </h2>
        <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
          {queues.map((q) => (
            <li key={q.href}>
              <Link href={q.href} className={row}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium text-ink">{q.label}</span>
                  <span className="t-caption">{q.detail}</span>
                </span>
                {q.n > 0 ? <Chip tone="warn">{q.n} waiting</Chip> : <Chip tone="muted">None</Chip>}
                <ChevronRight size={20} aria-hidden className="text-ink-meta" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="tools-h" className="flex flex-col gap-3">
        <h2 id="tools-h" className="t-subhead">
          Tools
        </h2>
        <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
          {other.map((q) => (
            <li key={q.href}>
              <Link href={q.href} className={row}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium text-ink">{q.label}</span>
                  <span className="t-caption">{q.detail}</span>
                </span>
                <ChevronRight size={20} aria-hidden className="text-ink-meta" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
