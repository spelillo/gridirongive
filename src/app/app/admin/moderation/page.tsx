import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { sys } from '@/lib/db';
import { flaggedMessages, flaggedNotes } from '@/lib/app/admin';
import { hideReportedAthlete, dismissReport, moderateMessage, rejectThankYou } from '@/lib/app/admin-actions';
import { athleteDisplayName } from '@/lib/domain/names';
import { formatDateTime } from '@/lib/domain/text';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Chip, AthleteStatusChip } from '@/components/ui/Chip';
import { AdminAction } from '../_components/AdminAction';

export const metadata = { title: 'Moderation' };

/** Reports, plus donor messages and thank-you notes the text filter flagged (ui-ux-spec 9). */
export default async function ModerationPage() {
  await requireAdmin();
  const [reports, messages, notes] = await Promise.all([
    sys.query<any>(
      `select r.id, r.reason, r.reporter_email, r.created_at, r.team_id, r.athlete_id, t.name as team_name, t.slug as team_slug, t.status as team_status,
         a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, a.status as athlete_status, a.share_token
       from reports r left join teams t on t.id = r.team_id left join athletes a on a.id = r.athlete_id
       where r.status = 'open' order by r.created_at`,
    ),
    flaggedMessages(),
    flaggedNotes(),
  ]);
  const noteAthletes = notes.length
    ? await sys.query<any>(`select id, first_name, last_name, preferred_name, show_full_last_name from athletes where id = any($1::uuid[])`, [notes.map((n) => n.athlete_id)])
    : [];
  const athleteName = (id: string) => {
    const a = noteAthletes.find((x) => x.id === id);
    return a ? athleteDisplayName(a) : 'A player';
  };

  return (
    <div className="flex max-w-[960px] flex-col gap-10">
      <PageHeader title="Moderation" sub="Hiding a page works like a coach hiding it: the family can't show it again, the coach can after fixing it." />

      <Section title={`Reports${reports.length ? ` (${reports.length})` : ''}`} id="reports" className="-mt-8 flex flex-col gap-4">
        {reports.length === 0 ? (
          <p className="t-body">No open reports.</p>
        ) : (
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {reports.map((r) => {
              const name = r.athlete_id && r.first_name ? athleteDisplayName(r) : null;
              const pageHref = r.athlete_id && r.share_token ? `/s/${r.share_token}` : r.team_slug ? `/t/${r.team_slug}` : null;
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-medium text-ink">{name ? `${name}, ${r.team_name}` : (r.team_name ?? 'Unknown page')}</span>
                    {r.athlete_status && <AthleteStatusChip status={r.athlete_status} />}
                    {!r.athlete_id && r.team_status === 'suspended' && <Chip tone="error">Suspended</Chip>}
                  </div>
                  <p className="text-[15px] leading-[22px] text-ink-body">{r.reason}</p>
                  <p className="t-caption">
                    Reported {formatDateTime(r.created_at)}
                    {r.reporter_email ? ` by ${r.reporter_email}` : ' anonymously'}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {pageHref && (
                      <a href={pageHref} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center">
                        Open the page<span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    )}
                    {r.team_id && (
                      <Link href={r.athlete_id ? `/app/manager/${r.team_id}/roster` : `/app/admin/teams?q=${encodeURIComponent(r.team_slug ?? '')}`} className="inline-flex min-h-11 items-center">
                        {r.athlete_id ? 'Team roster' : 'Team in admin'}
                      </Link>
                    )}
                    {r.athlete_id && r.athlete_status !== 'hidden' && (
                      <AdminAction
                        action={hideReportedAthlete.bind(null, r.id)}
                        label="Hide page"
                        srLabel={`Hide page for ${name ?? 'this player'}`}
                        size="sm"
                        variant="destructive"
                        confirm={{ title: `Hide ${name ?? 'this'} page?`, body: 'The page is hidden right away. The coach and the family are emailed your reason.' }}
                        reason={{ label: 'Reason for the coach and family' }}
                      />
                    )}
                    <AdminAction
                      action={dismissReport.bind(null, r.id)}
                      label="Dismiss"
                      srLabel={`Dismiss report about ${name ?? r.team_name ?? 'this page'}`}
                      size="sm"
                      confirm={{ title: 'Dismiss this report?', body: 'Nothing changes on the page. The report is closed.' }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Flagged donor messages${messages.length ? ` (${messages.length})` : ''}`} id="messages">
        <p className="t-caption -mt-2">Messages with links, phone numbers, email addresses or payment apps wait for review even on teams that skip message approval.</p>
        {messages.length === 0 ? (
          <p className="t-body">No flagged messages.</p>
        ) : (
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 px-4 py-4">
                <p className="text-[15px] leading-[22px] text-ink-body">&ldquo;{m.message}&rdquo;</p>
                <p className="t-caption">
                  <Link href={`/app/admin/donations/${m.id}`} className="underline">{m.donor_name}</Link> ({m.donor_email}) to {m.team_name} · {formatDateTime(m.created_at)}
                </p>
                <div className="flex flex-wrap gap-3">
                  <AdminAction action={moderateMessage.bind(null, m.id, 'approved')} label="Approve" srLabel={`Approve message from ${m.donor_name}`} size="sm" />
                  <AdminAction action={moderateMessage.bind(null, m.id, 'rejected')} label="Hide" srLabel={`Hide message from ${m.donor_name}`} size="sm" variant="destructive" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Flagged thank-you notes${notes.length ? ` (${notes.length})` : ''}`} id="notes">
        {notes.length === 0 ? (
          <p className="t-body">No flagged notes.</p>
        ) : (
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {notes.map((n) => (
              <li key={n.id} className="flex flex-col gap-2 px-4 py-4">
                <p className="text-[15px] leading-[22px] text-ink-body">&ldquo;{n.body}&rdquo;</p>
                <p className="t-caption">
                  {athleteName(n.athlete_id)}, {n.team_name} · {formatDateTime(n.created_at)} · {n.status === 'pending' ? 'Waiting for the coach' : 'Approved, sending'}
                  {n.photo_path ? ' · Has a photo' : ''}
                </p>
                {n.photo_path && (
                  <img src={`/media/thanks/${n.id}`} alt={`Photo attached to the note from ${athleteName(n.athlete_id)}`} className="max-h-40 w-fit max-w-full rounded-md border border-hairline-soft" loading="lazy" />
                )}
                <div>
                  <AdminAction
                    action={rejectThankYou.bind(null, n.id)}
                    label="Reject note"
                    srLabel={`Reject note from ${athleteName(n.athlete_id)}`}
                    size="sm"
                    variant="destructive"
                    confirm={{ title: 'Reject this note?', body: 'It will not be sent. The family is emailed your note and can write a new one.' }}
                    reason={{ label: 'Note for the family' }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
