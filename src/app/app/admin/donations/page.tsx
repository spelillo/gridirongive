import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { sys } from '@/lib/db';
import { refundDonation, declineRefundRequest } from '@/lib/app/admin-actions';
import { money } from '@/lib/domain/money';
import { formatDate, formatDateTime } from '@/lib/domain/text';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AdminAction } from '../_components/AdminAction';
import { DonationStatus, DONATION_STATUS } from '../_components/DonationStatus';

export const metadata = { title: 'Donations' };

interface Row {
  id: string;
  created_at: Date;
  succeeded_at: Date | null;
  donor_name: string;
  donor_email: string;
  status: string;
  total_cents: number;
  payment_intent_id: string | null;
  team_name: string;
}

/** Donation search, the refund request queue, and refunds (ui-ux-spec 9). */
export default async function AdminDonationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin();
  const { q = '', status = '' } = await searchParams;
  const term = q.trim().slice(0, 120);
  const st = Object.keys(DONATION_STATUS).includes(status) ? status : '';
  const [requests, rows] = await Promise.all([
    sys.query<any>(
      `select r.id, r.donation_id, r.reason, r.created_at, t.name as team_name, d.donor_name, d.donor_email, d.total_cents, d.status as donation_status,
         p.email as requested_by
       from refund_requests r join donations d on d.id = r.donation_id join teams t on t.id = r.team_id left join profiles p on p.id = r.requested_by
       where r.status = 'open' order by r.created_at`,
    ),
    sys.query<Row>(
      `select d.id, d.created_at, d.succeeded_at, d.donor_name, d.donor_email, d.status, d.total_cents, d.payment_intent_id, t.name as team_name
       from donations d join teams t on t.id = d.team_id
       where ($1 = '' or d.donor_name ilike '%' || $1 || '%' or d.donor_email ilike '%' || $1 || '%' or d.payment_intent_id = $1
              or d.charge_id = $1 or t.name ilike '%' || $1 || '%' or d.id::text like lower($1) || '%')
         and ($2 = '' or d.status::text = $2)
       order by d.created_at desc limit $3`,
      [term, st, term || st ? 100 : 25],
    ),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Donations" sub="Refunds reverse what a gift funded and reopen those items. The donor, the coaches and the player's family are told." />

      <Section title={`Refund requests${requests.length ? ` (${requests.length})` : ''}`} id="refunds" className="-mt-4 flex flex-col gap-4">
        {requests.length === 0 ? (
          <p className="t-body">No open refund requests.</p>
        ) : (
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/app/admin/donations/${r.donation_id}`} className="text-[16px] font-medium">
                    {money(r.total_cents)} from {r.donor_name}
                  </Link>
                  <p className="t-caption">
                    {r.team_name} · requested {formatDate(r.created_at)}
                    {r.requested_by ? ` by ${r.requested_by}` : ''}
                  </p>
                  <p className="text-[15px] leading-[22px] text-ink-body">{r.reason}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-3">
                  {r.donation_status === 'succeeded' || r.donation_status === 'disputed' ? (
                    <AdminAction
                      action={refundDonation.bind(null, r.donation_id)}
                      label="Refund"
                      srLabel={`Refund ${r.donor_name}`}
                      size="sm"
                      variant="destructive"
                      confirm={{ title: `Refund ${money(r.total_cents)} to ${r.donor_name}?`, body: 'The full charge goes back to the card. The items it funded reopen.' }}
                      reason={{ label: 'Reason', helper: 'Kept with the gift and shared with the team. At least 5 characters.' }}
                    />
                  ) : (
                    <DonationStatus status={r.donation_status} />
                  )}
                  <AdminAction
                    action={declineRefundRequest.bind(null, r.id)}
                    label="Decline"
                    srLabel={`Decline the refund request for ${r.donor_name}`}
                    size="sm"
                    confirm={{ title: 'Decline this request?', body: 'The coaches get your note by email.' }}
                    reason={{ label: 'Note for the coaches' }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Search gifts" id="search">
        <form role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/app/admin/donations">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="don-q" className="t-label">
              Donor, email, team or payment ID
            </label>
            <Input id="don-q" name="q" defaultValue={term} placeholder="pi_..., name@example.com" />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-44">
            <label htmlFor="don-status" className="t-label">
              Status
            </label>
            <Select id="don-status" name="status" defaultValue={st}>
              <option value="">Any status</option>
              {Object.entries(DONATION_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            <Search size={18} aria-hidden /> Search
          </Button>
        </form>

        {rows.length === 0 ? (
          <EmptyState action={<Link href="/app/admin/donations">Clear the search</Link>}>No gifts match.</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-md border border-hairline-soft">
            <table className="hidden w-full text-left text-[15px] md:table">
              <caption className="sr-only">Gifts, newest first</caption>
              <thead className="bg-chrome">
                <tr>
                  <th scope="col" className="t-label px-4 py-2.5">Date</th>
                  <th scope="col" className="t-label px-4 py-2.5">Donor</th>
                  <th scope="col" className="t-label px-4 py-2.5">Team</th>
                  <th scope="col" className="t-label px-4 py-2.5">Status</th>
                  <th scope="col" className="t-label px-4 py-2.5 text-right">Charged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-body">{formatDateTime(d.succeeded_at ?? d.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/app/admin/donations/${d.id}`} className="font-medium">
                        {d.donor_name}
                      </Link>
                      <div className="t-caption break-all">{d.donor_email}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-body">{d.team_name}</td>
                    <td className="px-4 py-3"><DonationStatus status={d.status} /></td>
                    <td className="px-4 py-3 text-right tabular text-ink">{money(d.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-hairline-soft md:hidden" aria-label="Gifts, newest first">
              {rows.map((d) => (
                <li key={d.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/app/admin/donations/${d.id}`} className="text-[16px] font-medium">
                      {d.donor_name}
                    </Link>
                    <span className="tabular text-ink">{money(d.total_cents)}</span>
                  </div>
                  <p className="t-caption break-all">{d.donor_email}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <DonationStatus status={d.status} />
                    <span className="t-caption">
                      {d.team_name} · {formatDate(d.succeeded_at ?? d.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {rows.length === (term || st ? 100 : 25) && <p className="t-caption">Showing the latest {rows.length}. Search to find older gifts.</p>}
      </Section>
    </div>
  );
}
