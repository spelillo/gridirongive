import Link from 'next/link';
import { Package, Truck, Heart, Search } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { claimDonationsByEmail, donorHistory, type DonorGift } from '@/lib/app/donor';
import { money } from '@/lib/domain/money';
import { formatDate } from '@/lib/domain/text';
import { AppShell, AppMain } from '@/components/app/AppShell';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { Chip, NeedStatusChip } from '@/components/ui/Chip';

export const metadata = { title: 'My gifts' };

const GIFT_STATUS: Record<string, { label: string; tone: 'warn' | 'error' | 'muted' }> = {
  pending: { label: 'Processing', tone: 'warn' },
  refunded: { label: 'Refunded', tone: 'muted' },
  disputed: { label: 'Disputed', tone: 'error' },
};

function GiftStatus({ gift, item }: { gift: DonorGift; item?: DonorGift['items'][number] }) {
  const s = GIFT_STATUS[gift.status];
  if (s) return <Chip tone={s.tone}>{s.label}</Chip>;
  if (!item) return null;
  if (item.name === 'Team fund') return <Chip tone="funded" icon="check">Received</Chip>;
  return <NeedStatusChip status={item.status} />;
}

function itemLabel(i: DonorGift['items'][number]) {
  return i.athlete ? `${i.name} for ${i.athlete}` : i.name;
}

/** Donor history (ui-ux-spec 5.8): every gift made with this email, with its gear status. */
export default async function DonorPage() {
  const user = await requireUser('/app/donor');
  await claimDonationsByEmail(user);
  const { gifts, updates } = await donorHistory(user);
  const byYear = new Map<number, { count: number; cents: number }>();
  for (const g of gifts) {
    if (g.status !== 'succeeded') continue;
    const y = new Date(g.date).getFullYear();
    const cur = byYear.get(y) ?? { count: 0, cents: 0 };
    byYear.set(y, { count: cur.count + 1, cents: cur.cents + g.totalCents });
  }

  return (
    <AppShell user={user}>
      <AppMain>
        <div className="mx-auto flex max-w-[960px] flex-col gap-8">
          <PageHeader
            title="My gifts"
            sub={gifts.length ? `Gifts made with ${user.email}.` : undefined}
            actions={
              gifts.length ? (
                <ButtonLink href="/search" variant="secondary">
                  <Search size={18} aria-hidden /> Find another team
                </ButtonLink>
              ) : undefined
            }
          />

          {gifts.length === 0 ? (
            <EmptyState action={<ButtonLink href="/search">Find a team to support</ButtonLink>}>
              No gifts made with {user.email} yet. Gifts made with this email before you signed in show up here on their own.
            </EmptyState>
          ) : (
            <>
              {byYear.size > 0 && (
                <dl className="flex flex-wrap gap-x-10 gap-y-3 -mt-4">
                  {[...byYear.entries()].map(([year, v]) => (
                    <div key={year} className="flex flex-col">
                      <dt className="t-caption">{year}</dt>
                      <dd className="text-[20px] font-medium text-ink tabular">
                        {money(v.cents)} <span className="t-caption font-normal">in {v.count} {v.count === 1 ? 'gift' : 'gifts'}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <Section title="Gifts" id="gifts">
                <div className="overflow-hidden rounded-md border border-hairline-soft">
                  <table className="hidden w-full text-left text-[15px] md:table">
                    <caption className="sr-only">Your gifts, newest first</caption>
                    <thead className="bg-chrome">
                      <tr>
                        <th scope="col" className="t-label px-4 py-2.5">Date</th>
                        <th scope="col" className="t-label px-4 py-2.5">Team</th>
                        <th scope="col" className="t-label px-4 py-2.5">What it funded</th>
                        <th scope="col" className="t-label px-4 py-2.5 text-right">Amount</th>
                        <th scope="col" className="t-label px-4 py-2.5">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline-soft">
                      {gifts.map((g) => (
                        <tr key={g.id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-3 text-ink-body">{formatDate(g.date)}</td>
                          <td className="px-4 py-3 text-ink">{g.team.public ? <Link href={`/t/${g.team.slug}`}>{g.team.name}</Link> : g.team.name}</td>
                          <td className="px-4 py-3">
                            <ul className="flex flex-col gap-1.5">
                              {g.items.map((i) => (
                                <li key={i.needId} className="flex flex-wrap items-center gap-2 text-ink-body">
                                  <span>{itemLabel(i)}</span>
                                  {i.amountCents > 0 && g.items.length > 1 && <span className="t-caption tabular">{money(i.amountCents)}</span>}
                                  <GiftStatus gift={g} item={i} />
                                </li>
                              ))}
                              {g.items.length === 0 && (
                                <li className="flex items-center gap-2">
                                  <span className="text-ink-body">Gift to {g.team.name}</span>
                                  <GiftStatus gift={g} />
                                </li>
                              )}
                            </ul>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink tabular">{money(g.totalCents)}</td>
                          <td className="px-4 py-3">
                            <Link href={g.receiptHref} prefetch={false} className="inline-flex min-h-11 items-center">
                              View<span className="sr-only"> receipt for {formatDate(g.date)}</span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="divide-y divide-hairline-soft md:hidden" aria-label="Your gifts, newest first">
                    {gifts.map((g) => (
                      <li key={g.id} className="flex flex-col gap-2 px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[16px] font-medium text-ink">{g.team.name}</span>
                          <span className="text-[16px] font-medium text-ink tabular">{money(g.totalCents)}</span>
                        </div>
                        <p className="t-caption">{formatDate(g.date)}</p>
                        <ul className="flex flex-col gap-1.5">
                          {g.items.map((i) => (
                            <li key={i.needId} className="flex flex-wrap items-center gap-2 text-[15px] text-ink-body">
                              <span>{itemLabel(i)}</span>
                              <GiftStatus gift={g} item={i} />
                            </li>
                          ))}
                          {g.items.length === 0 && (
                            <li className="flex items-center gap-2 text-[15px] text-ink-body">
                              Gift to {g.team.name} <GiftStatus gift={g} />
                            </li>
                          )}
                        </ul>
                        <Link href={g.receiptHref} prefetch={false} className="inline-flex min-h-11 w-fit items-center text-[15px]">
                          View receipt
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>

              <Section title="Updates" id="updates">
                {updates.length === 0 ? (
                  <EmptyState>No updates yet. You&apos;ll see purchases, deliveries and thank-you notes here, and get them by email.</EmptyState>
                ) : (
                  <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
                    {updates.map((u) => {
                      const Icon = u.kind === 'thanks' ? Heart : u.kind === 'delivered' ? Truck : Package;
                      return (
                        <li key={u.key} className="flex gap-3 px-4 py-3">
                          <Icon size={20} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-ink-meta" />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                              <p className="text-[15px] font-medium text-ink">{u.title}</p>
                              <p className="t-caption">{formatDate(u.date)}</p>
                            </div>
                            {u.body && <p className={u.kind === 'thanks' ? 'text-[15px] leading-[22px] text-ink-body' : 't-caption'}>{u.kind === 'thanks' ? `“${u.body}”` : u.body}</p>}
                            {u.photoHref && (
                              <img src={u.photoHref} alt="Photo sent with the thank-you note" className="mt-1 max-h-48 w-auto max-w-full rounded-md border border-hairline-soft object-cover" loading="lazy" />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              <p className="t-caption">
                Change which updates are emailed to you in <Link href="/app/account#email" className="underline">account settings</Link>.
              </p>
            </>
          )}
        </div>
      </AppMain>
    </AppShell>
  );
}
