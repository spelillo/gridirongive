import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { sys } from '@/lib/db';
import { refundDonation, declineRefundRequest, moderateMessage } from '@/lib/app/admin-actions';
import { receiptSig } from '@/lib/crypto';
import { money } from '@/lib/domain/money';
import { formatDateTime } from '@/lib/domain/text';
import { athleteDisplayName } from '@/lib/domain/names';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Chip, NeedStatusChip } from '@/components/ui/Chip';
import { Banner } from '@/components/ui/Banner';
import { AdminAction } from '../../_components/AdminAction';
import { DonationStatus } from '../../_components/DonationStatus';

export const metadata = { title: 'Gift' };

/** One gift: payment details, what it asked for, what it funded, and refunds. */
export default async function AdminDonationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await sys.one<any>(
    `select d.*, t.name as team_name, t.id as team_id, s.label as season_label from donations d join teams t on t.id = d.team_id
     left join seasons s on s.id = d.season_id where d.id = $1`,
    [id],
  );
  if (!d) notFound();
  const [allocs, requests] = await Promise.all([
    sys.query<any>(
      `select al.id, al.amount_cents, al.overflow, al.reversed_at, al.created_at, n.name, n.kind, n.status, n.athlete_id,
         a.first_name, a.last_name, a.preferred_name, a.show_full_last_name
       from allocations al join needs n on n.id = al.need_id left join athletes a on a.id = n.athlete_id
       where al.donation_id = $1 order by al.created_at`,
      [id],
    ),
    sys.query<any>(
      `select r.id, r.reason, r.status, r.resolution_note, r.created_at, r.resolved_at, p.email as requested_by
       from refund_requests r left join profiles p on p.id = r.requested_by where r.donation_id = $1 order by r.created_at desc`,
      [id],
    ),
  ]);
  const refundable = d.status === 'succeeded' || d.status === 'disputed';
  const openRequest = requests.find((r) => r.status === 'open');
  const facts: [string, React.ReactNode][] = [
    ['Donor', `${d.donor_name}${d.show_name ? '' : ' (shown as "A supporter")'}`],
    ['Email', d.donor_email],
    ['Team', <Link key="t" href={`/app/manager/${d.team_id}/donations`}>{d.team_name}</Link>],
    ['Season', d.season_label ?? ''],
    ['Created', formatDateTime(d.created_at)],
    ['Paid', d.succeeded_at ? formatDateTime(d.succeeded_at) : 'Not yet'],
    ...(d.refunded_at ? [['Refunded', formatDateTime(d.refunded_at)] as [string, string]] : []),
    ['Gift', money(d.gift_cents)],
    ['Fees', `${money(d.platform_fee_cents)} platform, ${money(d.stripe_fee_cents)} card processing${d.cover_fees ? ', covered by the donor' : ''}`],
    ['Charged', money(d.total_cents)],
    ['To the team', money(d.net_cents)],
    ['Payment intent', d.payment_intent_id ?? 'None'],
    ['Charge', d.charge_id ?? 'None'],
    ['Card', d.card_last4 ? `${d.card_brand ?? 'Card'} ending ${d.card_last4}` : 'None'],
    ...(d.failure_reason ? [['Failure', d.failure_reason] as [string, string]] : []),
  ];

  return (
    <div className="flex max-w-[960px] flex-col gap-8">
      <PageHeader
        crumbs={
          <Link href="/app/admin/donations" className="inline-flex min-h-11 w-fit items-center gap-1 text-[15px]">
            <ChevronLeft size={18} aria-hidden /> Donations
          </Link>
        }
        title={`${money(d.total_cents)} from ${d.donor_name}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <DonationStatus status={d.status} />
            <span>No. {d.id.slice(0, 8).toUpperCase()}</span>
          </span>
        }
        actions={
          <>
            {d.status !== 'failed' && (
              <Link href={`/receipt/${d.id}?sig=${receiptSig(d.id)}`} prefetch={false} className="inline-flex min-h-11 items-center">
                View receipt
              </Link>
            )}
            {refundable && (
              <AdminAction
                action={refundDonation.bind(null, d.id)}
                label="Refund"
                srLabel={`Refund ${d.donor_name}`}
                variant="destructive"
                confirm={{ title: `Refund ${money(d.total_cents)} to ${d.donor_name}?`, body: 'The full charge goes back to the card and the items it funded reopen. The donor, the coaches and the player\'s family are emailed.' }}
                reason={{ label: 'Reason', helper: 'Kept with the gift and shared with the team. At least 5 characters.' }}
              />
            )}
          </>
        }
      />

      {d.status === 'disputed' && <Banner tone="warn">The donor&apos;s bank opened a dispute. Respond in the Stripe dashboard. The items it funded are reopened until it is resolved.</Banner>}

      <dl className="-mt-4 grid gap-x-6 gap-y-3 rounded-md border border-hairline-soft p-4 text-[15px] sm:grid-cols-[max-content_1fr]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="t-label">{k}</dt>
            <dd className="break-all text-ink-body sm:break-normal">{v}</dd>
          </div>
        ))}
      </dl>

      {d.message && (
        <Section title="Message" id="message">
          <div className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4">
            <p className="text-[15px] leading-[22px] text-ink-body">{d.message}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Chip tone={d.message_status === 'approved' ? 'funded' : d.message_status === 'rejected' ? 'error' : 'warn'}>
                {d.message_status === 'approved' ? 'Shown' : d.message_status === 'rejected' ? 'Hidden' : 'Waiting for review'}
              </Chip>
              {d.message_status !== 'approved' && <AdminAction action={moderateMessage.bind(null, d.id, 'approved')} label="Approve message" size="sm" />}
              {d.message_status !== 'rejected' && <AdminAction action={moderateMessage.bind(null, d.id, 'rejected')} label="Hide message" size="sm" variant="destructive" />}
            </div>
          </div>
        </Section>
      )}

      <Section title="What it funded" id="allocations">
        {allocs.length === 0 ? (
          <p className="t-body">{d.status === 'succeeded' ? 'Nothing was allocated.' : 'Gifts are allocated when the payment succeeds.'}</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-hairline-soft">
            <table className="hidden w-full text-left text-[15px] md:table">
              <caption className="sr-only">Allocations</caption>
              <thead className="bg-chrome">
                <tr>
                  <th scope="col" className="t-label px-4 py-2.5">Item</th>
                  <th scope="col" className="t-label px-4 py-2.5">Item status</th>
                  <th scope="col" className="t-label px-4 py-2.5">Allocation</th>
                  <th scope="col" className="t-label px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {allocs.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-ink">{a.kind === 'team_fund' ? 'Team fund' : a.athlete_id ? `${a.name} for ${athleteDisplayName(a)}` : a.name}</td>
                    <td className="px-4 py-3"><NeedStatusChip status={a.status} /></td>
                    <td className="px-4 py-3">
                      {a.reversed_at ? <Chip tone="muted">Reversed {formatDateTime(a.reversed_at)}</Chip> : a.overflow ? <Chip tone="info">Overflow to fund</Chip> : <Chip tone="funded">Active</Chip>}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-ink">{money(a.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-hairline-soft md:hidden" aria-label="Allocations">
              {allocs.map((a) => (
                <li key={a.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] text-ink">{a.kind === 'team_fund' ? 'Team fund' : a.athlete_id ? `${a.name} for ${athleteDisplayName(a)}` : a.name}</span>
                    <span className="tabular text-ink">{money(a.amount_cents)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <NeedStatusChip status={a.status} />
                    {a.reversed_at ? <Chip tone="muted">Reversed</Chip> : a.overflow ? <Chip tone="info">Overflow to fund</Chip> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Refund requests" id="requests">
        {requests.length === 0 ? (
          <p className="t-body">None.</p>
        ) : (
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={r.status === 'open' ? 'warn' : r.status === 'refunded' ? 'neutral' : 'muted'}>{r.status === 'open' ? 'Open' : r.status === 'refunded' ? 'Refunded' : 'Declined'}</Chip>
                  <span className="t-caption">
                    {formatDateTime(r.created_at)}
                    {r.requested_by ? ` by ${r.requested_by}` : ''}
                  </span>
                </div>
                <p className="text-[15px] text-ink-body">{r.reason}</p>
                {r.resolution_note && <p className="t-caption">Resolution: {r.resolution_note}</p>}
                {r.id === openRequest?.id && (
                  <div>
                    <AdminAction
                      action={declineRefundRequest.bind(null, r.id)}
                      label="Decline request"
                      size="sm"
                      confirm={{ title: 'Decline this request?', body: 'The coaches get your note by email.' }}
                      reason={{ label: 'Note for the coaches' }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
