import Link from 'next/link';
import { Download, Search } from 'lucide-react';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { donationWhere, donorDisplay, filterQuery, ledgerSelect, ledgerTotals, parseDonationFilters, PAGE_SIZE, type LedgerRow } from '@/lib/app/team-money';
import { athleteDisplayName } from '@/lib/domain/names';
import { money } from '@/lib/domain/money';
import { formatDate, truncate } from '@/lib/domain/text';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink, buttonClass } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';

export const metadata = { title: 'Donations' };

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  succeeded: { label: 'Succeeded', tone: 'funded' },
  refunded: { label: 'Refunded', tone: 'muted' },
  disputed: { label: 'Disputed', tone: 'error' },
  pending: { label: 'Pending', tone: 'warn' },
  failed: { label: 'Failed', tone: 'muted' },
};

type Props = { params: Promise<{ teamId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Donations ledger (ui-ux-spec 8.8). */
export default async function DonationsPage({ params, searchParams }: Props) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  const f = parseDonationFilters(await searchParams);
  const where = donationWhere(teamId, f, ctx.canEdit);
  const page = f.page ?? 1;

  const { rows, totals, athletes, items } = await asUser(ctx.user.id, async (tx) => {
    const rows = await tx.query<LedgerRow>(
      `${ledgerSelect(where.sql)} order by d.created_at desc limit ${PAGE_SIZE + 1} offset ${(page - 1) * PAGE_SIZE}`,
      where.params,
    );
    const totals = await ledgerTotals(tx, where);
    const athletes = await tx.query<any>(
      `select id, first_name, last_name, preferred_name, show_full_last_name, jersey from athletes where team_id = $1 order by first_name, last_name`,
      [teamId],
    );
    const items = await tx.query<{ name: string }>(`select distinct name from needs where team_id = $1 order by name`, [teamId]);
    return { rows, totals, athletes, items };
  });
  const more = rows.length > PAGE_SIZE;
  const list = rows.slice(0, PAGE_SIZE);
  const base = `/app/manager/${teamId}/donations`;
  const filtered = Boolean(f.from || f.to || f.athlete || f.item || f.status || f.q);
  const csvHref = `/api/teams/${teamId}/donations.csv${filterQuery(f)}`;
  const athleteName = (r: LedgerRow) =>
    r.athlete_id && r.athlete_first
      ? athleteDisplayName({ first_name: r.athlete_first, last_name: r.athlete_last ?? '', preferred_name: r.athlete_preferred, show_full_last_name: r.athlete_full })
      : 'Team';
  const donor = (r: LedgerRow) => (ctx.canEdit ? r.donor_name : donorDisplay(r));
  const message = (r: LedgerRow) => (r.message && (ctx.canEdit || r.message_status === 'approved') ? r.message : null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Donations"
        sub={`${ctx.team.name} · every gift, with where it went`}
        actions={
          <a href={csvHref} className={buttonClass('secondary')} download>
            <Download size={18} aria-hidden /> Export CSV
          </a>
        }
      />

      <form method="get" action={base} className="grid gap-3 rounded-md border border-hairline-soft bg-chrome p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filter donations">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="f-q" className="t-label">
            {ctx.canEdit ? 'Donor name or email' : 'Donor name'}
          </label>
          <div className="relative">
            <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-meta" />
            <Input id="f-q" name="q" type="search" defaultValue={f.q ?? ''} className="pl-10" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-from" className="t-label">
            From
          </label>
          <Input id="f-from" name="from" type="date" defaultValue={f.from ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-to" className="t-label">
            To
          </label>
          <Input id="f-to" name="to" type="date" defaultValue={f.to ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-athlete" className="t-label">
            Athlete
          </label>
          <Select id="f-athlete" name="athlete" defaultValue={f.athlete ?? ''}>
            <option value="">All</option>
            <option value="team">Team gifts only</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {athleteDisplayName(a)}
                {a.jersey ? ` #${a.jersey}` : ''}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-item" className="t-label">
            Item
          </label>
          <Select id="f-item" name="item" defaultValue={f.item ?? ''}>
            <option value="">All</option>
            {items.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-status" className="t-label">
            Status
          </label>
          <Select id="f-status" name="status" defaultValue={f.status ?? ''}>
            <option value="">Completed</option>
            <option value="succeeded">Succeeded</option>
            <option value="refunded">Refunded</option>
            <option value="disputed">Disputed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="any">Any status</option>
          </Select>
        </div>
        <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-5">
          <button type="submit" className={buttonClass('primary')}>
            Apply filters
          </button>
          {filtered && (
            <ButtonLink href={base} variant="tertiary" chevron={false}>
              Clear
            </ButtonLink>
          )}
        </div>
      </form>

      <section aria-labelledby="totals-h" className="flex flex-col gap-2">
        <h2 id="totals-h" className="sr-only">
          Totals
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline-soft bg-hairline-soft md:grid-cols-4">
          {[
            ['Gifts', totals.n.toLocaleString('en-US')],
            ['Gift amount', money(totals.gift)],
            ['Fees covered by donors', money(totals.fees)],
            ['Net to team', money(totals.net)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 bg-canvas p-4">
              <dt className="t-caption">{k}</dt>
              <dd className="t-figure tabular">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="t-caption" aria-live="polite">
          {filtered ? 'Totals for the filtered view.' : 'Totals for completed, refunded and disputed gifts.'}
        </p>
      </section>

      {list.length === 0 ? (
        <EmptyState action={filtered ? <ButtonLink href={base} variant="secondary">Clear filters</ButtonLink> : <ButtonLink href={`/app/manager/${teamId}/share`} variant="secondary">Open the share kit</ButtonLink>}>
          {filtered ? 'No gifts match these filters.' : 'No gifts yet. Share the team link to get the first one.'}
        </EmptyState>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Donations, newest first</caption>
              <thead>
                <tr className="bg-chrome">
                  {['Date', 'Donor', 'Athlete', 'Items', 'Gift', 'Fees covered', 'Net to team', 'Status', 'Message'].map((h, i) => (
                    <th key={h} scope="col" className={`t-label h-12 px-3 font-medium ${i >= 4 && i <= 6 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-hairline-soft align-top hover:bg-chrome">
                    <td className="t-list whitespace-nowrap px-3 py-3 tabular">{formatDate(r.created_at)}</td>
                    <td className="min-w-[200px] px-3 py-3">
                      <Link href={`${base}/${r.id}`} className="font-medium">
                        {donor(r)}
                      </Link>
                      {ctx.canEdit && !r.show_name && <span className="t-caption block">Shown as Anonymous</span>}
                      {ctx.canEdit && <span className="t-caption block [overflow-wrap:anywhere]">{r.donor_email}</span>}
                    </td>
                    <td className="t-list whitespace-nowrap px-3 py-3">{athleteName(r)}</td>
                    <td className="t-list px-3 py-3">{r.items ?? 'Team fund'}</td>
                    <td className="t-list px-3 py-3 text-right tabular">{money(r.gift_cents)}</td>
                    <td className="t-list px-3 py-3 text-right tabular">{r.cover_fees ? money(r.fees_cents) : 'No'}</td>
                    <td className="t-list px-3 py-3 text-right tabular">{money(r.net_cents)}</td>
                    <td className="px-3 py-3">
                      <Chip tone={STATUS[r.status]?.tone ?? 'muted'}>{STATUS[r.status]?.label ?? r.status}</Chip>
                    </td>
                    <td className="t-list max-w-[220px] px-3 py-3">
                      {message(r) ? truncate(message(r)!, 80) : <span className="text-ink-meta">None</span>}
                      {message(r) && r.message_status === 'pending' && <span className="t-caption block">Waiting for approval</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col divide-y divide-hairline-soft border-y border-hairline-soft md:hidden">
            {list.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`${base}/${r.id}`} className="text-[16px] font-medium">
                      {donor(r)}
                    </Link>
                    {ctx.canEdit && <p className="t-caption break-all">{r.donor_email}{!r.show_name ? ' · Shown as Anonymous' : ''}</p>}
                  </div>
                  <Chip tone={STATUS[r.status]?.tone ?? 'muted'}>{STATUS[r.status]?.label ?? r.status}</Chip>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
                  <dt className="t-caption">Date</dt>
                  <dd className="tabular">{formatDate(r.created_at)}</dd>
                  <dt className="t-caption">Athlete</dt>
                  <dd>{athleteName(r)}</dd>
                  <dt className="t-caption">Items</dt>
                  <dd>{r.items ?? 'Team fund'}</dd>
                  <dt className="t-caption">Gift</dt>
                  <dd className="tabular">{money(r.gift_cents)}</dd>
                  <dt className="t-caption">Fees covered</dt>
                  <dd className="tabular">{r.cover_fees ? money(r.fees_cents) : 'No'}</dd>
                  <dt className="t-caption">Net to team</dt>
                  <dd className="tabular">{money(r.net_cents)}</dd>
                  {message(r) && (
                    <>
                      <dt className="t-caption">Message</dt>
                      <dd>{truncate(message(r)!, 120)}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>

          <nav aria-label="Pages" className="flex items-center justify-between gap-3">
            <p className="t-caption tabular">
              Showing {(page - 1) * PAGE_SIZE + 1} to {(page - 1) * PAGE_SIZE + list.length} of {totals.n.toLocaleString('en-US')}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <ButtonLink href={`${base}${filterQuery(f, { page: page - 1 })}`} variant="secondary" size="sm">
                  Previous
                </ButtonLink>
              )}
              {more && (
                <ButtonLink href={`${base}${filterQuery(f, { page: page + 1 })}`} variant="secondary" size="sm">
                  Next
                </ButtonLink>
              )}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
