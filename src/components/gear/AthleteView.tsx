'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { GearPhoto, type PhotoNeed } from './GearPhoto';
import { GearCard, type CardNeed } from './GearCard';
import { useGive } from '@/components/give/GiveProvider';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Avatar } from '@/components/ui/Avatar';
import { Meter } from '@/components/ui/Meter';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TeamCrest } from '@/components/public/TeamCrest';
import { teamVars } from '@/config/team-colors';
import { ClampText } from '@/components/public/Collapsible';
import { money, moneyWhole, moneyWholeUp } from '@/lib/domain/money';
import { relativeTime } from '@/lib/domain/text';
import { track } from '@/lib/analytics-client';

export interface AthleteViewData {
  id: string;
  displayName: string;
  first: string;
  meta: string;
  jersey: string | null;
  bio: string;
  photoSrc: string | null;
  photoAlt: string;
  goalCents: number;
  raisedCents: number;
  remainingCents: number;
  itemsTotal: number;
  itemsFunded: number;
  team: { name: string; slug: string; color?: string | null; crest?: string };
  needs: (CardNeed & { pinX: number | null; pinY: number | null })[];
  supporters: { id: string; name: string; message: string | null; createdAt: string }[];
  supportersTotal: number;
  preview?: boolean;
  /** Link to /report prefilled for this page. */
  reportHref?: string;
}

