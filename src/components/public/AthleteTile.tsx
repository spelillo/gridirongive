import Link from 'next/link';
import { Check } from 'lucide-react';
import type { RosterTile } from '@/lib/queries/public';
import { Meter } from '@/components/ui/Meter';
import { moneyWhole } from '@/lib/domain/money';

export function PhotoPlaceholder({ jersey, className, large }: { jersey: string | null; className?: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`t-score flex aspect-[3/4] items-center justify-center bg-[radial-gradient(100%_80%_at_50%_20%,var(--team,#1747d1)_0%,var(--team-night,#0a1633)_100%)] text-white/90 ${large ? 'text-[120px]' : 'text-[64px]'} ${className ?? ''}`}
    >
      {jersey ?? ''}
    </span>
  );
}

export function AthleteTile({ a, teamSlug }: { a: RosterTile; teamSlug: string }) {
  const funded = a.goal_cents > 0 && a.raised_cents >= a.goal_cents;
  const left = Math.max(0, a.goal_cents - a.raised_cents);
  return (
    <li className="flex">
      <Link
        href={`/t/${teamSlug}/${a.slug}`}
        className="group card flex w-full flex-col overflow-hidden text-ink-body no-underline transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:text-ink-body hover:shadow-lift"
      >
        <span className="relative block overflow-hidden bg-[var(--team-night,#0a1633)]">
          {a.has_photo ? (
            <img
              src={`/media/athlete/${a.id}?v=${a.photo_v}`}
              alt=""
              width={300}
              height={400}
              loading="lazy"
              className="aspect-[4/5] w-full origin-[50%_30%] scale-[1.28] object-cover transition-transform duration-500 group-hover:scale-[1.34]"
            />
          ) : (
            <PhotoPlaceholder jersey={a.jersey} className="aspect-[4/5] w-full" />
          )}
          {a.jersey && (
            <span className="t-score absolute left-2.5 top-2.5 rounded-[8px] bg-white/95 px-2 py-0.5 text-[20px] text-ink shadow-sm">#{a.jersey}</span>
          )}
          {funded && (
            <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-funded px-2 py-0.5 text-[12px] font-semibold text-white">
              <Check size={13} strokeWidth={2.5} aria-hidden /> Funded
            </span>
          )}
        </span>
        <span className="flex flex-1 flex-col gap-2 p-3">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[16px] leading-6 font-semibold text-ink group-hover:text-[var(--team,#1747d1)]">{a.display_name}</span>
            {a.position && <span className="shrink-0 text-[13px] font-semibold text-ink-meta">{a.position}</span>}
          </span>
          <Meter raised={a.raised_cents} goal={a.goal_cents} compact showText={false} label={`${a.display_name}: ${a.items_funded} of ${a.items_total} items funded`} className="mt-auto" />
          <span className="flex items-baseline justify-between gap-2 text-[13px] leading-5 text-ink-meta">
            <span>
              {a.items_funded} of {a.items_total} items funded
            </span>
            {!funded && <span className="tabular font-semibold text-ink">{moneyWhole(left)} to go</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}
