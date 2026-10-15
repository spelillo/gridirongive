import { loadAthleteCtx } from '@/lib/app/athlete';
import { sys } from '@/lib/db';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { formatDate } from '@/lib/domain/text';
import { possessive } from '@/lib/domain/names';
import { SupportersList, type SupporterRow } from './SupportersList';

export const metadata = { title: 'Supporters' };

const tyStatus: Record<string, { label: string; tone: 'warn' | 'funded' | 'error' | 'info' }> = {
  pending: { label: 'Waiting for approval', tone: 'warn' },
  approved: { label: 'Sending', tone: 'info' },
  sent: { label: 'Sent', tone: 'funded' },
  rejected: { label: 'Not approved', tone: 'error' },
};

/** Supporters and thank-yous (ui-ux-spec 7.6). Donor emails never reach this page. */
export default async function SupportersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ thank?: string }> }) {
  const { id } = await params;
  const { thank } = await searchParams;
  const ctx = await loadAthleteCtx(id);
  const self = ctx.role === 'athlete';
  const showAmounts = !self || ctx.team.showAmountsToAthletes;
  const rows = await sys.query<any>(
    `select d.id, case when d.show_name then d.donor_name else 'A supporter' end as name, d.succeeded_at,
       case when d.message_status = 'approved' then d.message end as message,
       sum(al.amount_cents)::int as amount_cents,
       json_agg(json_build_object('id', n.id, 'name', n.name) order by n.sort) as items,
       exists (select 1 from thank_yous ty where ty.donation_id = d.id and ty.status <> 'rejected')
         or exists (select 1 from thank_yous ty where ty.need_id = any(array_agg(n.id)) and ty.status <> 'rejected') as thanked
     from donations d join allocations al on al.donation_id = d.id and al.reversed_at is null join needs n on n.id = al.need_id
     where n.athlete_id = $1 and d.status = 'succeeded'
     group by d.id order by d.succeeded_at desc limit 300`,
    [id],
  );
  const notes = await sys.query<any>(
    `select ty.id, ty.body, ty.status, ty.review_note, ty.created_at, ty.recipients_count, n.name as item,
       case when d.id is null then null when d.show_name then d.donor_name else 'A supporter' end as donor
     from thank_yous ty left join needs n on n.id = ty.need_id left join donations d on d.id = ty.donation_id
     where ty.athlete_id = $1 order by ty.created_at desc limit 50`,
    [id],
  );
  const supporters: SupporterRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    date: r.succeeded_at ? new Date(r.succeeded_at).toISOString() : null,
    message: r.message,
    amountCents: showAmounts ? r.amount_cents : null,
    items: (r.items as { id: string; name: string }[]).filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i),
    thanked: r.thanked,
  }));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="t-hero">Supporters</h1>
        <p className="t-body">
          {supporters.length ? `${supporters.length} ${supporters.length === 1 ? 'person has' : 'people have'} given toward ${self ? 'your' : possessive(ctx.athlete.first)} gear.` : ''}
          {' '}
          Thank-you notes are emailed for you{ctx.team.requireThankyouApproval ? ' after the coach approves them' : ''}. You never see supporters&apos; email addresses.
        </p>
      </header>

      {supporters.length === 0 ? (
        <EmptyState action={<ButtonLink href={`/app/athlete/${id}/share`} variant="secondary">Share {self ? 'your' : 'the'} page</ButtonLink>}>No supporters yet.</EmptyState>
      ) : (
        <SupportersList athleteId={id} rows={supporters} openFor={thank ?? null} first={ctx.athlete.first} />
      )}

      <section aria-labelledby="notes-h" className="flex flex-col gap-3">
        <h2 id="notes-h" className="t-subhead">
          Thank-you notes
        </h2>
        {notes.length === 0 ? (
          <p className="t-body">No notes yet.</p>
        ) : (
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {notes.map((n) => (
              <li key={n.id} className="flex flex-col gap-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="t-caption">
                    To {n.donor ? n.donor : `everyone who gave to ${n.item}`} · {formatDate(n.created_at)}
                  </p>
                  <Chip tone={tyStatus[n.status]?.tone ?? 'info'}>{tyStatus[n.status]?.label ?? n.status}</Chip>
                </div>
                <p className="text-[15px] leading-[22px] text-ink-body">{n.body}</p>
                {n.status === 'rejected' && n.review_note && <p className="t-caption text-error">Note from the coach: {n.review_note}</p>}
                {n.status === 'sent' && n.recipients_count > 1 && <p className="t-caption">Sent to {n.recipients_count} supporters.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