/** The athlete page body (ui-ux-spec 5.4). */
export function AthleteView({ data }: { data: AthleteViewData }) {
  const { open, isOpen, config } = useGive();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [allSupporters, setAllSupporters] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const canGive = config.team.acceptsGifts && !data.preview;
  const fullyFunded = data.remainingCents <= 0 && data.itemsTotal > 0;

  useEffect(() => {
    track('athlete_viewed', { source: document.referrer.includes('/s/') ? 'link' : 'team' });
  }, []);

  const onSelect = (id: string | null, opts?: { fromPin?: boolean }) => {
    setSelected(id);
    if (!id) return;
    if (opts?.fromPin) track('pin_tapped', {});
    setFlash((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 }));
    if (opts?.fromPin && !window.matchMedia('(min-width: 768px) and (hover: hover)').matches) {
      cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const photoNeeds: PhotoNeed[] = data.needs.map((n) => ({ id: n.id, number: n.number, name: n.name, priceCents: n.priceCents, raisedCents: n.raisedCents, status: n.status, pinX: n.pinX, pinY: n.pinY }));
  const fundRest = () => open({ kind: 'fund_rest', athleteId: data.id, athleteName: data.displayName });
  const giveAny = () => open({ kind: 'athlete', athleteId: data.id, athleteName: data.displayName });
  const shown = allSupporters ? data.supporters : data.supporters.slice(0, 10);

  const totals = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        {fullyFunded ? (
          <p className="t-score text-[40px] text-funded">Fully funded</p>
        ) : (
          <p className="flex items-baseline gap-2">
            <span className="t-score text-[40px] text-ink md:text-[44px]">{moneyWhole(data.raisedCents)}</span>
            <span className="text-[15px] text-ink-meta">of {moneyWholeUp(data.goalCents)}</span>
          </p>
        )}
        <p className="t-caption tabular">
          {data.itemsFunded} of {data.itemsTotal} items funded
        </p>
      </div>
      <Meter raised={data.raisedCents} goal={data.goalCents} showText={false} thick label={`${data.first}'s gear: ${moneyWhole(data.raisedCents)} of ${moneyWholeUp(data.goalCents)}`} />
    </div>
  );

  const heading = (
    <div className="flex items-start gap-4">
      {data.jersey && (
        <span aria-hidden className="t-score flex h-[60px] min-w-[60px] items-center justify-center rounded-[14px] bg-[var(--team,#1747d1)] px-2 text-[36px] text-white md:h-[68px] md:min-w-[68px] md:text-[40px]">
          {data.jersey}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="t-hero">{data.displayName}</h1>
        <p className="text-[15px] text-ink-meta md:text-[16px]">{data.meta}</p>
        <Link href={`/t/${data.team.slug}`} className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink no-underline hover:text-[var(--team,#1747d1)] hover:underline">
          <TeamCrest name={data.team.crest ?? data.team.name} color={data.team.color} size={20} className="drop-shadow-none" />
          {data.team.name}
        </Link>
      </div>
    </div>
  );

  return (
    <div style={teamVars(data.team.color) as React.CSSProperties}>
      <div className="page-x mx-auto w-full max-w-[1200px] py-4 pb-32 md:py-8 lg:pb-14">
        <div className="mb-5">
          <Breadcrumb items={[{ label: data.team.name, href: `/t/${data.team.slug}` }, { label: 'Players', href: `/t/${data.team.slug}#players` }, { label: data.displayName }]} />
        </div>
        <div className={data.photoSrc ? 'grid gap-6 lg:grid-cols-12 lg:gap-12' : 'flex flex-col gap-6'}>
          {/* Mobile header */}
          <header className="lg:hidden">{heading}</header>

          {data.photoSrc && (
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-[88px]">
                <GearPhoto
                  src={data.photoSrc}
                  alt={data.photoAlt}
                  jersey={data.jersey}
                  needs={photoNeeds}
                  selected={selected}
                  hovered={hovered}
                  onSelect={onSelect}
                  onGive={(id) => open({ kind: 'need', needId: id, entry: 'pin' })}
                  canGive={canGive}
                  athleteFirst={data.first}
                />
              </div>
            </div>
          )}

          <div className={data.photoSrc ? 'flex flex-col gap-8 lg:col-span-7' : 'flex flex-col gap-8'}>
            <header className="hidden lg:block">{heading}</header>

            <div className="card flex flex-col gap-5 p-5">
              {totals}
              {canGive && !fullyFunded && (
                <div className="hidden gap-3 lg:flex">
                  <Button onClick={fundRest}>Fund the rest ({money(data.remainingCents).replace(/\.00$/, '')})</Button>
                  <Button variant="secondary" onClick={giveAny}>
                    Give any amount
                  </Button>
                </div>
              )}
              {!config.team.acceptsGifts && !data.preview && <p className="t-caption">This team can&apos;t accept gifts right now.</p>}
            </div>

            <section aria-labelledby="gear-h" className="flex flex-col gap-3">
              <h2 id="gear-h" className="t-subhead">
                Gear list
              </h2>
              {data.needs.length === 0 ? (
                <p className="t-body">No gear on this list yet.</p>
              ) : (
                <ol id="gear-list" className="flex flex-col gap-3" tabIndex={-1}>
                  {data.needs.map((n) => (
                    <GearCard
                      key={n.id}
                      ref={(el) => {
                        if (el) cardRefs.current.set(n.id, el);
                        else cardRefs.current.delete(n.id);
                      }}
                      need={n}
                      highlighted={selected === n.id}
                      flashKey={flash[n.id] ?? 0}
                      canGive={canGive}
                      onGive={() => open({ kind: 'need', needId: n.id, entry: 'card' })}
                      onHover={(on) => setHovered(on ? n.id : null)}
                    />
                  ))}
                </ol>
              )}
            </section>

            {data.bio && (
              <section aria-labelledby="about-h" className="flex flex-col gap-2">
                <h2 id="about-h" className="t-subhead">
                  About {data.first}
                </h2>
                <ClampText text={data.bio} lines={5} />
              </section>
            )}

            <section aria-labelledby="sup-h" className="flex flex-col gap-3">
              <h2 id="sup-h" className="t-subhead">
                Supporters {data.supportersTotal > 0 && <span className="text-ink-meta tabular">{data.supportersTotal}</span>}
              </h2>
              {data.supporters.length === 0 ? (
                <p className="t-body">No supporters yet. Be the first.</p>
              ) : (
                <ul className="card flex flex-col divide-y divide-hairline-soft px-4">
                  {shown.map((s) => (
                    <li key={s.id} className="flex gap-3 py-3.5">
                      <Avatar name={s.name} size={36} className="bg-[var(--team-soft,#ebf1ff)] text-[var(--team,#1747d1)]" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[15px] font-semibold text-ink">{s.name}</span>
                          <span className="t-caption whitespace-nowrap">{relativeTime(s.createdAt)}</span>
                        </div>
                        {s.message && <p className="text-[15px] leading-[22px] text-ink-body">{s.message}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {data.supporters.length > 10 && !allSupporters && (
                <button type="button" className="min-h-11 self-start text-[15px] text-primary hover:underline" onClick={() => setAllSupporters(true)}>
                  Show all
                </button>
              )}
            </section>
          </div>
        </div>
        {data.reportHref && (
          <p className="t-caption mt-8 border-t border-hairline-soft pt-4">
            Something wrong on this page? <Link href={data.reportHref} className="underline">Report this page</Link>
          </p>
        )}
      </div>

      {/* Sticky action bar on phones and tablets */}
      {!isOpen && !data.preview && config.team.acceptsGifts && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-hairline-soft bg-canvas/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(7,15,36,0.08)] backdrop-blur lg:hidden">
          {fullyFunded ? (
            <div className="flex items-center justify-between gap-3">
              <Chip tone="funded" icon="check">Fully funded. Thank you!</Chip>
              <Button variant="secondary" onClick={() => open({ kind: 'team_fund' })}>
                Support the team
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button className="flex-1" onClick={fundRest}>
                Fund the rest ({money(data.remainingCents).replace(/\.00$/, '')})
              </Button>
              <Button variant="secondary" onClick={giveAny}>
                Give
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
