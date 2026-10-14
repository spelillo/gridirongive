'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { Meter } from '@/components/ui/Meter';
import { Button } from '@/components/ui/Button';
import { moneyWhole } from '@/lib/domain/money';
import { layoutPins } from './layoutPins';
import { PhotoPlaceholder } from '@/components/public/AthleteTile';

export interface PhotoNeed {
  id: string;
  number: number;
  name: string;
  priceCents: number;
  raisedCents: number;
  status: string;
  pinX: number | null;
  pinY: number | null;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function pinState(status: string) {
  if (status === 'funded') return 'funded';
  if (status === 'purchased' || status === 'delivered') return 'done';
  return 'open';
}

/**
 * Athlete photo with numbered gear pins (ui-ux-spec 6.2). Screen readers get
 * the list, which comes right after; each pin is still a labeled button for
 * keyboard users. Desktop opens a popover; mobile scrolls to the gear card.
 */
export function GearPhoto({
  src,
  alt,
  jersey,
  needs,
  selected,
  hovered,
  onSelect,
  onGive,
  canGive,
  athleteFirst,
}: {
  src: string | null;
  alt: string;
  jersey: string | null;
  needs: PhotoNeed[];
  selected: string | null;
  hovered: string | null;
  onSelect: (id: string | null, opts?: { fromPin?: boolean }) => void;
  onGive: (id: string) => void;
  canGive: boolean;
  athleteFirst: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [show, setShow] = useState(true);
  const [desktop, setDesktop] = useState(false);
  const [popover, setPopover] = useState<string | null>(null);
  const pinRefs = useRef(new Map<string, HTMLButtonElement>());
  const popRef = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (hover: hover)');
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const id = popover;
        setPopover(null);
        pinRefs.current.get(id)?.focus();
      }
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && ![...pinRefs.current.values()].some((b) => b.contains(t))) setPopover(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [popover]);

  const pinned = needs.filter((n) => n.pinX !== null && n.pinY !== null);
  const laid = size.w ? layoutPins(pinned.map((n) => ({ id: n.id, x: n.pinX!, y: n.pinY! })), size.w, size.h) : [];
  const byId = new Map(needs.map((n) => [n.id, n]));
  const missing = needs.length - pinned.length;

  const onPinKey = (e: React.KeyboardEvent, idx: number) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = laid[(idx + dir + laid.length) % laid.length];
    pinRefs.current.get(next.id)?.focus();
  };

  const pop = popover ? laid.find((p) => p.id === popover) : null;
  const popNeed = popover ? byId.get(popover) : null;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={src ? `Photo of ${athleteFirst} with ${pinned.length} gear markers` : `${athleteFirst} has no photo yet`} className="relative">
        {pinned.length > 0 && show && (
          <a href="#gear-list" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-20 focus:rounded-md focus:bg-canvas focus:px-3 focus:py-2">
            Skip to gear list
          </a>
        )}
        <div ref={box} className="relative mx-auto aspect-[3/4] max-h-[60vh] overflow-visible md:max-h-[80vh]">
          {src ? (
            <img src={src} alt={alt} width={900} height={1200} className="size-full rounded-lg bg-band object-cover" fetchPriority="high" />
          ) : (
            <PhotoPlaceholder jersey={jersey} large className="size-full rounded-lg" />
          )}
          {src && show && size.w > 0 && (
            <>
              <svg aria-hidden className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
                {laid.filter((p) => p.moved).map((p) => (
                  <line key={p.id} x1={p.tx} y1={p.ty} x2={p.px} y2={p.py} stroke="#475e75" strokeWidth={1} />
                ))}
                {laid.filter((p) => p.moved).map((p) => (
                  <circle key={`${p.id}-dot`} cx={p.tx} cy={p.ty} r={3} fill="#475e75" />
                ))}
              </svg>
              {laid.map((p, idx) => {
                const n = byId.get(p.id)!;
                const st = pinState(n.status);
                const isSel = selected === p.id || hovered === p.id || popover === p.id;
                const left = Math.max(n.priceCents - n.raisedCents, 0);
                return (
                  <button
                    key={p.id}
                    ref={(el) => {
                      if (el) pinRefs.current.set(p.id, el);
                      else pinRefs.current.delete(p.id);
                    }}
                    type="button"
                    aria-label={`${n.number}, ${n.name}, ${st === 'open' ? `${moneyWhole(left)} left of ${moneyWhole(n.priceCents)}` : st === 'funded' ? 'funded' : n.status}`}
                    aria-expanded={desktop ? popover === p.id : undefined}
                    onKeyDown={(e) => onPinKey(e, idx)}
                    onClick={() => {
                      onSelect(p.id, { fromPin: true });
                      if (desktop) setPopover((cur) => (cur === p.id ? null : p.id));
                    }}
                    className="group absolute z-10 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                    style={{ left: p.px, top: p.py }}
                  >
                    <span
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full text-[14px] font-medium tabular transition-[box-shadow] duration-150',
                        st === 'open' && 'bg-canvas text-primary ring-2 ring-primary',
                        st === 'funded' && 'bg-funded text-white ring-2 ring-white',
                        st === 'done' && 'bg-ink text-white ring-2 ring-white',
                        isSel && (st === 'open' ? 'ring-[3px] shadow-[0_0_0_7px_#fff]' : 'shadow-[0_0_0_4px_#0057d2]'),
                      )}
                    >
                      {st === 'open' ? n.number : <Check size={16} strokeWidth={3} aria-hidden />}
                    </span>
                    {desktop && popover !== p.id && (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[13px] text-white group-hover:block group-focus-visible:block"
                      >
                        {n.name}
                        {st === 'open' ? `, ${moneyWhole(left)} left` : ''}
                      </span>
                    )}
                  </button>
                );
              })}
              {pop && popNeed && (
                <div
                  ref={popRef}
                  role="dialog"
                  aria-label={popNeed.name}
                  className="absolute z-30 w-[280px] rounded-md border border-hairline-soft bg-canvas p-4 shadow-pop"
                  style={{
                    left: Math.min(Math.max(pop.px - 140, 0), Math.max(size.w - 280, 0)),
                    top: pop.py > size.h * 0.6 ? undefined : pop.py + 28,
                    bottom: pop.py > size.h * 0.6 ? size.h - pop.py + 28 : undefined,
                  }}
                >
                  <p className="t-label mb-2 text-[16px]">
                    {popNeed.number}. {popNeed.name}
                  </p>
                  <Meter raised={popNeed.raisedCents} goal={popNeed.priceCents} compact />
                  <div className="mt-3 flex flex-col gap-2">
                    {pinState(popNeed.status) === 'open' && canGive && (
                      <Button
                        full
                        onClick={() => {
                          setPopover(null);
                          onGive(popNeed.id);
                        }}
                      >
                        Give to this item
                      </Button>
                    )}
                    <button
                      type="button"
                      className="min-h-9 text-[15px] text-primary hover:underline"
                      onClick={() => {
                        setPopover(null);
                        document.getElementById(`need-${popNeed.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        onSelect(popNeed.id);
                      }}
                    >
                      View in list
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {src && pinned.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] text-ink-body">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-5 accent-primary" />
            Show gear on photo
          </label>
          <p className="t-caption">{missing > 0 ? "Tap a marker to see the item. Some items aren't marked on the photo." : 'Tap a marker to see the item.'}</p>
        </div>
      )}
    </div>
  );
}
