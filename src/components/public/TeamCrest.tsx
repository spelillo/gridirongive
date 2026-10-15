import { initials } from '@/lib/domain/names';
import { DEFAULT_TEAM_COLOR } from '@/config/team-colors';
import { cn } from '@/components/ui/cn';

/**
 * Shield with the team's initials in its color. Stands in for a logo, so
 * every team has a recognizable mark even before a coach uploads a photo.
 */
export function TeamCrest({ name, color, size = 56, className }: { name: string; color?: string | null; size?: number; className?: string }) {
  const c = color ?? DEFAULT_TEAM_COLOR;
  const text = initials(name.replace(/\b(high|school|varsity|jv|football|hockey|lacrosse|baseball|youth|league|the)\b/gi, '').trim() || name).slice(0, 2);
  return (
    <svg aria-hidden width={size} height={size * 1.12} viewBox="0 0 100 112" className={cn('shrink-0 drop-shadow-[0_4px_10px_rgba(7,15,36,0.25)]', className)}>
      <path d="M50 2 L94 16 C94 62 80 92 50 110 C20 92 6 62 6 16 Z" fill="#fff" />
      <path d="M50 9 L87 21 C87 61 75 86 50 102 C25 86 13 61 13 21 Z" fill={c} />
      <path d="M50 9 L87 21 C87 40 84 55 79 67 L21 67 C16 55 13 40 13 21 Z" fill="#fff" opacity=".1" />
      <text x="50" y="66" textAnchor="middle" fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif" fontWeight="700" fontSize="40" fill="#fff" letterSpacing="1">
        {text}
      </text>
    </svg>
  );
}
