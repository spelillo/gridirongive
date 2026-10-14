import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDonationSummary } from '@/lib/queries/donation';
import { hasDonorAccess } from '@/lib/payments/donor-access';
import { money } from '@/lib/domain/money';
import { formatDate, formatDateTime } from '@/lib/domain/text';
import { possessive } from '@/lib/domain/names';
import { SITE } from '@/config/site';
import { PrintButton } from './PrintButton';

export const metadata: Metadata = { title: 'Receipt', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ sig?: string }> };

const statusText: Record<string, string> = {
  succeeded: 'Paid',
  pending: 'Processing',
  failed: 'Not charged',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

/** Printable receipt (ui-ux-spec 5.7). Reached by signed link or by the browser that gave. */
export default async function ReceiptPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { sig } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await hasDonorAccess(id, sig))) notFound();
  const d = await getDonationSummary(id);
  if (!d || d.status === 'failed') notFound();
  const deductible = SITE.taxDeductibleReceipts && d.team.orgTaxExempt && d.team.orgEin;
  const fees = d.platformFeeCents + d.stripeFeeCents;

  return (
    <div className="page-x mx-auto flex w-full max-w-[720px] flex-col gap-6 py-8 print:max-w-none print:p-0">
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>
      <article className="flex flex-col gap-6 rounded-lg border border-hairline-soft p-6 md:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline-soft pb-4">
          <div>
            <p className="text-[18px] font-medium text-ink">Gridiron Give</p>
            <h1 className="t-section mt-1">Receipt</h1>
          </div>
          <dl className="text-right text-[14px] leading-5">
            <dt className="sr-only">Receipt number</dt>
            <dd className="tabular text-ink">No. {d.id.slice(0, 8).toUpperCase()}</dd>
            <dt className="sr-only">Date</dt>
            <dd className="text-ink-body">{formatDate(d.succeededAt ?? d.createdAt)}</dd>
            <dt className="sr-only">Status</dt>
            <dd className="font-medium text-ink">{statusText[d.status] ?? d.status}</dd>
          </dl>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="t-label">From</h2>
            <p className="t-body">{d.donorName}</p>
            <p className="t-body">{d.donorEmail}</p>
          </div>
          <div>
            <h2 className="t-label">To</h2>
            <p className="t-body">{d.team.name}</p>
            <p className="t-body">{d.team.orgName}</p>
            {d.team.orgEin && <p className="t-caption tabular">EIN {d.team.orgEin}</p>}
          </div>
        </section>

        <table className="w-full text-[15px]">
          <caption className="sr-only">Line items</caption>
          <thead>
            <tr className="border-b border-hairline-soft text-left">
              <th scope="col" className="t-label py-2 font-medium">Item</th>
              <th scope="col" className="t-label py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.length > 0 ? (
              d.lines.map((l) => (
                <tr key={l.needId} className="border-b border-hairline-soft">
                  <td className="py-2 pr-4 text-ink-body">
                    {l.kind === 'team_fund' ? 'Team fund' : l.athleteName ? `${possessive(l.athleteName)} ${l.name}` : l.name}
                  </td>
                  <td className="py-2 text-right tabular text-ink">{money(l.amountCents)}</td>
                </tr>
              ))
            ) : (
              <tr className="border-b border-hairline-soft">
                <td className="py-2 pr-4 text-ink-body">Gift to {d.team.name}</td>
                <td className="py-2 text-right tabular text-ink">{money(d.netCents)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="py-2 pr-4 text-left font-normal text-ink-body">Gift</th>
              <td className="py-2 text-right tabular text-ink">{money(d.giftCents)}</td>
            </tr>
            <tr>
              <th scope="row" className="py-1 pr-4 text-left font-normal text-ink-body">
                {d.coverFees ? 'Fees you covered' : 'Fees (taken from the gift)'}
              </th>
              <td className="py-1 text-right tabular text-ink">{money(fees)}</td>
            </tr>
            <tr className="border-t border-hairline">
              <th scope="row" className="py-2 pr-4 text-left font-medium text-ink">Total charged</th>
              <td className="py-2 text-right text-[18px] font-medium tabular text-ink">{money(d.totalCents)}</td>
            </tr>
          </tfoot>
        </table>

        <dl className="grid gap-x-6 gap-y-1 text-[14px] leading-5 sm:grid-cols-[max-content_1fr]">
          {d.cardLast4 && (
            <>
              <dt className="text-ink-meta">Payment</dt>
              <dd className="tabular text-ink-body">
                {(d.cardBrand ?? 'Card').replace(/^./, (c) => c.toUpperCase())} ending {d.cardLast4}
              </dd>
            </>
          )}
          {d.chargeId && (
            <>
              <dt className="text-ink-meta">Charge ID</dt>
              <dd className="break-all tabular text-ink-body">{d.chargeId}</dd>
            </>
          )}
          {d.succeededAt && (
            <>
              <dt className="text-ink-meta">Paid</dt>
              <dd className="text-ink-body">{formatDateTime(d.succeededAt)}</dd>
            </>
          )}
          {d.refundedAt && (
            <>
              <dt className="text-ink-meta">Refunded</dt>
              <dd className="text-ink-body">{formatDateTime(d.refundedAt)}</dd>
            </>
          )}
        </dl>

        <p className="border-t border-hairline-soft pt-4 text-[14px] leading-5 text-ink-body">
          {deductible
            ? `${d.team.orgName} is a tax-exempt organization (EIN ${d.team.orgEin}). No goods or services were provided in exchange for this gift.`
            : 'Gridiron Give is not a charity, and this is not a tax receipt. Keep it for your records.'}
        </p>
        <p className="t-caption">Payments are processed by Stripe. Gridiron Give never stores card numbers.</p>
      </article>
    </div>
  );
}
