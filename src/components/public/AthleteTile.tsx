import Link from 'next/link';
import type { RosterTile } from '@/lib/queries/public';
import { Meter } from '@/components/ui/Meter';
import { Chip } from '@/components/ui/Chip';

export function PhotoPlaceholder({ jersey, className, large }: { jersey: string | null; className?: string; large?: boolean }) {
  return (
    <span aria-hidden className={`flex aspect-[3/4] items-center justify-center bg-band font-medium text-ink-list tabular ${large ? 'text-[64px]' : 'text-[32px]'} ${className ?? ''}`}>
      {jersey ? `#${jersey}` : ''}
    </span>
  );
}

export function AthleteTile({ a, teamSlug }: { a: RosterTile; teamSlug: string }) {
  const funded = a.goal_cents > 0 && a.raised_cents >= a.goal_cents;
  return (
    <li>
      <Link href={`/t/${teamSlug}/${a.slug}`} className="group flex h-full flex-col gap-2 rounded-md text-ink-body no-underline">
        <span className="relative block overflow-hidden rounded-lg">
          {a.has_photo ? (
            <img src={`/media/athlete/${a.id}?v=${a.photo_v}`} alt="" width={300} height={400} loading="lazy" className="aspect-[3/4] w-full bg-band object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
          ) : (
            <PhotoPlaceholder jersey={a.jersey} className="w-full" />
          )}
          {funded && (
            <span className="absolute left-2 top-2">
              <Chip tone="funded" icon="check">Fully funded</Chip>
            </span>
          )}
        </span>
        <span className="flex flex-col gap-0.5 px-0.5">
          <span className="text-[16px] font-medium leading-6 text-ink group-hover:text-primary-deep group-hover:underline">{a.display_name}</span>
          <span className="text-[14px] leading-5 text-ink-meta">
            {[a.jersey && `#${a.jersey}`, a.position].filter(Boolean).join(' · ')}
          </span>
        </span>
        <Meter raised={a.raised_cents} goal={a.goal_cents} compact showText={false} label={`${a.display_name}: ${a.items_funded} of ${a.items_total} items funded`} className="px-0.5" />
        <span className="px-0.5 text-[14px] leading-5 text-ink-meta">
          {a.items_funded} of {a.items_total} items funded
        </span>
      </Link>
    </li>
  );
}
