import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { loadTeamCtx, teamCounts } from '@/lib/app/team';
import { asUser, sys } from '@/lib/db';
import { env } from '@/lib/env';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { ButtonLink } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Meter } from '@/components/ui/Meter';
import { EmptyState } from '@/components/ui/EmptyState';
import { InviteRemindersButton } from './InviteRemindersButton';
import { moneyWhole, money, percentFunded } from '@/lib/domain/money';
import { athleteDisplayName } from '@/lib/domain/names';
import { pluralize, relativeTime } from '@/lib/domain/text';

export const metadata = { title: 'Overview' };

/** Manager home (ui-ux-spec 8.2): what needs doing today, then where the money stands. */
export default async function Overview({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  const { team } = ctx;
  const base = `/app/manager/${teamId}`;
  const [counts, totals, money_, lowest, recent, code] = await Promise.all([
    teamCounts(teamId),
    sys.one<any>(`select * from team_totals where team_id = $1`, [teamId]),
    sys.one<any>(
      `select
         coalesce((select sum(n.raised_cents) from needs n where n.team_id = $1 and n.status = 'funded' and n.kind <> 'team_fund'), 0)::int as available,
         coalesce((select sum(p.total_cents) from purchases p where p.team_id = $1 and p.season_id = $2), 0)::int as spent,
         coalesce((select sum(po.amount_cents) from payouts po where po.team_id = $1 and po.status = 'paid'), 0)::int as paid_out`,
      [teamId, team.seasonId],
    ),
    sys.query<any>(
      `select a.id, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, a.jersey, at.goal_cents, at.raised_cents, at.items_total, at.items_funded
       from athletes a join athlete_totals at on at.athlete_id = a.id
       where a.team_id = $1 and a.status = 'live' and a.archived_at is null and at.goal_cents > 0
       order by (at.raised_cents::float / at.goal_cents), a.first_name limit 10`,
      [teamId],
    ),
    sys.query<any>(
      `select d.id, d.donor_name, d.show_name, d.gift_cents, d.succeeded_at, d.target,
         a.first_name, a.last_name, a.preferred_name, a.show_full_last_name,
         (select string_agg(distinct n.name, ', ') from allocations al join needs n on n.id = al.need_id where al.donation_id = d.id and al.reversed_at is null) as items
       from donations d left join athletes a on a.id = d.athlete_id
       where d.team_id = $1 and d.status = 'succeeded' order by d.succeeded_at desc limit 10`,
      [teamId],
    ),
    ctx.canEdit
      ? asUser(ctx.user.id, (tx) =>
          tx.one<{ code: string; token: string | null }>(
            `select s.code, (select l.token from share_links l where l.team_id = s.team_id and l.athlete_id is null and l.active order by l.created_at desc limit 1) as token
             from team_secrets s where s.team_id = $1`,
            [teamId],
          ),
        )
      : Promise.resolve(null),
  ]);

  const actions: { key: string; text: string; href: string; label: string; button?: React.ReactNode }[] = [];
  if (counts.profiles) actions.push({ key: 'p', text: `${pluralize(counts.profiles, 'profile')} waiting for approval`, href: `${base}/approvals`, label: 'Review' });
  if (counts.gear) actions.push({ key: 'g', text: `${pluralize(counts.gear, 'gear request')} to review`, href: `${base}/approvals?tab=gear`, label: 'Review' });
  if (counts.to_buy) actions.push({ key: 'b', text: `${pluralize(counts.to_buy, 'item')} fully funded and ready to buy`, href: `${base}/purchases`, label: 'Open buy list' });
  if (counts.thanks) actions.push({ key: 't', text: `${pluralize(counts.thanks, 'thank-you note')} to approve`, href: `${base}/approvals?tab=thanks`, label: 'Review' });
  if (counts.messages) actions.push({ key: 'm', text: `${pluralize(counts.messages, 'donor message')} to approve`, href: `${base}/approvals?tab=messages`, label: 'Review' });
  if (counts.not_joined && ctx.canEdit)
    actions.push({
      key: 'i',
      text: `${counts.not_joined} ${counts.not_joined === 1 ? "athlete hasn't" : "athletes haven't"} accepted invites`,
      href: `${base}/roster?invite=pending`,
      label: 'Send reminders',
      button: <InviteRemindersButton teamId={teamId} />,
    });
  if (team.payoutsStatus === 'restricted' && ctx.isCoach) actions.push({ key: 's', text: 'Payout account needs attention', href: `${base}/payouts`, label: 'Fix in Stripe' });

  const goal = totals?.goal_cents ?? 0;
  const raised = totals?.raised_cents ?? 0;
  const fund = totals?.team_fund_cents ?? 0;
  const itemsRaised = raised - fund;
  const figures = [
    { label: 'Raised', value: moneyWhole(raised) },
    { label: 'Goal', value: moneyWhole(goal) },
    { label: 'Funded', value: `${percentFunded(itemsRaised, goal)}%` },
    { label: 'Available to spend', value: moneyWhole(money_.available + fund) },
    { label: 'Spent', value: moneyWhole(money_.spent) },
    { label: 'Paid out', value: moneyWhole(money_.paid_out) },
  ];
  const teamLink = code?.token ? `${env.appUrl}/s/${code.token}` : `${env.appUrl}/t/${team.slug}`;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title={team.name}
        sub={[team.seasonLabel, `${team.city}, ${team.state}`].filter(Boolean).join(' · ')}
        actions={
          team.status !== 'draft' ? (
            <ButtonLink href={`/t/${team.slug}`} variant="secondary" target="_blank">
              Team page <ExternalLink size={16} aria-hidden />
            </ButtonLink>
          ) : undefined
        }
      />

      {team.status === 'draft' && (
        <Banner tone="info" action={ctx.isCoach ? <ButtonLink href={`/app/manager/new?team=${teamId}`} size="sm">Continue setup</ButtonLink> : undefined}>
          This team isn&apos;t public yet. Finish setup to publish it.
        </Banner>
      )}
      {team.status === 'season_closed' && <Banner tone="info">The {team.seasonLabel || 'current'} season is closed. Start the next season in Settings.</Banner>}
      {team.status === 'suspended' && <Banner tone="error">This team is suspended and hidden from donors. Contact support to resolve it.</Banner>}

      {actions.length > 0 && (
        <Section title="To do" id="todo">
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {actions.map((a) => (
              <li key={a.key} className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px] text-ink">{a.text}</span>
                {a.button ?? (
                  <ButtonLink href={a.href} size="sm" variant="secondary">
                    {a.label}
                  </ButtonLink>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <section aria-labelledby="totals-h" className="flex flex-col gap-4">
        <h2 id="totals-h" className="t-subhead">
          Team totals
        </h2>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-5 border-y border-hairline-soft py-5 lg:grid-cols-6">
          {figures.map((f) => (
            <div key={f.label} className="flex flex-col gap-1">
              <dt className="t-caption">{f.label}</dt>
              <dd className="t-figure tabular">{f.value}</dd>
            </div>
          ))}
        </dl>
        <Meter raised={itemsRaised} goal={goal || 1} showText={false} label={`Team gear ${percentFunded(itemsRaised, goal)}% funded`} />
        {fund > 0 && (
          <p className="t-caption">
            Raised includes {money(fund)} in the team fund. <Link href={`${base}/purchases`}>Spend it on the buy list</Link>.
          </p>
        )}
      </section>

      <div className="grid gap-10 xl:grid-cols-2">
        <Section title="Athletes by need" id="need" actions={<Link href={`${base}/roster`} className="text-[15px]">View roster</Link>}>
          {lowest.length === 0 ? (
            <EmptyState action={<ButtonLink href={`${base}/roster`} variant="secondary">Open roster</ButtonLink>}>No live athletes yet.</EmptyState>
          ) : (
            <table className="w-full text-left text-[15px]">
              <thead className="t-caption">
                <tr className="border-b border-hairline-soft">
                  <th scope="col" className="py-2 pr-3 font-medium">Athlete</th>
                  <th scope="col" className="w-[40%] py-2 pr-3 font-medium">Funded</th>
                  <th scope="col" className="py-2 text-right font-medium">Open items</th>
                </tr>
              </thead>
              <tbody>
                {lowest.map((a) => (
                  <tr key={a.id} className="border-b border-hairline-soft">
                    <td className="py-3 pr-3">
                      <Link href={`${base}/roster/${a.id}`} className="font-medium">
                        {athleteDisplayName(a)}
                      </Link>
                      {a.jersey && <span className="t-caption"> #{a.jersey}</span>}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <Meter raised={a.raised_cents} goal={a.goal_cents} showText={false} className="flex-1" label={`${athleteDisplayName(a)} ${percentFunded(a.raised_cents, a.goal_cents)}% funded`} />
                        <span className="t-caption tabular w-10 text-right">{percentFunded(a.raised_cents, a.goal_cents)}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right tabular">{a.items_total - a.items_funded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Recent donations" id="recent" actions={<Link href={`${base}/donations`} className="text-[15px]">View all</Link>}>
          {recent.length === 0 ? (
            <EmptyState>No donations yet. Share the team link to get started.</EmptyState>
          ) : (
            <ul className="divide-y divide-hairline-soft border-y border-hairline-soft">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link href={`${base}/donations/${d.id}`} className="flex min-h-14 items-center gap-3 py-3 text-ink no-underline hover:bg-band">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{d.show_name ? d.donor_name : 'Anonymous'}</span>
                      <span className="t-caption block truncate">
                        {[d.first_name ? athleteDisplayName(d) : 'Team fund', d.items && d.items !== 'Team fund' ? d.items : null, relativeTime(d.succeeded_at)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="tabular text-[15px] font-medium">{money(d.gift_cents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {code && (
        <Section title="Team code" id="code" actions={<Link href={`${base}/share`} className="text-[15px]">Share kit</Link>}>
          <div className="flex flex-col gap-4 rounded-md border border-hairline-soft p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <p className="t-caption">Families and supporters use this code to see the roster.</p>
              <p className="font-mono text-[32px] leading-10 font-medium tracking-[0.2em] text-ink tabular" aria-label={`Team code ${code.code.split('').join(' ')}`}>
                {code.code}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={code.code} label="Copy code" surface="manager_overview" />
              <CopyButton value={teamLink} label="Copy team link" surface="manager_overview" />
              <ButtonLink href={`${base}/share#qr`} variant="secondary">
                QR code
              </ButtonLink>
              {ctx.canEdit && (
                <ButtonLink href={`${base}/share#change-code`} variant="tertiary">
                  Change code
                </ButtonLink>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
