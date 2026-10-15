import Link from 'next/link';
import { FileText } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { sys } from '@/lib/db';
import { VERIFICATION_QUEUE_SQL, domainMatches, domainOf } from '@/lib/app/admin';
import { approveVerification, rejectVerification } from '@/lib/app/admin-actions';
import { formatDate, formatDateTime } from '@/lib/domain/text';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Chip } from '@/components/ui/Chip';
import { AdminAction } from '../_components/AdminAction';

export const metadata = { title: 'Verification' };

interface QueueRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  status: string;
  verification_status: string;
  verification_method: string | null;
  verification_doc_path: string | null;
  verification_contact: string | null;
  verification_note: string | null;
  created_at: Date;
  org_name: string;
  org_domain: string | null;
  org_website: string | null;
  coaches: { email: string; name: string | null }[] | null;
}

/** Verification queue (ui-ux-spec 9): documents, the domain check, and a decision. */
export default async function VerificationPage() {
  await requireAdmin();
  const rows = await sys.query<QueueRow>(
    `select t.id, t.name, t.slug, t.city, t.state, t.status, t.verification_status, t.verification_method, t.verification_doc_path,
       t.verification_contact, t.verification_note, t.created_at, o.name as org_name, o.domain as org_domain, o.website as org_website,
       (select json_agg(json_build_object('email', m.email, 'name', p.full_name) order by m.created_at)
          from team_members m left join profiles p on p.id = m.user_id
          where m.team_id = t.id and m.role = 'coach' and m.status = 'active') as coaches
     from teams t join organizations o on o.id = t.org_id
     where ${VERIFICATION_QUEUE_SQL}
     order by t.created_at`,
  );
  const recent = await sys.query<{ id: string; team_id: string; name: string; action: string; reason: string | null; created_at: Date; admin: string | null }>(
    `select l.id, l.team_id, t.name, l.action, l.detail->>'reason' as reason, l.created_at, p.email as admin
     from activity_log l join teams t on t.id = l.team_id left join profiles p on p.id = l.actor_id
     where l.action in ('verification_approved', 'verification_rejected') order by l.created_at desc limit 10`,
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Verification" sub="Teams whose coach email is not on the school's domain upload a document for review. A team can't go live until it is verified." />
      {rows.length === 0 ? (
        <EmptyState action={<Link href="/app/admin/teams">See all teams</Link>}>No teams are waiting for verification.</EmptyState>
      ) : (
        <ul className="-mt-2 flex flex-col gap-4" aria-label="Teams waiting for verification">
          {rows.map((t) => {
            const coaches = t.coaches ?? [];
            const coachDomains = [...new Set(coaches.map((c) => domainOf(c.email)).filter(Boolean))];
            const orgDomain = domainOf(t.org_domain ?? t.org_website);
            const match = coaches.some((c) => domainMatches(c.email, orgDomain));
            return (
              <li key={t.id} className="flex flex-col gap-4 rounded-md border border-hairline-soft p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="t-subhead">{t.name}</h2>
                    <p className="t-caption">
                      {t.org_name} · {t.city}, {t.state} · Created {formatDate(t.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip tone={t.verification_status === 'under_review' ? 'warn' : 'muted'}>{t.verification_status === 'under_review' ? 'Under review' : 'Document uploaded'}</Chip>
                    <Chip tone="muted">{t.status === 'draft' ? 'Draft' : t.status}</Chip>
                  </div>
                </div>
                <dl className="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2">
                  <div>
                    <dt className="t-label">School domain</dt>
                    <dd className="text-ink-body">{orgDomain ?? 'None on file'}</dd>
                  </div>
                  <div>
                    <dt className="t-label">Coach email domain</dt>
                    <dd className="flex flex-wrap items-center gap-2 text-ink-body">
                      {coachDomains.length ? coachDomains.join(', ') : 'No coach yet'}
                      {orgDomain && coachDomains.length > 0 && (match ? <Chip tone="funded" icon="check">Matches</Chip> : <Chip tone="warn" icon="alert">Does not match</Chip>)}
                    </dd>
                  </div>
                  <div>
                    <dt className="t-label">Coaches</dt>
                    <dd className="text-ink-body">
                      {coaches.length ? coaches.map((c) => (c.name ? `${c.name} (${c.email})` : c.email)).join(', ') : 'None'}
                    </dd>
                  </div>
                  <div>
                    <dt className="t-label">Contact for verification</dt>
                    <dd className="break-words text-ink-body">{t.verification_contact || 'Not given'}</dd>
                  </div>
                  <div>
                    <dt className="t-label">Method</dt>
                    <dd className="text-ink-body">{t.verification_method ?? 'Document'}</dd>
                  </div>
                  <div>
                    <dt className="t-label">Document</dt>
                    <dd>
                      {t.verification_doc_path ? (
                        <a href={`/api/admin/file?team=${t.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2">
                          <FileText size={18} aria-hidden /> Open document<span className="sr-only"> for {t.name} (opens in a new tab)</span>
                        </a>
                      ) : (
                        <span className="text-ink-body">Not uploaded</span>
                      )}
                    </dd>
                  </div>
                  {t.verification_note && (
                    <div className="sm:col-span-2">
                      <dt className="t-label">Earlier note</dt>
                      <dd className="text-ink-body">{t.verification_note}</dd>
                    </div>
                  )}
                </dl>
                <div className="flex flex-wrap gap-3 border-t border-hairline-soft pt-4">
                  <AdminAction
                    action={approveVerification.bind(null, t.id)}
                    label="Approve"
                    srLabel={`Approve ${t.name}`}
                    variant="primary"
                    confirm={{ title: `Verify ${t.name}?`, body: 'The coaches are emailed that the team is verified and can go live.' }}
                  />
                  <AdminAction
                    action={rejectVerification.bind(null, t.id)}
                    label="Reject"
                    srLabel={`Reject ${t.name}`}
                    variant="destructive"
                    confirm={{ title: `Reject ${t.name}?`, body: 'The coaches get your reason by email and can upload a new document.' }}
                    reason={{ label: 'Reason for the coach' }}
                  />
                  <Link href={`/app/manager/${t.id}`} className="inline-flex min-h-11 items-center">
                    Open the team<span className="sr-only"> {t.name}</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {recent.length > 0 && (
        <Section title="Recent decisions" id="recent">
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 flex-1 text-[15px] text-ink">
                  {r.name}
                  {r.reason && <span className="t-caption block">{r.reason}</span>}
                </span>
                <Chip tone={r.action === 'verification_approved' ? 'funded' : 'error'}>{r.action === 'verification_approved' ? 'Verified' : 'Rejected'}</Chip>
                <span className="t-caption">
                  {formatDateTime(r.created_at)}
                  {r.admin ? ` by ${r.admin}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
