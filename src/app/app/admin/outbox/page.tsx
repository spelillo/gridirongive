import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { sys } from '@/lib/db';
import { mode } from '@/lib/env';
import { retryFailedNotifications, retryNotification } from '@/lib/app/admin-actions';
import { formatDateTime } from '@/lib/domain/text';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AdminAction } from '../_components/AdminAction';

export const metadata = { title: 'Email log' };

const FILTERS = ['all', 'failed', 'queued', 'held', 'skipped', 'sent'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', failed: 'Failed', queued: 'Queued', held: 'Held for digest', skipped: 'Not emailed', sent: 'Sent' };

function statusOf(r: { status: string; error: string | null }): { label: string; tone: ChipTone } {
  if (r.status === 'skipped' && (r.error === 'held_for_digest' || r.error === 'digest_sending')) return { label: 'Held for digest', tone: 'info' };
  return (
    {
      sent: { label: 'Sent', tone: 'funded' as const },
      queued: { label: 'Queued', tone: 'warn' as const },
      failed: { label: 'Failed', tone: 'error' as const },
      skipped: { label: 'Not emailed', tone: 'muted' as const },
    }[r.status] ?? { label: r.status, tone: 'muted' as const }
  );
}

/** The latest 100 notifications with delivery status, for debugging email in live mode. */
export default async function AdminOutboxPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(status ?? '') ? (status as Filter) : 'all';
  const where =
    filter === 'all' ? 'true'
    : filter === 'held' ? `n.status = 'skipped' and n.error in ('held_for_digest', 'digest_sending')`
    : filter === 'skipped' ? `n.status = 'skipped' and n.error is distinct from 'held_for_digest' and n.error is distinct from 'digest_sending'`
    : `n.status = '${filter}'`;
  const [rows, counts] = await Promise.all([
    sys.query<any>(
      `select n.id, n.kind, n.subject, n.status, n.error, n.created_at, n.sent_at, n.in_app, n.send_email, coalesce(n.email, p.email) as to_email
       from notifications n left join profiles p on p.id = n.user_id where ${where} order by n.created_at desc limit 100`,
    ),
    sys.one<{ failed: number; queued: number }>(`select count(*) filter (where status = 'failed')::int as failed, count(*) filter (where status = 'queued')::int as queued from notifications`),
  ]);

  return (
    <div className="flex max-w-[1040px] flex-col gap-6">
      <PageHeader
        title="Email log"
        sub={`Email goes through ${mode.email === 'resend' ? 'Resend' : 'the on-site outbox'}. ${counts?.failed ?? 0} failed, ${counts?.queued ?? 0} queued.`}
        actions={
          (counts?.failed ?? 0) > 0 ? (
            <AdminAction
              action={retryFailedNotifications}
              label="Retry failed"
              variant="primary"
              confirm={{ title: `Retry ${counts?.failed} failed ${counts?.failed === 1 ? 'email' : 'emails'}?`, body: 'They go back in the queue and are sent again right away.' }}
            />
          ) : undefined
        }
      />
      {mode.email === 'outbox' && (
        <Banner tone="info" rounded className="-mt-2">
          No email provider is set, so nothing leaves the site. Read the full emails in the <Link href="/dev/outbox" className="underline">outbox</Link>.
        </Banner>
      )}
      <Tabs label="Filter by status" active={filter} tabs={FILTERS.map((f) => ({ id: f, label: FILTER_LABEL[f], href: f === 'all' ? '/app/admin/outbox' : `/app/admin/outbox?status=${f}` }))} />
      {rows.length === 0 ? (
        <EmptyState>Nothing here.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline-soft">
          <table className="hidden w-full text-left text-[15px] md:table">
            <caption className="sr-only">Notifications, newest first</caption>
            <thead className="bg-chrome">
              <tr>
                <th scope="col" className="t-label px-4 py-2.5">Created</th>
                <th scope="col" className="t-label px-4 py-2.5">To</th>
                <th scope="col" className="t-label px-4 py-2.5">Subject</th>
                <th scope="col" className="t-label px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map((r) => {
                const s = statusOf(r);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-body">{formatDateTime(r.created_at)}</td>
                    <td className="max-w-[220px] break-all px-4 py-3 text-ink-body">{r.to_email ?? <span className="text-ink-meta">No address</span>}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink">{r.subject}</span>
                      <div className="t-caption">
                        {r.kind}
                        {r.in_app ? ' · in app' : ''}
                        {r.send_email ? '' : ' · no email'}
                      </div>
                      {r.status === 'failed' && r.error && <div className="text-[14px] text-error">{r.error}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-2">
                        <Chip tone={s.tone}>{s.label}</Chip>
                        {r.status === 'failed' && <AdminAction action={retryNotification.bind(null, r.id)} label="Retry" srLabel={`Retry ${r.subject}`} size="sm" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="divide-y divide-hairline-soft md:hidden" aria-label="Notifications, newest first">
            {rows.map((r) => {
              const s = statusOf(r);
              return (
                <li key={r.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <span className="text-[15px] font-medium text-ink">{r.subject}</span>
                  <span className="t-caption break-all">To {r.to_email ?? 'no address'} · {formatDateTime(r.created_at)}</span>
                  {r.status === 'failed' && r.error && <span className="text-[14px] text-error">{r.error}</span>}
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={s.tone}>{s.label}</Chip>
                    <span className="t-caption">{r.kind}</span>
                    {r.status === 'failed' && <AdminAction action={retryNotification.bind(null, r.id)} label="Retry" srLabel={`Retry ${r.subject}`} size="sm" />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
