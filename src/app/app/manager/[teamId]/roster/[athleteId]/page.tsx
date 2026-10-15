import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser, sys } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tabs } from '@/components/ui/Tabs';
import { Avatar } from '@/components/ui/Avatar';
import { AthleteStatusChip, Chip, INVITE_STATUS } from '@/components/ui/Chip';
import { Banner } from '@/components/ui/Banner';
import { Meter } from '@/components/ui/Meter';
import { EmptyState } from '@/components/ui/EmptyState';
import { athleteDisplayName, gradeLabel } from '@/lib/domain/names';
import { money, moneyWhole } from '@/lib/domain/money';
import { formatDate, formatDateTime } from '@/lib/domain/text';
import { AthleteActions } from './AthleteActions';
import { ManagerGear, type ManagerNeed } from './ManagerGear';
import { DetailsTab } from './DetailsTab';

export const metadata = { title: 'Athlete' };

const TABS = ['gear', 'donations', 'purchases', 'activity', 'details'] as const;
type Tab = (typeof TABS)[number];

const ACTIVITY: Record<string, string> = {
  athlete_added: 'Added to the roster',
  athlete_updated: 'Roster details edited',
  roster_imported: 'Imported',
  invite_sent: 'Invite sent',
  invite_opened: 'Invite opened',
  invite_accepted: 'Invite accepted',
  consent_given: 'Guardian gave consent',
  consent_withdrawn: 'Guardian withdrew consent',
  profile_submitted: 'Profile submitted for approval',
  profile_published: 'Profile published',
  profile_approved: 'Profile approved',
  changes_requested: 'Changes requested',
  hidden_by_manager: 'Page hidden by staff',
  shown_by_manager: 'Page shown again by staff',
  hidden_by_guardian: 'Page hidden by guardian',
  photo_removed: 'Photo removed by guardian',
  price_changed: 'Price changed',
  need_added: 'Gear item added',
  need_removed: 'Gear item removed',
  need_restored: 'Gear item restored',
  gear_request_approved: 'Gear request approved',
  gear_request_rejected: 'Gear request declined',
  thankyou_approved: 'Thank-you note approved',
  thankyou_rejected: 'Thank-you note not sent',
  thankyou_changes_requested: 'Thank-you note sent back for changes',
  guardian_messaged: 'Message sent to guardians',
  athlete_removed: 'Removed from the roster',
  funds_moved: 'Funds moved',
  partial_refund: 'Partial refund',
  invite_reminder: 'Invite reminder sent',
  delivery_marked: 'Gear delivered',
  purchase_logged: 'Gear purchased',
  refund_requested: 'Refund requested',
  profile_deleted: 'Profile deleted by guardian',
};

