import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { asUser } from '@/lib/db';
import { relativeTime, formatDateTime, truncate } from '@/lib/domain/text';
import { AppShell, AppMain } from '@/components/app/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { MarkAllRead, MarkRead } from './NotificationButtons';

export const metadata = { title: 'Notifications' };

interface Row {
  id: string;
  subject: string;
  body: string;
  link: string | null;
  read_at: Date | null;
  created_at: Date;
}

/** In-app notifications (ui-ux-spec 8.13), newest first. */
export default async function NotificationsPage() {
  const user = await requireUser('/app/notifications');
  const rows = await asUser(user.id, (tx) =>
    tx.query<Row>(
      `select id, subject, body, link, read_at, created_at from notifications
       where user_id = $1 and in_app order by created_at desc limit 100`,
      [user.id],
    ),
  );
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <AppShell user={user}>
      <AppMain>
        <div className="mx-auto flex max-w-[720px] flex-col">
          <PageHeader
            title="Notifications"
            sub={rows.length ? (unread ? `${unread} unread` : 'All caught up.') : undefined}
            actions={unread > 0 ? <MarkAllRead /> : undefined}
          />
          {rows.length === 0 ? (
            <EmptyState action={<ButtonLink href="/app" variant="secondary">Go to your dashboard</ButtonLink>}>
              No notifications yet. New gifts, approvals and updates show up here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft" aria-label="Notifications, newest first">
              {rows.map((n) => {
                const isUnread = !n.read_at;
                const body = n.link ? n.body.replace(n.link, '').trim() : n.body;
                return (
                  <li key={n.id} className={cn('flex items-start gap-2 pr-2', isUnread && 'bg-band-blue')}>
                    <a href={`/app/notifications/open/${n.id}`} className="flex min-h-16 min-w-0 flex-1 items-start gap-3 px-4 py-3 text-inherit no-underline hover:bg-chrome">
                      <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', isUnread ? 'bg-primary' : 'bg-transparent')} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className={cn('text-[16px] leading-6 text-ink', isUnread ? 'font-medium' : 'font-normal')}>
                          {isUnread && <span className="sr-only">Unread: </span>}
                          {n.subject}
                        </span>
                        {body && body !== n.subject && <span className="t-list line-clamp-2">{truncate(body, 240)}</span>}
                        <time dateTime={new Date(n.created_at).toISOString()} title={formatDateTime(n.created_at)} className="t-caption">
                          {relativeTime(n.created_at)}
                        </time>
                      </span>
                    </a>
                    {isUnread && (
                      <div className="pt-3">
                        <MarkRead id={n.id} subject={n.subject} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length === 100 && <p className="t-caption pt-3">Showing the latest 100.</p>}
          <p className="t-caption pt-6">
            Choose which of these also reach you by email in <Link href="/app/account#email" className="underline">account settings</Link>.
          </p>
        </div>
      </AppMain>
    </AppShell>
  );
}
