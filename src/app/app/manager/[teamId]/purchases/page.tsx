import { Download } from 'lucide-react';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { groupBuyList, type BuyNeed } from '@/lib/domain/buylist';
import { teamFund } from '@/lib/app/team-money';
import { athleteDisplayName } from '@/lib/domain/names';
import { money } from '@/lib/domain/money';
import { formatDate } from '@/lib/domain/text';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { buttonClass, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { NeedStatusChip } from '@/components/ui/Chip';
import { Banner } from '@/components/ui/Banner';
import { BuyList, type NeedExtra } from './BuyList';
import { DeliverList, type DeliverNeed } from './DeliverList';
import { MoveFunds, type MoveTarget } from './MoveFunds';

export const metadata = { title: 'Purchases' };

type Props = { params: Promise<{ teamId: string }>; searchParams: Promise<{ tab?: string; need?: string }> };

/** Buy list, deliveries and the purchases log (ui-ux-spec 8.9). */
export default async function PurchasesPage({ params, searchParams }: Props) {
  const { teamId } = await params;
  const sp = await searchParams;
  const ctx = await loadTeamCtx(teamId);
  const tab = sp.tab === 'log' || sp.tab === 'deliver' ? sp.tab : 'buy';
  const seasonId = ctx.team.seasonId;
  const base = `/app/manager/${teamId}/purchases`;
  const focusId = sp.need && /^[0-9a-f-]{36}$/.test(sp.need) ? sp.need : null;

  const data = await asUser(ctx.user.id, async (tx) => {
    const needs = seasonId
      ? await tx.query<any>(
          `select n.id, n.name, n.variant, n.kind, n.status, n.price_cents, n.raised_cents, n.athlete_id, n.purchased_at, n.delivered_at,
             n.delivery_photo_path, n.purchase_id, n.removed_at, p.vendor,
             a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, a.jersey, a.consent_at, a.archived_at, a.status as athlete_status
           from needs n left join athletes a on a.id = n.athlete_id left join purchases p on p.id = n.purchase_id
           where n.team_id = $1 and n.season_id = $2 and n.request_status = 'approved'
           order by n.name, a.first_name`,
          [teamId, seasonId],
        )
      : [];
    const fund = await teamFund(tx, teamId, seasonId);
    const purchases = await tx.query<any>(
      `select p.id, p.vendor, p.order_date, p.total_cents, p.note, p.created_at, pr.full_name, pr.email,
         coalesce(json_agg(json_build_object('name', n.name, 'variant', n.variant, 'kind', n.kind, 'status', n.status, 'amount', pn.amount_cents,
           'first_name', a.first_name, 'last_name', a.last_name, 'preferred_name', a.preferred_name, 'show_full_last_name', a.show_full_last_name)
           order by n.name) filter (where n.id is not null), '[]') as needs
       from purchases p left join purchase_needs pn on pn.purchase_id = p.id left join needs n on n.id = pn.need_id
       left join athletes a on a.id = n.athlete_id left join profiles pr on pr.id = p.created_by
       where p.team_id = $1 group by p.id, pr.full_name, pr.email order by p.order_date desc, p.created_at desc limit 200`,
      [teamId],
    );
    return { needs, fund, purchases };
  });

  const label = (n: any) => (n.athlete_id ? `${athleteDisplayName(n)}${n.jersey ? ` #${n.jersey}` : ''}` : 'Team');
  const items = data.needs.filter((n: any) => n.kind !== 'team_fund');
  const funded = items.filter((n: any) => n.status === 'funded');
  const buyNeeds: BuyNeed[] = funded.map((n: any) => ({ id: n.id, name: n.name, variant: n.variant, raised_cents: n.raised_cents, price_cents: n.price_cents, athlete_name: label(n) }));
  const groups = groupBuyList(buyNeeds);
  const extras: Record<string, NeedExtra> = Object.fromEntries(funded.map((n: any) => [n.id, { athleteId: n.athlete_id, hidden: Boolean(n.archived_at) || n.athlete_status === 'hidden' }]));
  const toDeliver: DeliverNeed[] = items
    .filter((n: any) => n.status === 'purchased')
    .map((n: any) => ({ id: n.id, name: n.name, variant: n.variant, who: label(n), vendor: n.vendor, purchasedAt: n.purchased_at ? formatDate(n.purchased_at) : '', consent: !n.athlete_id || Boolean(n.consent_at) }));
  const delivered = items.filter((n: any) => n.status === 'delivered');

  // Money that should move: removed items, items over their price, players who left.
  const toMove = items.filter(
    (n: any) => n.raised_cents > 0 && !['purchased', 'delivered'].includes(n.status) && (n.status === 'removed' || n.raised_cents > (n.price_cents ?? 0) || n.archived_at),
  );
  const topUpTargets: MoveTarget[] = items
    .filter((n: any) => ['open', 'partially_funded'].includes(n.status) && n.price_cents > n.raised_cents && !n.archived_at)
    .map((n: any) => ({ id: n.id, label: `${n.name} · ${label(n)}`, maxCents: n.price_cents - n.raised_cents }));
  const fundTarget: MoveTarget | null = data.fund ? { id: data.fund.id, label: 'Team fund', maxCents: Number.MAX_SAFE_INTEGER } : null;
  const focus = focusId ? data.needs.find((n: any) => n.id === focusId) : null;

  const tabs = [
    { id: 'buy', label: 'Buy list', href: base, count: funded.length },
    { id: 'deliver', label: 'To hand out', href: `${base}?tab=deliver`, count: toDeliver.length },
    { id: 'log', label: 'Purchases log', href: `${base}?tab=log`, count: data.purchases.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Purchases"
        sub={`Buy the funded gear, log the receipt, and hand it out. Donors get an email at each step.`}
        actions={
          tab === 'buy' && funded.length > 0 ? (
            <a href={`/api/teams/${teamId}/buylist.csv`} className={buttonClass('secondary')} download>
              <Download size={18} aria-hidden /> Export list
            </a>
          ) : undefined
        }
      />

      {focus && (
        <section aria-labelledby="focus-h" className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="focus-h" className="t-subhead">
                {focus.kind === 'team_fund' ? 'Team fund' : focus.name}
              </h2>
              <p className="t-caption">
                {label(focus)}
                {focus.variant ? ` · ${focus.variant}` : ''} · {money(focus.raised_cents)} raised{focus.price_cents ? ` of ${money(focus.price_cents)}` : ''}
              </p>
            </div>
            {focus.kind !== 'team_fund' && <NeedStatusChip status={focus.status} date={focus.purchased_at ? formatDate(focus.delivered_at ?? focus.purchased_at) : null} />}
          </div>
          {ctx.canEdit && focus.kind !== 'team_fund' && focus.raised_cents > 0 && !['purchased', 'delivered'].includes(focus.status) && fundTarget && (
            <MoveFunds teamId={teamId} from={{ id: focus.id, label: `${focus.name} · ${label(focus)}`, availableCents: focus.raised_cents }} targets={[fundTarget]} />
          )}
        </section>
      )}

      <Tabs tabs={tabs} active={tab} label="Purchases" />

      {!ctx.canEdit && <Banner tone="info">You have view access. Coaches and staff record purchases and deliveries.</Banner>}

      {tab === 'buy' && (
        <>
          {groups.length === 0 && !(data.fund && data.fund.availableCents > 0) ? (
            <EmptyState action={<ButtonLink href={`/app/manager/${teamId}/donations`} variant="secondary">See donations</ButtonLink>}>
              Nothing to buy yet. Items show up here when they are fully funded.
            </EmptyState>
          ) : (
            <BuyList teamId={teamId} groups={groups} extras={extras} fund={data.fund} canEdit={ctx.canEdit} fundTarget={fundTarget} />
          )}

          {ctx.canEdit && toMove.length > 0 && fundTarget && (
            <Section title="Money to move" id="move">
              <p className="t-caption">These items hold money but won&apos;t be bought: they were removed, raised more than their price, or the player left. Move the money to the team fund. Donors get an email.</p>
              <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
                {toMove.map((n: any) => (
                  <li key={n.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-ink">
                        {n.name} · {label(n)}
                      </p>
                      <p className="t-caption">
                        {money(n.raised_cents)} raised
                        {n.status === 'removed' ? ', item removed' : n.archived_at ? ', player left the team' : `, price ${money(n.price_cents)}`}
                      </p>
                    </div>
                    <MoveFunds
                      teamId={teamId}
                      from={{ id: n.id, label: `${n.name} · ${label(n)}`, availableCents: n.status === 'removed' || n.archived_at ? n.raised_cents : n.raised_cents - n.price_cents }}
                      targets={[fundTarget]}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {ctx.canEdit && data.fund && data.fund.availableCents > 0 && topUpTargets.length > 0 && (
            <Section title="Use the team fund on an item" id="topup">
              <div className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="t-body">
                  The team fund has <span className="font-medium text-ink tabular">{money(data.fund.availableCents)}</span> unspent. You can finish an item that is partly funded.
                </p>
                <MoveFunds teamId={teamId} from={{ id: data.fund.id, label: 'Team fund', availableCents: data.fund.availableCents }} targets={topUpTargets} label="Move to an item" />
              </div>
            </Section>
          )}
        </>
      )}

      {tab === 'deliver' && (
        <>
          {toDeliver.length === 0 ? (
            <EmptyState action={<ButtonLink href={base} variant="secondary">Open the buy list</ButtonLink>}>Nothing waiting to be handed out.</EmptyState>
          ) : (
            <DeliverList teamId={teamId} needs={toDeliver} canEdit={ctx.canEdit} />
          )}
          {delivered.length > 0 && (
            <Section title={`Delivered (${delivered.length})`} id="delivered">
              <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
                {delivered.map((n: any) => (
                  <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      {n.delivery_photo_path && <img src={`/media/delivery/${n.id}`} alt={`Delivery photo: ${n.name} for ${label(n)}`} width={48} height={48} className="size-12 rounded-md object-cover" />}
                      <div>
                        <p className="font-medium text-ink">{n.name}</p>
                        <p className="t-caption">
                          {label(n)}
                          {n.variant ? ` · ${n.variant}` : ''}
                        </p>
                      </div>
                    </div>
                    <NeedStatusChip status="delivered" date={n.delivered_at ? formatDate(n.delivered_at) : null} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {tab === 'log' && (
        <>
          {data.purchases.length === 0 ? (
            <EmptyState action={<ButtonLink href={base} variant="secondary">Open the buy list</ButtonLink>}>No purchases logged yet.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.purchases.map((p: any) => {
                const lines = p.needs as any[];
                return (
                  <li key={p.id} className="rounded-md border border-hairline-soft">
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[17px] font-medium text-ink">
                          {p.vendor} · <span className="tabular">{money(p.total_cents)}</span>
                        </p>
                        <p className="t-caption">
                          Ordered {formatDate(p.order_date)} · {lines.length} {lines.length === 1 ? 'line' : 'lines'} · logged by {p.full_name ?? p.email ?? 'staff'}
                        </p>
                        {p.note && <p className="t-body mt-1">{p.note}</p>}
                      </div>
                      <a href={`/media/receipt/${p.id}`} target="_blank" rel="noopener" className={buttonClass('secondary', { size: 'sm' })}>
                        View receipt<span className="sr-only"> from {p.vendor}</span>
                      </a>
                    </div>
                    <details className="border-t border-hairline-soft">
                      <summary className="flex min-h-11 items-center px-4 text-[15px] text-primary">Items covered</summary>
                      <table className="w-full border-collapse text-left">
                        <caption className="sr-only">Items covered by the {p.vendor} purchase</caption>
                        <thead>
                          <tr className="bg-chrome">
                            <th scope="col" className="t-label h-10 px-4 font-medium">Item</th>
                            <th scope="col" className="t-label h-10 px-4 font-medium">For</th>
                            <th scope="col" className="t-label h-10 px-4 text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((l, i) => (
                            <tr key={i} className="border-t border-hairline-soft">
                              <td className="t-list px-4 py-2.5">
                                {l.kind === 'team_fund' ? 'From the team fund' : l.name}
                                {l.variant ? ` · ${l.variant}` : ''}
                              </td>
                              <td className="t-list px-4 py-2.5">{l.first_name ? athleteDisplayName(l) : 'Team'}</td>
                              <td className="t-list px-4 py-2.5 text-right tabular">{money(l.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
