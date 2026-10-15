import Link from 'next/link';
import { ClipboardCheck, ExternalLink, Heart, Landmark, Mail, MessageSquare, Shirt, ShoppingCart, UserCheck, Wallet, type LucideIcon } from 'lucide-react';
import { loadTeamCtx, teamCounts } from '@/lib/app/team';
import { asUser, sys } from '@/lib/db';
import { env } from '@/lib/env';
import { Section } from '@/components/ui/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { TeamCrest } from '@/components/public/TeamCrest';
import { teamVars } from '@/config/team-colors';
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
      `select a.id, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, a.jersey, a.position, a.photo_path, at.goal_cents, at.raised_cents, at.items_total, at.items_funded
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
  const pct = percentFunded(itemsRaised, goal);
  const teamLink = code?.token ? `${env.appUrl}/s/${code.token}` : `${env.appUrl}/t/${team.slug}`;
  const crest = team.orgName;
  const todoIcon: Record<string, LucideIcon> = { p: UserCheck, g: Shirt, b: ShoppingCart, t: Heart, m: MessageSquare, i: Mail, s: Landmark };

  return (
    <div className="flex flex-col gap-6 md:gap-8" style={teamVars(team.color) as React.CSSProperties}>
      <header className="relative isolate overflow-hidden rounded-[20px] bg-[var(--team-night)] px-5 py-6 text-white md:px-8 md:py-8">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(90%_140%_at_100%_0%,var(--team)_0%,transparent_65%)]" />
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <TeamCrest name={crest} color={team.color} size={56} />
            <div className="min-w-0">
              <h1 className="text-[26px] leading-8 font-bold tracking-[-0.02em] text-white md:text-[32px] md:leading-10">{team.name}</h1>
              <p className="text-[15px] text-white/80">{[team.seasonLabel, `${team.city}, ${team.state}`].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          {team.status !== 'draft' && (
            <ButtonLink href={`/t/${team.slug}`} variant="inverse" target="_blank" className="self-start md:self-center">
              Team page <ExternalLink size={16} aria-hidden />
            </ButtonLink>
          )}
        </div>
      </header>

      {team.status === 'draft' && (
        <Banner rounded tone="info" action={ctx.isCoach ? <ButtonLink href={`/app/manager/new?team=${teamId}`} size="sm">Continue setup</ButtonLink> : undefined}>
          This team isn&apos;t public yet. Finish setup to publish it.
        </Banner>
      )}
      {team.status === 'season_closed' && <Banner rounded tone="info">The {team.seasonLabel || 'current'} season is closed. Start the next season in Settings.</Banner>}
      {team.status === 'suspended' && <Banner rounded tone="error">This team is suspended and hidden from donors. Contact support to resolve it.</Banner>}

      <section aria-labelledby="totals-h">
        <h2 id="totals-h" className="sr-only">
          Team totals
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card flex flex-col gap-2 p-5 sm:col-span-2">
            <dt className="t-label text-ink-meta">Raised</dt>
            <dd className="flex flex-col gap-3">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="t-score text-[44px] text-ink">{moneyWhole(raised)}</span>
                  <span className="rounded-full bg-[var(--team-soft)] px-2.5 py-0.5 text-[13px] font-semibold text-[var(--team)]">{pct}% funded</span>
                </span>
                <span className="t-caption tabular">Goal {moneyWhole(goal)}</span>
              </span>
              <Meter raised={itemsRaised} goal={goal || 1} showText={false} thick label={`Team gear ${pct}% funded`} />
              {fund > 0 && (
                <span className="t-caption">
                  Includes {money(fund)} in the team fund. <Link href={`${base}/purchases`}>Spend it on the buy list</Link>.
                </span>
              )}
            </dd>
          </div>
          <div className="card flex flex-col gap-2 p-5">
            <dt className="t-label flex items-center gap-2 text-ink-meta">
              <Wallet size={16} aria-hidden /> Available to spend
            </dt>
            <dd className="t-score text-[36px] text-ink">{moneyWhole(money_.available + fund)}</dd>
            <dd>
              <Link href={`${base}/purchases`} className="text-[14px] font-semibold no-underline hover:underline">
                Open buy list
              </Link>
            </dd>
          </div>
          <div className="card flex flex-col gap-2 p-5">
            <dt className="t-label flex items-center gap-2 text-ink-meta">
              <ShoppingCart size={16} aria-hidden /> Spent
            </dt>
            <dd className="t-score text-[36px] text-ink">{moneyWhole(money_.spent)}</dd>
            <dd className="t-caption">Paid out {moneyWhole(money_.paid_out)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {actions.length > 0 && (
            <Section title="To do" id="todo">
              <ul className="card divide-y divide-hairline-soft overflow-hidden">
                {actions.map((a) => {
                  const Icon = todoIcon[a.key] ?? ClipboardCheck;
                  return (
                    <li key={a.key} className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <span className="flex items-center gap-3 text-[15px] font-medium text-ink">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--team-soft)] text-[var(--team)]">
                          <Icon size={18} aria-hidden />
                        </span>
                        {a.text}
                      </span>
                      {a.button ?? (
                        <ButtonLink href={a.href} size="sm" variant="secondary">
                          {a.label}
                        </ButtonLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          <Section title="Athletes by need" id="need" actions={<Link href={`${base}/roster`} className="text-[15px] font-semibold">View roster</Link>}>
            {lowest.length === 0 ? (
              <EmptyState action={<ButtonLink href={`${base}/roster`} variant="secondary">Open roster</ButtonLink>}>No live athletes yet.</EmptyState>
            ) : (
              <ul className="card divide-y divide-hairline-soft overflow-hidden">
                {lowest.map((a) => {
                  const p = percentFunded(a.raised_cents, a.goal_cents);
                  return (
                    <li key={a.id}>
                      <Link href={`${base}/roster/${a.id}`} className="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-chrome hover:text-ink">
                        <AthleteFace id={a.id} photo={a.photo_path} jersey={a.jersey} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[15px] font-semibold">
                              {athleteDisplayName(a)} {a.jersey && <span className="font-normal text-ink-meta">#{a.jersey}</span>}
                            </span>
                            <span className="t-caption shrink-0 tabular">
                              {a.items_total - a.items_funded} open · {p}%
                            </span>
                          </span>
                          <Meter raised={a.raised_cents} goal={a.goal_cents} showText={false} compact className="mt-1.5" label={`${athleteDisplayName(a)} ${p}% funded`} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {code && (
            <Section title="Team code" id="code" actions={<Link href={`${base}/share`} className="text-[15px] font-semibold">Share kit</Link>}>
              <div className="flex flex-col gap-4 rounded-[16px] bg-[var(--team-night)] p-5 text-white">
                <div className="flex flex-col gap-1">
                  <p className="text-[14px] text-white/75">Families and supporters use this code to see the roster.</p>
                  <p className="t-score text-[44px] tracking-[0.18em] text-white" aria-label={`Team code ${code.code.split('').join(' ')}`}>
                    {code.code}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={code.code} label="Copy code" surface="manager_overview" />
                  <CopyButton value={teamLink} label="Copy team link" surface="manager_overview" />
                  <ButtonLink href={`${base}/share#qr`} variant="ghost-inverse">
                    QR code
                  </ButtonLink>
                  {ctx.canEdit && (
                    <ButtonLink href={`${base}/share#change-code`} variant="ghost-inverse">
                      Change code
                    </ButtonLink>
                  )}
                </div>
              </div>
            </Section>
          )}

          <Section title="Recent donations" id="recent" actions={<Link href={`${base}/donations`} className="text-[15px] font-semibold">View all</Link>}>
            {recent.length === 0 ? (
              <EmptyState>No donations yet. Share the team link to get started.</EmptyState>
            ) : (
              <ul className="card divide-y divide-hairline-soft overflow-hidden">
                {recent.map((d) => {
                  const who = d.show_name ? d.donor_name : 'Anonymous';
                  return (
                    <li key={d.id}>
                      <Link href={`${base}/donations/${d.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-chrome hover:text-ink">
                        <Avatar name={who} size={36} className="bg-[var(--team-soft)] text-[var(--team)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{who}</span>
                          <span className="t-caption block truncate">
                            {[d.first_name ? athleteDisplayName(d) : 'Team fund', d.items && d.items !== 'Team fund' ? d.items : null, relativeTime(d.succeeded_at)]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="tabular text-[15px] font-semibold text-funded">+{money(d.gift_cents)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function AthleteFace({ id, photo, jersey }: { id: string; photo: string | null; jersey: string | null }) {
  return photo ? (
    <span className="size-11 shrink-0 overflow-hidden rounded-full bg-[var(--team-night)]">
      <img src={`/media/athlete/${id}?draft=1&v=${encodeURIComponent(String(photo).slice(-12))}`} alt="" width={44} height={44} loading="lazy" className="size-full origin-[50%_22%] scale-[2.4] object-cover" />
    </span>
  ) : (
    <span aria-hidden className="t-score flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--team)] text-[18px] text-white">
      {jersey ?? ''}
    </span>
  );
}
