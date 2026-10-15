import Link from 'next/link';
import { loadTeamCtx, teamCounts } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { athleteDisplayName } from '@/lib/domain/names';
import { needsHumanReview } from '@/lib/domain/text';
import { formatDate } from '@/lib/domain/text';
import { ProfileQueue, GearQueue, MessageQueue, ThanksQueue } from './Queues';

export const metadata = { title: 'Approvals' };

const TABS = ['profiles', 'gear', 'messages', 'thanks'] as const;
type Tab = (typeof TABS)[number];

/** Approvals queue (ui-ux-spec 8.6). */
export default async function Approvals({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams: Promise<{ tab?: string; athlete?: string }> }) {
  const { teamId } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'profiles';
  const ctx = await loadTeamCtx(teamId);
  const counts = await teamCounts(teamId);
  const base = `/app/manager/${teamId}/approvals`;
  const t = ctx.team;

  const data = await asUser(ctx.user.id, async (tx) => {
    if (tab === 'profiles') {
      const rows = await tx.query<any>(
        `select a.* from athletes a where a.team_id = $1 and a.archived_at is null and (a.status = 'awaiting_coach'
           or (a.status = 'live' and $2::boolean and a.submitted_at is not null and (a.published_at is null or a.submitted_at > a.published_at)))
         order by a.submitted_at nulls last`,
        [teamId, t.requireProfileApproval],
      );
      return rows.map((a) => ({
        id: a.id,
        name: `${a.preferred_name || a.first_name} ${a.last_name}`,
        jersey: a.jersey,
        position: a.position,
        live: a.status === 'live',
        consent: Boolean(a.consent_at),
        submitted: a.submitted_at ? formatDate(a.submitted_at) : null,
        next: {
          displayName: athleteDisplayName(a, a.preferred_name),
          bio: a.bio as string,
          photo: a.photo_path ? `/media/athlete/${a.id}?draft=1&v=${encodeURIComponent(String(a.photo_path).slice(-12))}` : null,
          photoKey: a.photo_path as string | null,
          alt: a.photo_alt as string | null,
        },
        current: a.published_at
          ? {
              displayName: athleteDisplayName(a, a.pub_preferred_name),
              bio: (a.pub_bio ?? '') as string,
              photo: a.pub_photo_path ? `/media/athlete/${a.id}?v=${encodeURIComponent(String(a.pub_photo_path).slice(-12))}` : null,
              photoKey: a.pub_photo_path as string | null,
              alt: a.photo_alt as string | null,
            }
          : null,
      }));
    }
    if (tab === 'gear') {
      const rows = await tx.query<any>(
        `select n.id, n.name, n.variant, n.price_cents, n.raised_cents, n.request_reason, n.created_at, c.price_min_cents, c.price_max_cents, c.sizes, c.safety_note,
           a.id as athlete_id, a.first_name, a.last_name, a.preferred_name, a.jersey
         from needs n join athletes a on a.id = n.athlete_id left join gear_catalog c on c.id = n.catalog_id
         where n.team_id = $1 and n.season_id = $2 and n.request_status = 'pending' and n.status <> 'removed' order by n.created_at`,
        [teamId, t.seasonId],
      );
      return rows.map((n) => ({
        athleteId: n.athlete_id,
        athlete: `${n.preferred_name || n.first_name} ${n.last_name}${n.jersey ? ` #${n.jersey}` : ''}`,
        requested: formatDate(n.created_at),
        need: {
          id: n.id,
          name: n.name,
          variant: n.variant,
          sizes: n.sizes ?? [],
          priceCents: n.price_cents ?? 0,
          raisedCents: n.raised_cents,
          status: 'open',
          requestStatus: 'pending',
          requestReason: n.request_reason,
          whyNote: null,
          priceNote: null,
          minCents: n.price_min_cents,
          maxCents: n.price_max_cents,
          safetyNote: n.safety_note,
          pinX: null,
          pinY: null,
          purchasedAt: null,
          deliveredAt: null,
        },
      }));
    }
    if (tab === 'messages') {
      const rows = await tx.query<any>(
        `select d.id, d.donor_name, d.show_name, d.message, d.gift_cents, d.succeeded_at, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name
         from donations d left join athletes a on a.id = d.athlete_id
         where d.team_id = $1 and d.status = 'succeeded' and d.message_status = 'pending' order by d.succeeded_at`,
        [teamId],
      );
      return rows.map((d) => ({
        id: d.id,
        donor: d.show_name ? d.donor_name : 'Anonymous',
        realName: d.donor_name,
        to: d.first_name ? athleteDisplayName(d) : 'the team',
        message: d.message as string,
        flagged: needsHumanReview(d.message ?? ''),
        date: formatDate(d.succeeded_at),
      }));
    }
    const rows = await tx.query<any>(
      `select ty.id, ty.body, ty.photo_path, ty.created_at, ty.need_id, ty.donation_id, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name,
         n.name as need_name, d.donor_name,
         (case when ty.donation_id is not null then 1 else (select count(distinct lower(d2.donor_email)) from allocations al join donations d2 on d2.id = al.donation_id
           where al.need_id = ty.need_id and al.reversed_at is null and d2.status = 'succeeded') end)::int as recipients
       from thank_yous ty join athletes a on a.id = ty.athlete_id left join needs n on n.id = ty.need_id left join donations d on d.id = ty.donation_id
       where ty.team_id = $1 and ty.status = 'pending' order by ty.created_at`,
      [teamId],
    );
    return rows.map((ty) => ({
      id: ty.id,
      from: athleteDisplayName(ty),
      body: ty.body as string,
      photo: ty.photo_path ? `/media/thanks/${ty.id}` : null,
      to: ty.donation_id ? (ty.donor_name as string) : `Everyone who gave toward ${ty.need_name ?? 'this item'}`,
      recipients: ty.recipients as number,
      flagged: needsHumanReview(ty.body ?? ''),
      date: formatDate(ty.created_at),
    }));
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approvals"
        sub={
          <>
            Profile approval is {t.requireProfileApproval ? 'on' : 'off'}, thank-you approval is {t.requireThankyouApproval ? 'on' : 'off'}, donor message approval is{' '}
            {t.requireMessageApproval ? 'on' : 'off'}. <Link href={`/app/manager/${teamId}/settings#privacy`}>Change</Link>
          </>
        }
      />
      <Tabs
        label="Approval types"
        active={tab}
        tabs={[
          { id: 'profiles', label: 'Profiles', href: base, count: counts.profiles },
          { id: 'gear', label: 'Gear requests', href: `${base}?tab=gear`, count: counts.gear },
          { id: 'messages', label: 'Messages', href: `${base}?tab=messages`, count: counts.messages },
          { id: 'thanks', label: 'Thank-yous', href: `${base}?tab=thanks`, count: counts.thanks },
        ]}
      />
      {tab === 'profiles' && <ProfileQueue teamId={teamId} items={data as any} canEdit={ctx.canEdit} initial={sp.athlete} teamName={t.name} />}
      {tab === 'gear' && <GearQueue teamId={teamId} items={data as any} canEdit={ctx.canEdit} />}
      {tab === 'messages' && <MessageQueue teamId={teamId} items={data as any} canEdit={ctx.canEdit} />}
      {tab === 'thanks' && <ThanksQueue teamId={teamId} items={data as any} canEdit={ctx.canEdit} />}
    </div>
  );
}
