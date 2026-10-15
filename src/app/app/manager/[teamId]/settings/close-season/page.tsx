import { notFound } from 'next/navigation';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { athleteDisplayName } from '@/lib/domain/names';
import { money } from '@/lib/domain/money';
import { seasonSummaryEmail } from '@/lib/notify/templates';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { NeedStatusChip } from '@/components/ui/Chip';
import { ButtonLink } from '@/components/ui/Button';
import { CloseSeasonConfirm } from './CloseSeasonConfirm';

export const metadata = { title: 'Close season' };

/** Close season review (ui-ux-spec 8.12): what's unspent, what wasn't bought, and the donor email. */
export default async function CloseSeasonPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  if (!ctx.canEdit || !ctx.team.seasonId) notFound();
  const base = `/app/manager/${teamId}`;
  const data = await asUser(ctx.user.id, async (tx) => {
    const needs = await tx.query<any>(
      `select n.id, n.name, n.variant, n.status, n.raised_cents, n.price_cents, n.athlete_id, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name
       from needs n left join athletes a on a.id = n.athlete_id
       where n.team_id = $1 and n.season_id = $2 and n.kind <> 'team_fund' and n.status not in ('purchased', 'delivered', 'removed') and n.request_status = 'approved'
       order by n.raised_cents desc, n.name`,
      [teamId, ctx.team.seasonId],
    );
    const donors = await tx.one<{ donors: number; gifts: number; total: number }>(
      `select count(distinct lower(donor_email))::int as donors, count(*)::int as gifts, coalesce(sum(gift_cents), 0)::int as total
       from donations where team_id = $1 and season_id = $2 and status = 'succeeded'`,
      [teamId, ctx.team.seasonId],
    );
    const sample = await tx.one<{ gifts: number; total: number }>(
      `select count(*)::int as gifts, sum(gift_cents)::int as total from donations where team_id = $1 and season_id = $2 and status = 'succeeded'
       group by lower(donor_email) order by count(*) desc limit 1`,
      [teamId, ctx.team.seasonId],
    );
    return { needs, donors, sample };
  });
  const unspent = data.needs.filter((n: any) => n.raised_cents > 0);
  const unspentCents = unspent.reduce((s: number, n: any) => s + n.raised_cents, 0);
  const preview = seasonSummaryEmail({ team: ctx.team.name, season: ctx.team.seasonLabel, totalCents: data.sample?.total ?? 5000, gifts: data.sample?.gifts ?? 1 });
  const who = (n: any) => (n.athlete_id ? athleteDisplayName(n) : 'Team');

  return (
    <div className="flex max-w-[880px] flex-col gap-8">
      <PageHeader
        crumbs={<Breadcrumb items={[{ label: 'Settings', href: `${base}/settings` }, { label: 'Close season' }]} />}
        title={`Close ${ctx.team.seasonLabel || 'the season'}`}
        sub="Check what's left before you close. Closing can't be undone, but you can start the next season right after."
      />
      {ctx.team.status !== 'live' && <Banner tone="info">Only a live team can close its season.</Banner>}

      <Section title="Unspent earmarked money" id="unspent">
        {unspent.length ? (
          <>
            <p className="t-body">
              <span className="font-medium text-ink tabular">{money(unspentCents)}</span> was given for gear that hasn&apos;t been bought. When you close, it moves to the team fund for next season, and those donors are told in their summary email. If you are still buying some of it, <a href={`${base}/purchases`}>log the purchase</a> first.
            </p>
            <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
              {unspent.map((n: any) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span>
                    {n.name} <span className="text-ink-meta">· {who(n)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <NeedStatusChip status={n.status} />
                    <span className="tabular">{money(n.raised_cents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="t-body">None. Every dollar given for gear was spent.</p>
        )}
      </Section>

      <Section title="Needs not purchased" id="open">
        <p className="t-body">
          {data.needs.length} {data.needs.length === 1 ? 'item was' : 'items were'} not bought this season. They stay with this season and do not carry over. Next season starts fresh from your gear templates.
        </p>
      </Section>

      <Section title="Donor summary email" id="email">
        <p className="t-caption">
          Sent to {data.donors?.donors ?? 0} {data.donors?.donors === 1 ? 'donor' : 'donors'} ({data.donors?.gifts ?? 0} gifts, {money(data.donors?.total ?? 0)}). Each email has that donor&apos;s own totals. Preview:
        </p>
        <div className="flex flex-col gap-2 rounded-md border border-hairline-soft bg-chrome p-4">
          <p className="t-label">Subject: {preview.subject}</p>
          <p className="t-body whitespace-pre-line">{preview.body}</p>
        </div>
      </Section>

      {ctx.team.status === 'live' ? (
        <CloseSeasonConfirm teamId={teamId} teamName={ctx.team.name} />
      ) : (
        <ButtonLink href={`${base}/settings`} variant="secondary">
          Back to settings
        </ButtonLink>
      )}
    </div>
  );
}
