import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { stripeInfo } from '@/lib/app/team-stripe';
import { teamFund } from '@/lib/app/team-money';
import { money } from '@/lib/domain/money';
import { formatDate } from '@/lib/domain/text';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { ButtonLink, buttonClass } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: 'Payouts' };

const STATUS: Record<string, { label: string; tone: ChipTone; line: string }> = {
  connected: { label: 'Connected', tone: 'funded', line: 'Gifts settle into this account and pay out to the bank on file.' },
  pending: { label: 'Needs more info', tone: 'warn', line: 'Stripe needs a few more details before payouts can start.' },
  restricted: { label: 'Restricted', tone: 'error', line: 'Stripe paused this account. Giving is paused until it is fixed.' },
  not_connected: { label: 'Not connected', tone: 'muted', line: 'Connect a Stripe account to receive gifts. The bank account belongs to the school, booster club or coach.' },
};

type Props = { params: Promise<{ teamId: string }>; searchParams: Promise<{ stripe?: string }> };

/** Payouts (ui-ux-spec 8.10). Coach only: staff can't see or change payout details. */
export default async function PayoutsPage({ params, searchParams }: Props) {
  const { teamId } = await params;
  const sp = await searchParams;
  const ctx = await loadTeamCtx(teamId);
  if (!ctx.isCoach) notFound();
  const info = await stripeInfo({ id: teamId, stripeAccountId: ctx.team.stripeAccountId, payoutsStatus: ctx.team.payoutsStatus });

  const data = await asUser(ctx.user.id, async (tx) => {
    const money_ = await tx.one<any>(
      `select
         coalesce(sum(net_cents) filter (where status in ('succeeded', 'disputed')), 0)::int as net,
         coalesce(sum(net_cents) filter (where status in ('succeeded', 'disputed') and succeeded_at > now() - interval '2 days'), 0)::int as recent,
         coalesce(sum(net_cents) filter (where status in ('succeeded', 'disputed') and succeeded_at <= now() - interval '30 days'), 0)::int as net_old
       from donations where team_id = $1`,
      [teamId],
    );
    const payouts = await tx.query<any>(`select id, stripe_payout_id, amount_cents, status, arrival_date, created_at from payouts where team_id = $1 order by created_at desc limit 100`, [teamId]);
    const paid = await tx.one<any>(
      `select coalesce(sum(amount_cents) filter (where status = 'paid'), 0)::int as paid,
         coalesce(sum(amount_cents) filter (where status in ('paid', 'in_transit', 'pending')), 0)::int as out,
         coalesce(sum(amount_cents) filter (where status = 'paid' and coalesce(arrival_date, created_at::date) <= current_date - 30), 0)::int as paid_old
       from payouts where team_id = $1`,
      [teamId],
    );
    const purchases = await tx.one<{ total: number }>(`select coalesce(sum(total_cents), 0)::int as total from purchases where team_id = $1`, [teamId]);
    const earmarked = ctx.team.seasonId
      ? await tx.one<{ c: number }>(
          `select coalesce(sum(raised_cents), 0)::int as c from needs where team_id = $1 and season_id = $2 and kind <> 'team_fund' and status not in ('purchased', 'delivered', 'removed')`,
          [teamId, ctx.team.seasonId],
        )
      : { c: 0 };
    const fund = await teamFund(tx, teamId, ctx.team.seasonId);
    return { m: money_, payouts, paid, purchases: purchases?.total ?? 0, earmarked: earmarked?.c ?? 0, fund };
  });

  const simulated = info.mode === 'simulated';
  const available = simulated ? Math.max(data.m.net - data.m.recent - data.paid.out, 0) : info.availableCents;
  const pendingBal = simulated ? data.m.recent : info.pendingCents;
  // Money that reached the team more than 30 days ago, against receipts logged.
  const receivedOld = data.payouts.length ? data.paid.paid_old : data.m.net_old;
  const gap = receivedOld - data.purchases;
  const st = STATUS[info.status] ?? STATUS.not_connected;
  const connected = info.status === 'connected';

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Payouts" sub="Where gift money goes, and what is still owed to players as gear." />

      {sp.stripe === 'return' && connected && <Banner tone="success">Stripe account connected. Payouts can start.</Banner>}
      {sp.stripe === 'return' && !connected && <Banner tone="warn">Stripe still needs some details. Continue onboarding to finish.</Banner>}
      {sp.stripe === 'error' && <Banner tone="error">We couldn&apos;t open Stripe. Try again in a minute.</Banner>}
      {sp.stripe === 'simulated' && <Banner tone="success">Demo account connected.</Banner>}
      {info.error && <Banner tone="warn">{info.error}</Banner>}
      {gap > 0 && (
        <Banner tone="warn" action={<ButtonLink href={`/app/manager/${teamId}/purchases`} variant="secondary" size="sm">Log a purchase</ButtonLink>}>
          You&apos;ve received {money(gap)} more than you&apos;ve logged in purchases. Log receipts so donors see their gear was bought.
        </Banner>
      )}

      <Section title="Stripe account" id="account">
        <div className="flex flex-col gap-4 rounded-md border border-hairline-soft p-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={st.tone}>{st.label}</Chip>
              {simulated && info.accountId && <Chip tone="info">Demo account</Chip>}
            </div>
            <p className="t-body">{st.line}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
              {info.accountId && (
                <>
                  <dt className="t-caption">Account</dt>
                  <dd className="break-all font-mono text-[14px]">{info.accountId}</dd>
                </>
              )}
              {!simulated && info.accountId && (
                <>
                  <dt className="t-caption">Bank</dt>
                  <dd>{info.bankLast4 ? `${info.bankName ?? 'Bank'} ending ${info.bankLast4}` : 'Not added yet'}</dd>
                  <dt className="t-caption">Schedule</dt>
                  <dd>{info.schedule ?? 'Set by Stripe'}</dd>
                </>
              )}
              {simulated && info.accountId && (
                <>
                  <dt className="t-caption">Bank</dt>
                  <dd>None. Demo mode doesn&apos;t move real money.</dd>
                </>
              )}
            </dl>
            {info.requirements.length > 0 && (
              <div>
                <p className="t-label">Stripe needs</p>
                <ul className="t-list list-disc pl-5">
                  {info.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {!connected && (
              <form method="post" action={`/api/teams/${teamId}/stripe/connect`}>
                <button type="submit" className={buttonClass('primary', { fullMobile: true })}>
                  {info.accountId ? 'Continue with Stripe' : 'Connect with Stripe'}
                </button>
              </form>
            )}
            {connected && !simulated && (
              <form method="post" action={`/api/teams/${teamId}/stripe/manage`}>
                <button type="submit" className={buttonClass('secondary', { fullMobile: true })}>
                  Manage in Stripe <ExternalLink size={16} aria-hidden />
                </button>
              </form>
            )}
          </div>
        </div>
      </Section>

      <Section title="Balances" id="balances">
        {simulated && <p className="t-caption">Demo mode: balances are worked out from recorded gifts and payouts, not read from Stripe.</p>}
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-hairline-soft bg-hairline-soft sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Available in Stripe', available, 'Ready to pay out to the bank.'],
            ['Pending', pendingBal, 'Recent gifts Stripe is still settling.'],
            ['Paid out to date', data.paid.paid, 'Sent to the bank.'],
            ['Earmarked', data.earmarked, 'Funded gear not yet bought, this season.'],
            ['Unrestricted', data.fund?.availableCents ?? 0, 'Team fund, spend where needed.'],
            ['Logged in purchases', data.purchases, 'Receipts on file, all seasons.'],
          ].map(([k, v, hint]) => (
            <div key={k as string} className="flex flex-col gap-1 bg-canvas p-4">
              <dt className="t-caption">{k}</dt>
              <dd className="t-figure tabular">{v === null ? 'Unavailable' : money(v as number)}</dd>
              <dd className="t-caption">{hint}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Payouts" id="payouts">
        {data.payouts.length === 0 ? (
          <EmptyState action={<ButtonLink href={`/app/manager/${teamId}/donations`} variant="secondary">See donations</ButtonLink>}>
            No payouts yet. Stripe sends them on the account&apos;s schedule once gifts settle.
          </EmptyState>
        ) : (
          <>
            <table className="hidden w-full border-collapse text-left md:table">
              <caption className="sr-only">Payouts, newest first</caption>
              <thead>
                <tr className="bg-chrome">
                  <th scope="col" className="t-label h-12 px-3 font-medium">Date</th>
                  <th scope="col" className="t-label h-12 px-3 text-right font-medium">Amount</th>
                  <th scope="col" className="t-label h-12 px-3 font-medium">Status</th>
                  <th scope="col" className="t-label h-12 px-3 font-medium">Arrival</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p: any) => (
                  <tr key={p.id} className="h-12 border-b border-hairline-soft">
                    <td className="t-list px-3">{formatDate(p.created_at)}</td>
                    <td className="t-list px-3 text-right tabular">{money(p.amount_cents)}</td>
                    <td className="px-3">
                      <Chip tone={p.status === 'paid' ? 'funded' : p.status === 'failed' ? 'error' : 'info'}>{p.status.replace(/_/g, ' ')}</Chip>
                    </td>
                    <td className="t-list px-3">{p.arrival_date ? formatDate(p.arrival_date) : 'Not set'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="flex flex-col divide-y divide-hairline-soft border-y border-hairline-soft md:hidden">
              {data.payouts.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium tabular text-ink">{money(p.amount_cents)}</p>
                    <p className="t-caption">
                      {formatDate(p.created_at)} · arrives {p.arrival_date ? formatDate(p.arrival_date) : 'when Stripe sets it'}
                    </p>
                  </div>
                  <Chip tone={p.status === 'paid' ? 'funded' : p.status === 'failed' ? 'error' : 'info'}>{p.status.replace(/_/g, ' ')}</Chip>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}
