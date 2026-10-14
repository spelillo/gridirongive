import Link from 'next/link';
import { Lock } from 'lucide-react';
import type { PublicTeam } from '@/lib/queries/public';
import { Meter } from '@/components/ui/Meter';
import { Chip } from '@/components/ui/Chip';
import { initials } from '@/lib/domain/names';
import { SITE } from '@/config/site';

export function sportLabel(id: string) {
  return SITE.sports.find((s) => s.id === id)?.label ?? id;
}

export function TeamThumb({ team, className }: { team: Pick<PublicTeam, 'id' | 'has_photo' | 'photo_v' | 'org_name' | 'name'>; className?: string }) {
  return team.has_photo ? (
    <img src={`/media/team/${team.id}?v=${team.photo_v}`} alt="" width={160} height={90} loading="lazy" className={`aspect-video rounded-md object-cover ${className ?? ''}`} />
  ) : (
    <span aria-hidden className={`flex aspect-video items-center justify-center rounded-md bg-band text-[20px] font-medium text-ink-list ${className ?? ''}`}>
      {initials(team.org_name)}
    </span>
  );
}

/** Search result row (ui-ux-spec 3, Team row). The whole row is the link. */
export function TeamRow({ team }: { team: PublicTeam }) {
  return (
    <li>
      <Link href={`/t/${team.slug}`} className="group flex gap-4 rounded-md border border-hairline-soft p-3 text-ink-body no-underline hover:border-primary hover:bg-band-blue/40 md:p-4">
        <TeamThumb team={team} className="w-24 shrink-0 self-start md:w-40" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h3 className="t-subhead group-hover:text-primary-deep">{team.name}</h3>
              <p className="t-caption mt-0.5">
                {team.org_name} · {team.city}, {team.state}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip tone="neutral">{sportLabel(team.sport)}</Chip>
              {team.verification_status === 'verified' && (
                <Chip tone="info" icon="shield">Verified</Chip>
              )}
            </div>
          </div>
          <Meter raised={team.raised_cents} goal={team.goal_cents} compact label={`${team.name} funding`} />
          <p className="flex items-center gap-1.5 text-[13px] leading-5 text-ink-meta">
            <Lock size={14} aria-hidden /> Code required to see players
            <span aria-hidden>·</span>
            {team.items_funded} of {team.items_total} items funded
          </p>
        </div>
      </Link>
    </li>
  );
}

