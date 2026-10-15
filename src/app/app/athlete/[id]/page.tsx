import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { loadAthleteCtx } from '@/lib/app/athlete';
import { athleteNeeds } from '@/lib/app/athlete-data';
import { getAthleteSupporters } from '@/lib/queries/public';
import { sys } from '@/lib/db';
import { env } from '@/lib/env';
import { Banner } from '@/components/ui/Banner';
import { Meter } from '@/components/ui/Meter';
import { ButtonLink } from '@/components/ui/Button';
import { CopyButton, ShareButton } from '@/components/ui/CopyButton';
import { Chip, NeedStatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { moneyWhole, money, percentFunded } from '@/lib/domain/money';
import { formatDate, relativeTime } from '@/lib/domain/text';
import { possessive } from '@/lib/domain/names';
import { Avatar } from '@/components/ui/Avatar';
import { GearArt } from '@/components/gear/GearArt';
import { teamVars } from '@/config/team-colors';

export const metadata = { title: 'My page' };

const STEP_LEFT = ['Add the basics', 'Add a photo', 'Check the gear list', 'Write a short bio and submit'];

/** Player app home (ui-ux-spec 7.4). */
export default async function PlayerHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAthleteCtx(id);
  const { athlete: a, team } = ctx;
  const self = ctx.role === 'athlete';
  const your = self ? 'your' : `${possessive(a.first)}`;
  const [needs, supporters, totals] = await Promise.all([
    athleteNeeds(ctx.user.id, id),
    getAthleteSupporters(id, 5),
    sys.one<any>(`select goal_cents, raised_cents, items_total, items_funded from athlete_totals where athlete_id = $1`, [id]),
  ]);
  const shareUrl = `${env.appUrl}/s/${a.shareToken}`;
  const showAmounts = !self || team.showAmountsToAthletes;
  const pendingChanges = a.status === 'live' && a.submittedAt && (!a.publishedAt || new Date(a.submittedAt) > new Date(a.publishedAt)) && team.requireProfileApproval;
  const visible = needs.filter((n) => n.status !== 'removed' && n.requestStatus === 'approved');

  let banner: React.ReactNode;
  switch (a.status) {
    case 'needs_consent':
      banner = (
        <Banner rounded tone="warn" action={!self ? <ButtonLink href={`/app/athlete/${id}/consent`} size="sm">Give consent</ButtonLink> : undefined}>
          {self ? 'Waiting for a parent or guardian to give consent. We emailed them.' : `Give consent so ${a.first} can set up a page.`}
        </Banner>
      );
      break;
    case 'draft':
      banner = (
        <Banner rounded tone="info" action={<ButtonLink href={`/app/athlete/${id}/setup`} size="sm">Continue</ButtonLink>}>
          Finish {your} profile. Next: {STEP_LEFT[Math.min(a.setupStep, 3)].toLowerCase()}.
        </Banner>
      );
      break;
    case 'awaiting_coach':
      banner = <Banner rounded tone="info">Waiting for {team.coach}. Submitted {a.submittedAt ? formatDate(a.submittedAt) : 'recently'}.</Banner>;
      break;
    case 'changes_requested':
      banner = (
        <Banner rounded tone="warn" action={<ButtonLink href={`/app/athlete/${id}/setup?step=0`} size="sm">Edit</ButtonLink>}>
          <span className="font-medium">{team.coach} asked for changes:</span> {a.reviewNote}
        </Banner>
      );
      break;
    case 'hidden':
      banner = (
        <Banner rounded tone="warn">
          {a.hiddenReason === 'manager' ? `${team.coach} hid this page.` : 'This page is hidden. Only you, your family and the team can see it.'}{' '}
          {!self && a.hiddenReason !== 'manager' && <Link href={`/app/athlete/${id}/profile`}>Show it again</Link>}
        </Banner>
      );
      break;
    case 'live':
      banner = (
        <Banner
          rounded
          tone="success"
          action={
            <div className="flex gap-2">
              <CopyButton value={shareUrl} label="Copy link" surface="player_home" />
              <ShareButton url={shareUrl} title={`${possessive(a.first)} gear`} text={`Help ${a.first} get the gear they need.`} surface="player_home" variant="secondary" />
            </div>
          }
        >
          {self ? 'Your page is live.' : `${possessive(a.first)} page is live.`}
          {pendingChanges ? ` Your latest changes are waiting for ${team.coach}.` : ''}
        </Banner>
      );
      break;
  }

  const pct = totals ? percentFunded(totals.raised_cents, totals.goal_cents) : 0;
  const photo = a.photoPath ? `/media/athlete/${id}?draft=1&v=${encodeURIComponent(a.photoPath.slice(-12))}` : null;

  return (
    <div className="flex flex-col gap-6 md:gap-8" style={teamVars(team.color) as React.CSSProperties}>
      <header className="relative isolate overflow-hidden rounded-[20px] bg-[var(--team-night)] text-white">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(90%_140%_at_100%_0%,var(--team)_0%,transparent_65%)]" />
        <div className="flex items-stretch gap-4 md:gap-6">
          <div className="relative w-28 shrink-0 self-stretch overflow-hidden md:w-40">
            {photo ? (
              <img src={photo} alt="" className="absolute inset-0 size-full origin-[50%_8%] scale-[1.3] object-cover object-[50%_8%]" />
            ) : (
              <span aria-hidden className="t-score absolute inset-0 flex items-center justify-center bg-[var(--team)] text-[56px] text-white/90">
                {a.jersey ?? ''}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 py-5 pr-5 md:flex-row md:items-center md:justify-between md:py-7 md:pr-7">
            <div className="min-w-0">
              <p className="truncate text-[14px] text-white/75">{team.name}</p>
              <h1 className="text-[26px] leading-8 font-bold tracking-[-0.02em] text-white md:text-[32px] md:leading-10">{self ? 'My page' : a.displayName}</h1>
              <p className="text-[15px] text-white/80">{[a.jersey && `#${a.jersey}`, a.position, self && a.displayName].filter(Boolean).join(' · ')}</p>
            </div>
            {(a.status === 'live' || a.status === 'hidden' || a.status === 'awaiting_coach') && (
              <ButtonLink href={`/t/${team.slug}/${a.slug}`} variant="inverse" target="_blank" className="self-start md:self-center">
                Preview {self ? 'my' : 'the'} page <ExternalLink size={16} aria-hidden />
              </ButtonLink>
            )}
          </div>
        </div>
      </header>
      {banner}

      {totals && (
        <section aria-label="Totals" className="card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="flex items-baseline gap-2">
              <span className="t-score text-[40px] text-ink">{moneyWhole(totals.raised_cents)}</span>
              <span className="text-[15px] text-ink-meta">of {moneyWhole(totals.goal_cents)}</span>
            </p>
            <p className="t-caption tabular">
              {totals.items_funded} of {totals.items_total} items funded · {pct}%
            </p>
          </div>
          <Meter raised={totals.raised_cents} goal={totals.goal_cents || 1} showText={false} thick label={`${your} gear funding`} />
        </section>
      )}

      <section aria-labelledby="status-h" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 id="status-h" className="t-subhead">
            Gear status
          </h2>
          <Link href={`/app/athlete/${id}/gear`} className="text-[15px] font-semibold">
            Edit gear
          </Link>
        </div>
        {visible.length === 0 ? (
          <EmptyState action={<ButtonLink href={`/app/athlete/${id}/gear`} variant="secondary">Open gear list</ButtonLink>}>No gear on the list yet.</EmptyState>
        ) : (
          <ul className="card divide-y divide-hairline-soft overflow-hidden">
            {visible.map((n) => (
              <li key={n.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <GearArt name={n.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-ink">{n.name}</span>
                    <span className="t-caption shrink-0 tabular">
                      {moneyWhole(n.raisedCents)} of {moneyWhole(n.priceCents)}
                    </span>
                  </span>
                  <Meter raised={n.raisedCents} goal={n.priceCents || 1} showText={false} compact className="mt-1.5" label={`${n.name} funding`} />
                </span>
                <span className="shrink-0">
                  {n.status === 'open' || n.status === 'partially_funded' ? (
                    <Chip tone="muted">Open</Chip>
                  ) : (
                    <NeedStatusChip status={n.status} date={n.deliveredAt ? formatDate(n.deliveredAt) : n.purchasedAt ? formatDate(n.purchasedAt) : formatDate(n.updatedAt)} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sup-h" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 id="sup-h" className="t-subhead">
            Recent supporters
          </h2>
          {supporters.total > 0 && (
            <Link href={`/app/athlete/${id}/supporters`} className="text-[15px]">
              See all {supporters.total}
            </Link>
          )}
        </div>
        {supporters.list.length === 0 ? (
          <EmptyState action={<ButtonLink href={`/app/athlete/${id}/share`} variant="secondary">Share {your} page</ButtonLink>}>
            No supporters yet. Sharing {your} link is the fastest way to get the first one.
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-hairline-soft overflow-hidden">
            {supporters.list.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <Avatar name={s.name} size={36} className="hidden bg-[var(--team-soft)] text-[var(--team)] sm:inline-flex" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-ink">
                    {s.name}
                    {showAmounts && <span className="font-normal text-ink-meta tabular"> · {money(s.amount_cents)}</span>}
                  </p>
                  {s.message && <p className="text-[15px] text-ink-body">{s.message}</p>}
                  <p className="t-caption">{relativeTime(s.created_at)}</p>
                </div>
                <ButtonLink href={`/app/athlete/${id}/supporters?thank=${s.id}`} variant="secondary" size="sm">
                  Say thanks
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
