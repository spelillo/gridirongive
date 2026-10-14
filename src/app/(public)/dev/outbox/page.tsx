import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sys } from '@/lib/db';
import { mode } from '@/lib/env';
import { getUser } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/domain/text';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { RefreshButton } from './RefreshButton';

export const metadata: Metadata = { title: 'Outbox', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Every email the app would send, shown on-site. Open to everyone in demo
 * mode; in live mode without an email provider, only admins can see it.
 */
export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const user = await getUser();
  if (!mode.demo && !(user?.isAdmin && mode.email === 'outbox')) notFound();
  const { to } = await searchParams;
  const rows = await sys.query<{ id: string; email: string | null; kind: string; subject: string; body: string; link: string | null; status: string; created_at: Date }>(
    `select n.id, coalesce(n.email, p.email) as email, n.kind, n.subject, n.body, n.link, n.status, n.created_at
     from notifications n left join profiles p on p.id = n.user_id
     where n.send_email and ($1::text is null or lower(coalesce(n.email, p.email)) = lower($1::text))
     order by n.created_at desc limit 100`,
    [to ?? null],
  );
  return (
    <div className="page-x mx-auto flex w-full max-w-[880px] flex-col gap-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="t-section">Outbox</h1>
          <p className="t-body">{to ? `Emails to ${to}.` : 'The latest 100 emails.'} Links work just like they would in a real inbox.</p>
        </div>
        <RefreshButton />
      </div>
      {rows.length === 0 ? (
        <EmptyState>No emails yet. Sign in, give, or invite someone and the emails show up here.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <details className="group rounded-md border border-hairline-soft">
                <summary className="flex min-h-14 cursor-pointer list-none flex-col gap-0.5 px-4 py-3 hover:bg-band sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">{r.subject}</span>
                    <span className="t-caption block truncate">To {r.email ?? 'unknown'}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {r.status !== 'sent' && <Chip tone="muted">{r.status}</Chip>}
                    <span className="t-caption whitespace-nowrap">{formatDateTime(r.created_at)}</span>
                  </span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-hairline-soft px-4 py-4">
                  <p className="whitespace-pre-line text-[15px] leading-[22px] text-ink-body">{r.link ? r.body.replace(r.link, "").trim() : r.body}</p>
                  {r.link && (
                    <a href={r.link} className="break-all text-[15px]">
                      {r.link}
                    </a>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
