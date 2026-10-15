import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import { getDonationSummary, nextOpenNeed } from '@/lib/queries/donation';
import { hasDonorAccess } from '@/lib/payments/donor-access';
import { receiptSig } from '@/lib/crypto';
import { env } from '@/lib/env';
import { getUser } from '@/lib/auth/session';
import { Meter } from '@/components/ui/Meter';
import { Banner } from '@/components/ui/Banner';
import { ButtonLink } from '@/components/ui/Button';
import { ShareButton } from '@/components/ui/CopyButton';
import { NeedStatusChip } from '@/components/ui/Chip';
import { money, moneyWhole } from '@/lib/domain/money';
import { possessive } from '@/lib/domain/names';
import { ConfirmingPoll } from './ConfirmingPoll';
import { SaveHistory } from './SaveHistory';
import { TrackView } from '@/components/public/TrackView';

export const metadata: Metadata = { title: 'Thank you', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ redirect_status?: string; sig?: string }> };

const brandLabel: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover' };

export default async function SuccessPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { redirect_status, sig } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await hasDonorAccess(id, sig))) notFound();
  const d = await getDonationSummary(id);
  if (!d) notFound();

  const back = d.athlete ? `/t/${d.team.slug}/${d.athlete.slug}` : `/t/${d.team.slug}`;
  if (d.status === 'failed' || redirect_status === 'failed') {
    return (
      <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-6 py-10">
        <h1 className="t-section">The payment didn&apos;t go through</h1>
        <Banner tone="error">Nothing was charged. Your bank or card provider declined it.</Banner>
        <div>
          <ButtonLink href={back}>Try again</ButtonLink>
        </div>
      </div>
    );
  }
  if (d.status === 'pending') {
    return (
      <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-6 py-10">
        <ConfirmingPoll />
      </div>
    );
  }

  const user = await getUser();
  const receiptUrl = `/receipt/${d.id}?sig=${receiptSig(d.id)}`;
  const shareUrl = d.athlete ? `${env.appUrl}/s/${d.athlete.shareToken}` : `${env.appUrl}/t/${d.team.slug}`;
  const next = d.athlete ? await nextOpenNeed(d.athlete.id, d.lines.map((l) => l.needId)) : null;
  const first = d.athlete?.first;
  const reversed = d.status === 'refunded' || d.status === 'disputed';

  return (
    <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-8 py-8 md:py-12">
      <TrackView name="success_viewed" props={{}} />
      <div className="flex flex-col gap-2">
        <CircleCheck aria-hidden size={32} className="text-funded" strokeWidth={1.75} />
        <h1 className="t-hero">Thank you. Your gift is in.</h1>
      </div>
      {reversed && <Banner tone="warn">This gift was {d.status === 'refunded' ? 'refunded' : 'disputed'}, so the items it funded were reopened.</Banner>}

      <section aria-label="Your gift" className="flex flex-col gap-4 rounded-lg border border-hairline-soft p-5">
        <ul className="flex flex-col gap-4">
          {d.lines.map((l) => (
            <li key={l.needId} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[16px] leading-6 text-ink">
                  <span className="font-medium tabular">{money(l.amountCents)}</span>{' '}
                  {l.kind === 'team_fund' ? (
                    <>to the {d.team.name} team fund{l.overflow && <span className="text-ink-meta"> (extra beyond the item)</span>}</>
                  ) : l.athleteName ? (
                    <>toward {possessive(l.athleteName)} {l.name}</>
                  ) : (
                    <>toward the team&apos;s {l.name}</>
                  )}
                </p>
                {l.kind !== 'team_fund' && l.status !== 'open' && l.status !== 'partially_funded' && <NeedStatusChip status={l.status} />}
              </div>
              {l.kind !== 'team_fund' && l.priceCents !== null && (
                <div className="flex flex-col gap-1">
                  <Meter raised={l.raisedCents} goal={l.priceCents} compact showText={false} label={`${l.name}: ${moneyWhole(l.raisedCents)} of ${moneyWhole(l.priceCents)}`} />
                  <p className="t-caption tabular">
                    {l.raisedCents >= l.priceCents ? 'Fully funded' : `${moneyWhole(l.raisedCents)} of ${moneyWhole(l.priceCents)} raised`}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1 border-t border-hairline-soft pt-4 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-ink-body">Total charged</dt>
            <dd className="font-medium tabular text-ink">{money(d.totalCents)}</dd>
          </div>
          {d.cardLast4 && (
            <div className="flex justify-between">
              <dt className="text-ink-body">Card</dt>
              <dd className="tabular text-ink">
                {brandLabel[d.cardBrand ?? ''] ?? 'Card'} ending {d.cardLast4}
              </dd>
            </div>
          )}
        </dl>
        <p className="t-caption">
          Receipt sent to {d.donorEmail}. <Link href={receiptUrl}>View receipt</Link>
        </p>
        {d.message && d.messageStatus === 'pending' && <p className="t-caption">Your message will appear after the team reviews it.</p>}
      </section>

      <section aria-labelledby="next-h" className="flex flex-col gap-3">
        <h2 id="next-h" className="t-subhead">
          What happens next
        </h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[16px] leading-6 text-ink-body">
          <li>The coach orders the gear.</li>
          <li>You&apos;ll get an email when it&apos;s purchased.</li>
          <li>{first ? `${first} may send you a thank-you note.` : 'The team may send you a thank-you note.'}</li>
        </ol>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <ShareButton
          url={shareUrl}
          title={first ? `${possessive(first)} gear` : d.team.name}
          text={first ? `Help ${first} get the gear they need.` : `Help ${d.team.name} get the gear they need.`}
          label={first ? `Share ${possessive(first)} page` : 'Share the team page'}
          surface="success"
        />
        {next && d.athlete && (
          <ButtonLink variant="secondary" href={`/give/${next.id}`}>
            Fund {possessive(first!)} {next.name.toLowerCase()} ({moneyWhole(next.left_cents)} left)
          </ButtonLink>
        )}
        <ButtonLink variant="tertiary" href={`/t/${d.team.slug}#players-h`}>
          See other players
        </ButtonLink>
      </div>

      {!user && <SaveHistory email={d.donorEmail} />}
    </div>
  );
}
