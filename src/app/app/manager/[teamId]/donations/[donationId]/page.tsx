import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { athleteDisplayName } from '@/lib/domain/names';
import { money } from '@/lib/domain/money';
import { formatDate, formatDateTime } from '@/lib/domain/text';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Chip, NeedStatusChip } from '@/components/ui/Chip';
import { Banner } from '@/components/ui/Banner';
import { RefundRequest } from './RefundRequest';

export const metadata = { title: 'Donation' };

const STATUS: Record<string, string> = { succeeded: 'Succeeded', refunded: 'Refunded', disputed: 'Disputed', pending: 'Pending', failed: 'Failed' };

/** Row detail for the ledger (ui-ux-spec 8.8): where the money went, Stripe ids, refunds. */
export default async function DonationDetail({ params }: { params: Promise<{ teamId: string; donationId: string }> }) {
  const { teamId, donationId } = await params;
  const ctx = await loadTeamCtx(teamId);
  if (!/^[0-9a-f-]{36}$/.test(donationId)) notFound();
  const data = await asUser(ctx.user.id, async (tx) => {
    const d = await tx.one<any>(
      `select d.*, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name from donations d
       left join athletes a on a.id = d.athlete_id where d.id = $1 and d.team_id = $2`,
      [donationId, teamId],
    );
    if (!d) return null;
    const allocations = await tx.query<any>(
      `select al.amount_cents, al.overflow, al.reversed_at, n.id as need_id, n.name, n.variant, n.kind, n.status, n.athlete_id,
         a.first_name, a.last_name, a.preferred_name, a.show_full_last_name
       from allocations al join needs n on n.id = al.need_id left join athletes a on a.id = n.athlete_id
       where al.donation_id = $1 order by al.created_at`,
      [donationId],
    );
    const lines = allocations.length
      ? []
      : await tx.query<any>(
          `select dl.requested_cents, n.name, dl.athlete_id from donation_lines dl left join needs n on n.id = dl.need_id where dl.donation_id = $1`,
          [donationId],
        );
    const refunds = await tx.query<any>(
      `select r.id, r.reason, r.status, r.resolution_note, r.created_at, r.resolved_at, p.full_name, p.email
       from refund_requests r left join profiles p on p.id = r.requested_by where r.donation_id = $1 order by r.created_at desc`,
      [donationId],
    );
    return { d, allocations, lines, refunds };
  });
  if (!data) notFound();
  const { d, allocations, lines, refunds } = data;
  const base = `/app/manager/${teamId}`;
  const shown = d.show_name ? d.donor_name : 'Anonymous';
  const donorTitle = ctx.canEdit ? d.donor_name : shown;
  const openRefund = refunds.some((r: any) => r.status === 'open');
  const message = d.message && (ctx.canEdit || d.message_status === 'approved') ? d.message : null;

  return (
    <div className="flex max-w-[880px] flex-col gap-8">
      <PageHeader
        crumbs={<Breadcrumb items={[{ label: 'Donations', href: `${base}/donations` }, { label: donorTitle }]} />}
        title={`${money(d.total_cents)} from ${donorTitle}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone={d.status === 'succeeded' ? 'funded' : d.status === 'disputed' ? 'error' : d.status === 'pending' ? 'warn' : 'muted'}>{STATUS[d.status] ?? d.status}</Chip>
            <span>{formatDateTime(d.created_at)}</span>
          </span>
        }
      />

      {d.status === 'disputed' && <Banner tone="error">The donor disputed this charge with their bank. Gridiron Give handles the response.</Banner>}

      <Section title="Donor">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
          <dt className="t-caption">Name on the gift</dt>
          <dd>{donorTitle}</dd>
          {ctx.canEdit && (
            <>
              <dt className="t-caption">Shown publicly as</dt>
              <dd>{shown}</dd>
              <dt className="t-caption">Email</dt>
              <dd className="break-all">
                <a href={`mailto:${d.donor_email}`}>{d.donor_email}</a>
              </dd>
            </>
          )}
          <dt className="t-caption">Message</dt>
          <dd>
            {message ? <q>{message}</q> : 'None'}
            {message && d.message_status === 'pending' && <span className="t-caption block">Waiting for approval in Approvals.</span>}
            {message && d.message_status === 'rejected' && <span className="t-caption block">Not shown publicly.</span>}
          </dd>
        </dl>
      </Section>

      <Section title="Where the money went">
        {allocations.length > 0 ? (
          <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {allocations.map((al: any, i: number) => (
              <li key={i} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {al.kind === 'team_fund' ? 'Team fund' : al.name}
                    {al.variant ? <span className="font-normal text-ink-meta"> · {al.variant}</span> : null}
                  </p>
                  <p className="t-caption">
                    {al.athlete_id ? (
                      <Link href={`${base}/roster/${al.athlete_id}`} className="underline">{athleteDisplayName(al)}</Link>
                    ) : al.kind === 'team_fund' ? (
                      'Unrestricted, spent where needed'
                    ) : (
                      'Team item'
                    )}
                    {al.overflow && ' · Extra sent to the team fund'}
                    {al.reversed_at && ` · Reversed ${formatDate(al.reversed_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {al.kind !== 'team_fund' && <NeedStatusChip status={al.status} />}
                  <span className={`tabular font-medium ${al.reversed_at ? 'text-ink-meta line-through' : 'text-ink'}`}>{money(al.amount_cents)}</span>
                  {ctx.canEdit && al.kind !== 'team_fund' && (
                    <Link href={`${base}/purchases?need=${al.need_id}`} className="t-caption">
                      Open item
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="t-body">Not allocated yet. Money moves to items when the payment succeeds.</p>
            {lines.length > 0 && (
              <ul className="t-list list-disc pl-5">
                {lines.map((l: any, i: number) => (
                  <li key={i}>
                    {l.name ?? (l.athlete_id ? 'Open items for the player' : 'Team fund')}: {money(l.requested_cents)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section title="Payment">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
          <dt className="t-caption">Gift</dt>
          <dd className="tabular">{money(d.gift_cents)}</dd>
          <dt className="t-caption">Fees</dt>
          <dd className="tabular">
            {money(d.platform_fee_cents + d.stripe_fee_cents)} {d.cover_fees ? '(covered by the donor)' : '(taken from the gift)'}
          </dd>
          <dt className="t-caption">Charged</dt>
          <dd className="tabular">
            {money(d.total_cents)}
            {d.card_last4 ? ` · ${d.card_brand ?? 'Card'} ending ${d.card_last4}` : ''}
          </dd>
          <dt className="t-caption">Net to team</dt>
          <dd className="tabular font-medium text-ink">{money(d.net_cents)}</dd>
          <dt className="t-caption">Stripe charge</dt>
          <dd className="break-all font-mono text-[14px]">{d.charge_id ?? 'None yet'}</dd>
          <dt className="t-caption">Payment intent</dt>
          <dd className="break-all font-mono text-[14px]">{d.payment_intent_id ?? 'None yet'}</dd>
          {d.failure_reason && (
            <>
              <dt className="t-caption">Failure</dt>
              <dd>{d.failure_reason}</dd>
            </>
          )}
        </dl>
      </Section>

      <Section title="Refunds">
        {d.refunded_at && <p className="t-body">Refunded {formatDateTime(d.refunded_at)}.</p>}
        {refunds.length > 0 ? (
          <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {refunds.map((r: any) => (
              <li key={r.id} className="flex flex-col gap-1 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={r.status === 'open' ? 'warn' : r.status === 'refunded' ? 'neutral' : 'muted'}>
                    {r.status === 'open' ? 'Requested' : r.status === 'refunded' ? 'Refunded' : 'Declined'}
                  </Chip>
                  <span className="t-caption">
                    {formatDateTime(r.created_at)} by {r.full_name ?? r.email ?? 'staff'}
                  </span>
                </div>
                <p className="t-body">{r.reason}</p>
                {r.resolution_note && <p className="t-caption">Admin note: {r.resolution_note}</p>}
              </li>
            ))}
          </ul>
        ) : (
          !d.refunded_at && <p className="t-caption">No refund requests.</p>
        )}
        {ctx.canEdit && d.status === 'succeeded' && !openRefund && <RefundRequest teamId={teamId} donationId={donationId} />}
        {ctx.canEdit && openRefund && <p className="t-caption">A Gridiron Give admin reviews open requests, usually within 1 business day.</p>}
      </Section>
    </div>
  );
}