/** Athlete detail for staff (ui-ux-spec 8.5). */
export default async function AthleteDetail({ params, searchParams }: { params: Promise<{ teamId: string; athleteId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { teamId, athleteId } = await params;
  const tab: Tab = (TABS as readonly string[]).includes((await searchParams).tab ?? '') ? ((await searchParams).tab as Tab) : 'gear';
  const ctx = await loadTeamCtx(teamId);
  if (!/^[0-9a-f-]{36}$/.test(athleteId)) notFound();
  const base = `/app/manager/${teamId}`;

  const data = await asUser(ctx.user.id, async (tx) => {
    const a = await tx.one<any>(
      `select a.*, coalesce(at.goal_cents, 0) as goal_cents, coalesce(at.raised_cents, 0) as raised_cents, coalesce(at.items_total, 0) as items_total,
         coalesce(at.items_funded, 0) as items_funded,
         coalesce((select sum(n.raised_cents) from needs n where n.athlete_id = a.id and n.raised_cents > 0 and n.status not in ('delivered', 'removed')), 0)::int as held
       from athletes a left join athlete_totals at on at.athlete_id = a.id where a.id = $1 and a.team_id = $2`,
      [athleteId, teamId],
    );
    if (!a) return null;
    const needs = await tx.query<any>(
      `select n.*, c.price_min_cents, c.price_max_cents, c.sizes, c.safety_note, c.category
       from needs n left join gear_catalog c on c.id = n.catalog_id
       where n.athlete_id = $1 and n.season_id = $2 and n.request_status <> 'rejected'
       order by (n.request_status = 'pending') desc, n.sort, n.created_at`,
      [athleteId, ctx.team.seasonId],
    );
    const catalog = await tx.query<any>(
      `select id, name, category, sizes, default_price_cents, price_min_cents, price_max_cents from gear_catalog where sport = $1 and active and category <> 'Team equipment' order by sort, name`,
      [ctx.team.sport],
    );
    const extra: any = {};
    if (tab === 'donations') {
      extra.donations = await tx.query<any>(
        `select d.id, d.donor_name, d.show_name, d.status, d.gift_cents, d.net_cents, d.created_at, d.succeeded_at, d.message, d.message_status,
           (select string_agg(n.name || ' ' || to_char(al.amount_cents / 100.0, 'FM$999,990.00'), ', ') from allocations al join needs n on n.id = al.need_id
            where al.donation_id = d.id and n.athlete_id = $1 and al.reversed_at is null) as items
         from donations d where d.status <> 'pending' and (d.athlete_id = $1 or exists (
           select 1 from allocations al join needs n on n.id = al.need_id where al.donation_id = d.id and n.athlete_id = $1))
         order by coalesce(d.succeeded_at, d.created_at) desc limit 200`,
        [athleteId],
      );
    } else if (tab === 'purchases') {
      extra.purchases = await tx.query<any>(
        `select p.id, p.vendor, p.order_date, p.total_cents, p.receipt_path is not null as has_receipt,
           string_agg(n.name || coalesce(' (' || n.variant || ')', ''), ', ') as items, sum(pn.amount_cents)::int as for_athlete,
           bool_and(n.status = 'delivered') as delivered
         from purchases p join purchase_needs pn on pn.purchase_id = p.id join needs n on n.id = pn.need_id
         where n.athlete_id = $1 group by p.id order by p.order_date desc`,
        [athleteId],
      );
    }
    return { a, needs, catalog, extra };
  });
  if (!data) notFound();
  const { a, needs, catalog, extra } = data;
  // Guardians aren't team members, so their profile rows are outside the
  // coach's row level security. The athlete was just loaded through RLS, so
  // these lookups are scoped to someone this person may manage.
  if (tab === 'activity') {
    extra.activity = await sys.query<any>(
      `select l.action, l.detail, l.created_at, p.full_name, p.email from activity_log l left join profiles p on p.id = l.actor_id
       where l.athlete_id = $1 and l.team_id = $2 order by l.created_at desc limit 200`,
      [athleteId, teamId],
    );
  } else if (tab === 'details' && ctx.canEdit) {
    [extra.contacts, extra.consent, extra.access, extra.invites] = await Promise.all([
      sys.one<any>(`select * from athlete_contacts where athlete_id = $1`, [athleteId]),
      sys.one<any>(
        `select c.*, p.email as guardian_email from consents c join profiles p on p.id = c.guardian_user_id where c.athlete_id = $1 order by c.signed_at desc limit 1`,
        [athleteId],
      ),
      sys.query<any>(`select x.role, x.created_at, p.full_name, p.email from athlete_access x join profiles p on p.id = x.user_id where x.athlete_id = $1 order by x.role`, [athleteId]),
      sys.query<any>(`select email, role, send_count, last_sent_at, opened_at, used_at, expires_at from invites where athlete_id = $1 order by last_sent_at desc`, [athleteId]),
    ]);
  }
  const full = `${a.preferred_name || a.first_name} ${a.last_name}`;
  const photo = a.photo_path ? `/media/athlete/${a.id}?draft=1&v=${encodeURIComponent(String(a.photo_path).slice(-12))}` : null;
  const pending = a.status === 'live' && ctx.team.requireProfileApproval && a.submitted_at && (!a.published_at || new Date(a.submitted_at) > new Date(a.published_at));
  const invite = INVITE_STATUS[a.invite_status] ?? { label: a.invite_status, tone: 'muted' as const };
  const q = (t: Tab) => `${base}/roster/${athleteId}${t === 'gear' ? '' : `?tab=${t}`}`;

  const mNeeds: ManagerNeed[] = needs.map((n: any) => ({
    id: n.id,
    name: n.name,
    variant: n.variant,
    sizes: n.sizes ?? [],
    priceCents: n.price_cents ?? 0,
    raisedCents: n.raised_cents,
    status: n.status,
    requestStatus: n.request_status,
    requestReason: n.request_reason,
    whyNote: n.why_note,
    priceNote: n.price_note,
    minCents: n.price_min_cents,
    maxCents: n.price_max_cents,
    safetyNote: n.safety_note,
    pinX: n.pin_x,
    pinY: n.pin_y,
    purchasedAt: n.purchased_at ? formatDate(n.purchased_at) : null,
    deliveredAt: n.delivered_at ? formatDate(n.delivered_at) : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={<Breadcrumb items={[{ label: 'Roster', href: `${base}/roster` }, { label: full }]} />}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={full} src={photo} size={64} />
            <span className="flex flex-col">
              <span>{full}</span>
              <span className="t-caption text-[15px] font-normal">
                {[a.jersey ? `#${a.jersey}` : null, a.position, a.grade ? gradeLabel(a.grade) : null, `Public name: ${athleteDisplayName(a)}`].filter(Boolean).join(' · ')}
              </span>
            </span>
          </span>
        }
        actions={
          <AthleteActions
            teamId={teamId}
            athleteId={athleteId}
            canEdit={ctx.canEdit}
            previewHref={`/t/${ctx.team.slug}/${a.slug}`}
            status={a.status}
            hiddenReason={a.hidden_reason}
            inviteStatus={a.invite_status}
            heldCents={a.held}
            name={full}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {pending ? <Chip tone="warn" icon="clock">Changes pending</Chip> : <AthleteStatusChip status={a.status} />}
        <Chip tone={a.consent_at ? 'funded' : 'warn'} icon={a.consent_at ? 'check' : 'clock'}>
          {a.consent_at ? 'Consent given' : 'Consent pending'}
        </Chip>
        <Chip tone={invite.tone}>Invite: {invite.label}</Chip>
        {a.under_13 && <Chip tone="muted">Under 13</Chip>}
      </div>
      {a.status === 'hidden' && a.hidden_reason && a.hidden_reason !== 'manager' && (
        <Banner tone="warn" rounded>
          {a.hidden_reason === 'consent_withdrawn' ? 'The guardian withdrew consent, so this page is hidden.' : 'The family hid this page. Only they can show it again.'}
        </Banner>
      )}
      {(a.status === 'awaiting_coach' || pending) && (
        <Banner tone="info" rounded action={<Link href={`${base}/approvals?athlete=${athleteId}`}>Review</Link>}>
          {pending ? 'This athlete edited their page. The changes are waiting for approval.' : 'This profile is waiting for approval.'}
        </Banner>
      )}
      {a.status === 'changes_requested' && a.review_note && (
        <Banner tone="warn" rounded>
          You asked for changes: {a.review_note}
        </Banner>
      )}
      {a.goal_cents > 0 && (
        <div className="max-w-[560px]">
          <Meter raised={a.raised_cents} goal={a.goal_cents} />
          <p className="t-caption mt-1">
            {a.items_funded} of {a.items_total} items funded
            {a.held > 0 ? ` · ${moneyWhole(a.held)} held for gear not yet delivered` : ''}
          </p>
        </div>
      )}

      <Tabs
        label="Athlete sections"
        active={tab}
        tabs={[
          { id: 'gear', label: 'Gear', href: q('gear'), count: needs.filter((n: any) => n.request_status === 'pending').length },
          { id: 'donations', label: 'Donations', href: q('donations') },
          { id: 'purchases', label: 'Purchases', href: q('purchases') },
          { id: 'activity', label: 'Activity', href: q('activity') },
          ...(ctx.canEdit ? [{ id: 'details', label: 'Details and contacts', href: q('details') }] : []),
        ]}
      />

      {tab === 'gear' && (
        <ManagerGear
          teamId={teamId}
          athleteId={athleteId}
          needs={mNeeds}
          catalog={catalog}
          photoSrc={photo}
          canEdit={ctx.canEdit}
          first={a.preferred_name || a.first_name}
        />
      )}

      {tab === 'donations' &&
        (extra.donations.length === 0 ? (
          <EmptyState>No donations for {a.first_name} yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead className="t-caption">
                <tr className="border-b border-hairline">
                  <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Donor</th>
                  <th scope="col" className="py-2 pr-3 font-medium">For {a.first_name}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-2 text-right font-medium">Gift</th>
                </tr>
              </thead>
              <tbody>
                {extra.donations.map((d: any) => (
                  <tr key={d.id} className="border-b border-hairline-soft align-top">
                    <td className="py-3 pr-3 whitespace-nowrap">{formatDate(d.succeeded_at ?? d.created_at)}</td>
                    <td className="py-3 pr-3">
                      <Link href={`${base}/donations/${d.id}`}>{d.show_name ? d.donor_name : `Anonymous (${d.donor_name})`}</Link>
                      {d.message && (
                        <p className="t-caption mt-1">
                          &ldquo;{d.message}&rdquo; {d.message_status === 'pending' ? '(waiting for approval)' : d.message_status === 'rejected' ? '(not shown)' : ''}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-3">{d.items ?? 'Team fund'}</td>
                    <td className="py-3 pr-3">
                      <Chip tone={d.status === 'succeeded' ? 'funded' : d.status === 'failed' ? 'muted' : 'error'}>{d.status[0].toUpperCase() + d.status.slice(1)}</Chip>
                    </td>
                    <td className="py-3 text-right tabular">{money(d.gift_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === 'purchases' &&
        (extra.purchases.length === 0 ? (
          <EmptyState action={ctx.canEdit ? <Link href={`${base}/purchases`}>Open the buy list</Link> : undefined}>Nothing bought for {a.first_name} yet.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {extra.purchases.map((p: any) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="flex flex-col">
                  <span className="font-medium text-ink">{p.items}</span>
                  <span className="t-caption">
                    {p.vendor} · {formatDate(p.order_date)} · {money(p.for_athlete)} for {a.first_name} of {money(p.total_cents)} order
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {p.delivered ? <Chip tone="neutral" icon="check">Delivered</Chip> : <Chip tone="neutral" icon="package">Purchased</Chip>}
                  {p.has_receipt && (
                    <a href={`/media/receipt/${p.id}`} target="_blank" rel="noreferrer">
                      Receipt
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'activity' &&
        (extra.activity.length === 0 ? (
          <EmptyState>No activity yet.</EmptyState>
        ) : (
          <ol className="flex flex-col divide-y divide-hairline-soft border-y border-hairline-soft">
            {extra.activity.map((l: any, i: number) => (
              <li key={i} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-[15px] text-ink">
                  {ACTIVITY[l.action] ?? l.action.replace(/_/g, ' ')}
                  {l.detail?.note ? <span className="text-ink-meta">: {l.detail.note}</span> : null}
                  {l.action === 'price_changed' && l.detail?.cents ? <span className="text-ink-meta"> to {money(l.detail.cents)}</span> : null}
                </span>
                <span className="t-caption">
                  {l.full_name ?? l.email ?? 'System'} · {formatDateTime(l.created_at)}
                </span>
              </li>
            ))}
          </ol>
        ))}

      {tab === 'details' && ctx.canEdit && (
        <DetailsTab
          teamId={teamId}
          athleteId={athleteId}
          sport={ctx.team.sport}
          values={{
            firstName: a.first_name,
            lastName: a.last_name,
            jersey: a.jersey ?? '',
            position: a.position ?? '',
            grade: a.grade ? String(a.grade) : '',
            guardianEmail: extra.contacts?.guardian_email ?? '',
            guardian2Email: extra.contacts?.guardian2_email ?? '',
            guardianPhone: extra.contacts?.guardian_phone ?? '',
            athleteEmail: extra.contacts?.athlete_email ?? '',
          }}
          consent={
            extra.consent
              ? {
                  signedName: extra.consent.signed_name,
                  email: extra.consent.guardian_email,
                  signedAt: formatDateTime(extra.consent.signed_at),
                  withdrawnAt: extra.consent.withdrawn_at ? formatDateTime(extra.consent.withdrawn_at) : null,
                  showFullLastName: extra.consent.show_full_last_name,
                  athleteCanEdit: extra.consent.athlete_can_edit,
                  policyVersion: extra.consent.policy_version,
                }
              : null
          }
          access={extra.access.map((x: any) => ({ role: x.role, name: x.full_name, email: x.email, since: formatDate(x.created_at) }))}
          invites={extra.invites.map((i: any) => ({
            email: i.email,
            role: i.role,
            sent: i.send_count,
            last: formatDate(i.last_sent_at),
            state: i.used_at ? 'Accepted' : new Date(i.expires_at) < new Date() ? 'Expired' : i.opened_at ? 'Opened' : 'Sent',
          }))}
        />
      )}
    </div>
  );
}
