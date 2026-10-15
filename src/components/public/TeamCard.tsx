import Link from 'next/link';
import { Lock, ShieldCheck } from 'lucide-react';
import type { PublicTeam } from '@/lib/queries/public';
import { Meter } from '@/components/ui/Meter';
import { teamVars } from '@/config/team-colors';
import { TeamCrest } from './TeamCrest';
import { sportLabel } from './sport';

/** Team cover: the coach's photo, or a band in the team's color. */
export function TeamCover({ team, className, eager }: { team: Pick<PublicTeam, 'id' | 'has_photo' | 'photo_v' | 'name' | 'color'>; className?: string; eager?: boolean }) {
  return team.has_photo ? (
    <img
      src={`/media/team/${team.id}?v=${team.photo_v}`}
      alt=""
      width={1600}
      height={900}
      loading={eager ? 'eager' : 'lazy'}
      className={`size-full object-cover ${className ?? ''}`}
    />
  ) : (
    <span
      aria-hidden
      className={`block size-full bg-[radial-gradient(120%_90%_at_50%_0%,var(--team)_0%,var(--team-night)_100%)] ${className ?? ''}`}
      style={teamVars(team.color) as React.CSSProperties}
    />
  );
}

/** Team card for grids on the home and search pages. The whole card is the link. */
export function TeamCard({ team }: { team: PublicTeam }) {
  return (
    <li className="flex">
      <Link
        href={`/t/${team.slug}`}
        style={teamVars(team.color) as React.CSSProperties}
        className="group card flex w-full flex-col overflow-hidden text-ink-body no-underline transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--team-line)] hover:text-ink-body hover:shadow-lift"
      >
        <div className="relative aspect-[16/7] overflow-hidden bg-[var(--team-night)]">
          <TeamCover team={team} className="transition-transform duration-500 group-hover:scale-[1.03]" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-[12px] font-semibold text-ink">{sportLabel(team.sport)}</span>
        </div>
        <div className="relative flex flex-1 flex-col gap-3 px-4 pb-4 pt-0">
          <div className="-mt-7 flex items-end gap-3">
            <TeamCrest name={team.mascot ? `${team.org_name} ${team.mascot}` : team.org_name} color={team.color} size={48} />
            <div className="min-w-0 pb-0.5">
              <h3 className="truncate text-[16.5px] leading-6 font-semibold text-ink group-hover:text-[var(--team)]">{team.name}</h3>
            </div>
          </div>
          <p className="t-caption -mt-1 flex items-center gap-1.5">
            {team.city}, {team.state}
            {team.verification_status === 'verified' && (
              <>
                <span aria-hidden>·</span>
                <ShieldCheck size={14} aria-hidden className="text-primary" />
                Verified
              </>
            )}
          </p>
          <Meter raised={team.raised_cents} goal={team.goal_cents} compact label={`${team.name} funding`} className="mt-auto" />
          <p className="flex items-center gap-1.5 text-[13px] leading-5 text-ink-meta">
            <Lock size={13} aria-hidden /> {team.athletes_live} players · {team.items_funded} of {team.items_total} items funded
          </p>
        </div>
      </Link>
    </li>
  );
}
