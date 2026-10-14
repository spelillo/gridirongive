'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { GearPhoto, type PhotoNeed } from './GearPhoto';
import { GearCard, type CardNeed } from './GearCard';
import { useGive } from '@/components/give/GiveProvider';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Meter } from '@/components/ui/Meter';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
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
  team: { name: string; slug: string };
  needs: (CardNeed & { pinX: number | null; pinY: number | null })[];
  supporters: { id: string; name: string; message: string | null; createdAt: string }[];
  supportersTotal: number;
  preview?: boolean;
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
    <div className="flex flex-col gap-2">
      <p className="t-figure">
        {fullyFunded ? (
          <span className="text-funded">Fully funded</span>
        ) : (
          <>
            {moneyWhole(data.raisedCents)} <span className="font-normal text-ink-meta">of {moneyWholeUp(data.goalCents)}</span>
          </>
        )}
      </p>
      <Meter raised={data.raisedCents} goal={data.goalCents} showText={false} label={`${data.first}'s gear: ${moneyWhole(data.raisedCents)} of ${moneyWholeUp(data.goalCents)}`} />
      <p className="t-caption tabular">
        {data.itemsFunded} of {data.itemsTotal} items funded
      </p>
    </div>
  );

  return (
    <>
      <div className="page-x mx-auto w-full max-w-[1200px] py-4 pb-32 md:py-8 lg:pb-12">
        <div className="mb-4 hidden lg:block">
          <Breadcrumb items={[{ label: data.team.name, href: `/t/${data.team.slug}` }, { label: 'Players', href: `/t/${data.team.slug}#players-h` }, { label: data.displayName }]} />
        </div>
        <div className={data.photoSrc ? 'grid gap-6 lg:grid-cols-12 lg:gap-10' : 'flex flex-col gap-6'}>
          {/* Mobile header */}
          <header className="flex flex-col gap-1 lg:hidden">
            <h1 className="t-hero">{data.displayName}</h1>
            <p className="t-caption text-[15px]">{data.meta}</p>
            <Link href={`/t/${data.team.slug}`} className="text-[15px]">
              {data.team.name}
            </Link>
          </header>

          {data.photoSrc && (
            <div className="lg:col-span-7">
              <div className="lg:sticky lg:top-[84px]">
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

          <div className={data.photoSrc ? 'flex flex-col gap-6 lg:col-span-5' : 'flex flex-col gap-6'}>
            <header className="hidden flex-col gap-1 lg:flex">
              <h1 className="t-hero">{data.displayName}</h1>
              <p className="t-body">{data.meta}</p>
              <Link href={`/t/${data.team.slug}`} className="text-[16px]">
                {data.team.name}
              </Link>
            </header>
            {!data.photoSrc && (
              <div className="w-40 lg:hidden">
                <span className="flex aspect-[3/4] items-center justify-center rounded-lg bg-band text-[40px] font-medium text-ink-list tabular" aria-hidden>
                  {data.jersey ? `#${data.jersey}` : ''}
                </span>
              </div>
            )}

            {totals}

            {canGive && !fullyFunded && (
              <div className="hidden flex-col gap-3 sm:flex-row lg:flex">
                <Button onClick={fundRest}>Fund the rest ({money(data.remainingCents).replace(/\.00$/, '')})</Button>
                <Button variant="secondary" onClick={giveAny}>
                  Give any amount
                </Button>
              </div>
            )}
            {!config.team.acceptsGifts && !data.preview && <p className="t-caption">This team can&apos;t accept gifts right now.</p>}

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
                <ul className="flex flex-col divide-y divide-hairline-soft">
                  {shown.map((s) => (
                    <li key={s.id} className="flex flex-col gap-1 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px] font-medium text-ink">{s.name}</span>
                        <span className="t-caption whitespace-nowrap">{relativeTime(s.createdAt)}</span>
                      </div>
                      {s.message && <p className="text-[15px] leading-[22px] text-ink-body">{s.message}</p>}
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
      </div>

      {/* Sticky action bar on phones and tablets */}
      {!isOpen && !data.preview && config.team.acceptsGifts && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-hairline-soft bg-canvas px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
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
    </>
  );
}
