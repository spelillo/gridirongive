import { cn } from '@/components/ui/cn';

/**
 * Flat illustrations of each kind of gear, drawn in the team's color.
 * Used in gear lists, the give dialog and the buy list in place of stock
 * product photos (which vary by vendor and would be misleading).
 */
type Kind =
  | 'helmet' | 'pads' | 'cleats' | 'gloves' | 'girdle' | 'pants' | 'mouthguard' | 'ribs' | 'jersey' | 'jerseys' | 'sled' | 'brace'
  | 'visor' | 'chinstrap' | 'net' | 'fund' | 'skates' | 'stick' | 'lax' | 'mitt' | 'bat' | 'mask' | 'bag' | 'shin' | 'elbow' | 'neck' | 'gear';

export function gearKind(name: string, category?: string | null): Kind {
  const n = name.toLowerCase();
  if (category === 'team_fund' || n === 'team fund') return 'fund';
  if (n.includes('catcher')) return 'mask';
  if (n.includes('helmet')) return 'helmet';
  if (n.includes('visor')) return 'visor';
  if (n.includes('chin')) return 'chinstrap';
  if (n.includes('mouth')) return 'mouthguard';
  if (n.includes('skate')) return 'skates';
  if (n.includes('cleat') || n.includes('shoe')) return 'cleats';
  if (n.includes('lacrosse stick')) return 'lax';
  if (n.includes('stick')) return 'stick';
  if (n.includes('bat') && !n.includes('batting')) return 'bat';
  if (n.includes('baseball glove') || n.includes('mitt')) return 'mitt';
  if (n.includes('glove')) return 'gloves';
  if (n.includes('shoulder') || n.includes('back plate')) return 'pads';
  if (n.includes('rib')) return 'ribs';
  if (n.includes('girdle')) return 'girdle';
  if (n.includes('pants')) return 'pants';
  if (n.includes('jersey set')) return 'jerseys';
  if (n.includes('jersey')) return 'jersey';
  if (n.includes('sled')) return 'sled';
  if (n.includes('knee') || n.includes('brace')) return 'brace';
  if (n.includes('net')) return 'net';
  if (n.includes('bag')) return 'bag';
  if (n.includes('shin')) return 'shin';
  if (n.includes('elbow') || n.includes('arm pad')) return 'elbow';
  if (n.includes('neck')) return 'neck';
  return 'gear';
}

const W = '#ffffff';
const D = '#0b1220';

function art(kind: Kind, c: string) {
  switch (kind) {
    case 'helmet':
      return (
        <>
          <path d="M6 27c0-11 8-19 18-19s17 7 17 17v6l-6 2v5H17c-6 0-11-5-11-11Z" fill={c} />
          <path d="M14 11c5-3 13-4 19 0" stroke={W} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".85" />
          <circle cx="19" cy="27" r="3" fill={D} opacity=".35" />
          <path d="M35 24h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8M35 30h10M40 24v14" stroke="#9aa4b4" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
        </>
      );
    case 'visor':
      return (
        <>
          <path d="M6 27c0-11 8-19 18-19s17 7 17 17v6l-6 2v5H17c-6 0-11-5-11-11Z" fill={c} />
          <path d="M33 20c5 0 10 2 12 5v6c-3 2-7 3-12 3Z" fill="#7dd3fc" opacity=".85" />
        </>
      );
    case 'chinstrap':
      return (
        <>
          <path d="M8 22c6 10 26 10 32 0" stroke={D} strokeWidth="3" fill="none" opacity=".55" />
          <path d="M16 22c0 10 16 10 16 0Z" fill={c} />
          <path d="M19 24c1 5 9 5 10 0" stroke={W} strokeWidth="2" fill="none" opacity=".7" />
        </>
      );
    case 'pads':
      return (
        <>
          <path d="M5 20c0-6 6-10 12-9l7 3 7-3c6-1 12 3 12 9v6c0 2-2 3-4 2l-5-2v12H14V26l-5 2c-2 1-4 0-4-2Z" fill={c} />
          <path d="M17 13c2 5 12 5 14 0" stroke={W} strokeWidth="2.4" fill="none" opacity=".8" />
          <path d="M14 26h20" stroke={D} strokeWidth="2" opacity=".25" />
          <path d="M9 18c3-2 6-2 8 0M31 18c3-2 6-2 8 0" stroke={W} strokeWidth="2" fill="none" opacity=".5" />
        </>
      );
    case 'ribs':
      return (
        <>
          <path d="M14 8h6c0 3 8 3 8 0h6l4 6v26H10V14Z" fill={c} />
          <path d="M14 20h20M14 26h20M14 32h20" stroke={W} strokeWidth="2.2" opacity=".6" />
        </>
      );
    case 'jersey':
    case 'jerseys':
      return (
        <>
          {kind === 'jerseys' && <path d="M17 6h5c0 2.5 6 2.5 6 0h5l9 6-4 7-3-2v20H16" fill={c} opacity=".45" />}
          <path d="M13 9h6c0 3 8 3 8 0h6l9 7-4 7-4-3v21H12V20l-4 3-4-7Z" fill={c} />
          <path d="M19 9c0 3 8 3 8 0" stroke={W} strokeWidth="2" fill="none" />
          <path d="M18 24h3v10h-3zM24 24h5v3h-2v7h-3z" fill={W} opacity=".95" />
        </>
      );
    case 'girdle':
    case 'pants':
      return (
        <>
          <path d="M11 9h26l3 30h-11l-4-17h-2l-4 17H8Z" fill={kind === 'pants' ? '#e8edf3' : c} stroke={kind === 'pants' ? '#9aa4b4' : 'none'} strokeWidth="1.5" />
          <path d="M11 9h26v4H11Z" fill={kind === 'pants' ? c : D} opacity={kind === 'pants' ? 1 : 0.3} />
          {kind === 'pants' ? (
            <>
              <path d="M10 14l-2 25M38 14l2 25" stroke={c} strokeWidth="2.4" />
              <ellipse cx="15" cy="31" rx="3.5" ry="4.5" fill={c} opacity=".35" />
              <ellipse cx="33" cy="31" rx="3.5" ry="4.5" fill={c} opacity=".35" />
            </>
          ) : (
            <>
              <ellipse cx="13" cy="20" rx="3" ry="4" fill={W} opacity=".45" />
              <ellipse cx="35" cy="20" rx="3" ry="4" fill={W} opacity=".45" />
            </>
          )}
        </>
      );
    case 'mouthguard':
      return (
        <>
          <path d="M8 22c0-8 7-12 16-12s16 4 16 12c0 7-6 12-16 12S8 29 8 22Z" fill={c} />
          <path d="M14 22c0-4 4-6 10-6s10 2 10 6" stroke={W} strokeWidth="3" fill="none" opacity=".75" strokeLinecap="round" />
          <path d="M24 34v8" stroke={c} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'cleats':
    case 'skates':
      return (
        <>
          <path d="M8 14h13l3 8c6 1 13 3 16 6 2 2 1 6-2 6H8Z" fill={kind === 'skates' ? '#1f2633' : c} />
          <path d="M8 34h32" stroke={D} strokeWidth="2" opacity=".4" />
          {kind === 'skates' ? (
            <path d="M6 40h36M12 34v6M34 34v6" stroke="#9aa4b4" strokeWidth="2.4" strokeLinecap="round" />
          ) : (
            <path d="M11 34v4M17 34v4M23 34v4M29 34v4M35 34v4" stroke={D} strokeWidth="2.4" strokeLinecap="round" opacity=".75" />
          )}
          <path d="M14 22l12 6M12 26l10 5" stroke={W} strokeWidth="2" opacity=".75" strokeLinecap="round" />
        </>
      );
    case 'gloves':
      return (
        <>
          <path d="M14 42V24l-4-6c-1-2 1-4 3-3l4 4V9c0-2 3-2 3 0v10V7c0-2 3-2 3 0v12V8c0-2 3-2 3 0v11V11c0-2 3-2 3 0v17c0 8-4 14-11 14Z" fill={c} />
          <path d="M14 36h14" stroke={W} strokeWidth="2.4" opacity=".7" />
        </>
      );
    case 'mitt':
      return (
        <>
          <path d="M10 26c-3-8 0-18 9-20 5-1 9 1 11 4 5-2 10 1 10 6 0 9-6 22-17 24-7 1-11-6-13-14Z" fill="#b7793f" />
          <path d="M16 12c3 6 4 14 2 22M24 10c2 7 2 16 0 24" stroke="#7c4a1d" strokeWidth="1.8" fill="none" />
          <circle cx="31" cy="27" r="6" fill={W} stroke="#d1d5db" />
          <path d="M27 24c2 2 2 5 0 7M35 24c-2 2-2 5 0 7" stroke="#dc2626" strokeWidth="1.2" fill="none" />
        </>
      );
    case 'bat':
      return (
        <>
          <path d="M11 40l20-24c2-3 5-6 8-8 2-1 4 1 3 3-2 3-5 6-8 8L11 41" fill="#c8a16a" stroke="#9a7440" strokeWidth="1" />
          <path d="M9 42l3-3" stroke={c} strokeWidth="5" strokeLinecap="round" />
        </>
      );
    case 'stick':
      return (
        <>
          <path d="M30 4l-12 34" stroke="#2a2f3a" strokeWidth="4" strokeLinecap="round" />
          <path d="M18 36l-2 6c0 1 1 2 2 2h18c2 0 2-3 0-3l-14-3Z" fill="#2a2f3a" />
          <path d="M26 14l-3 9" stroke={c} strokeWidth="5" />
        </>
      );
    case 'lax':
      return (
        <>
          <path d="M14 44l14-30" stroke="#2a2f3a" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M27 15c-3-6 1-12 7-12s9 5 6 11c-2 3-5 4-8 4Z" fill="none" stroke={c} strokeWidth="3" />
          <path d="M30 6l6 9M35 4l-1 13M28 11l12 1" stroke="#cbd5e1" strokeWidth="1.2" />
        </>
      );
    case 'mask':
      return (
        <>
          <path d="M10 18c0-8 6-13 14-13s14 5 14 13v10c0 8-6 15-14 15S10 36 10 28Z" fill={c} />
          <path d="M15 20h18v10c0 5-4 9-9 9s-9-4-9-9Z" fill="none" stroke="#cbd5e1" strokeWidth="2.4" />
          <path d="M15 26h18M24 20v19" stroke="#cbd5e1" strokeWidth="2.4" />
        </>
      );
    case 'sled':
      return (
        <>
          <path d="M4 38h40l-4 4H8Z" fill="#475569" />
          <path d="M10 38V14c0-2 2-4 4-4h6c2 0 3 2 3 4v24M27 38V14c0-2 2-4 4-4h6c2 0 3 2 3 4v24" fill={c} />
          <path d="M14 16h5M31 16h5" stroke={W} strokeWidth="2.4" opacity=".7" />
          <path d="M6 32h36" stroke="#94a3b8" strokeWidth="3" />
        </>
      );
    case 'brace':
      return (
        <>
          <path d="M16 4h16v40H16Z" fill="#e2e8f0" />
          <path d="M16 12h16M16 36h16" stroke={c} strokeWidth="5" />
          <path d="M13 6v36M35 6v36" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
          <circle cx="13" cy="24" r="3.4" fill={c} />
          <circle cx="35" cy="24" r="3.4" fill={c} />
          <circle cx="24" cy="24" r="4" fill="none" stroke="#94a3b8" strokeWidth="2" />
        </>
      );
    case 'net':
      return (
        <>
          <path d="M8 40V10h32v30" fill="none" stroke={c} strokeWidth="3.4" strokeLinejoin="round" />
          <path d="M8 18h32M8 26h32M8 34h32M16 10v30M24 10v30M32 10v30" stroke="#94a3b8" strokeWidth="1.2" />
          <path d="M4 40h40" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'bag':
      return (
        <>
          <path d="M6 18c0-2 2-4 4-4h28c2 0 4 2 4 4v18c0 2-2 4-4 4H10c-2 0-4-2-4-4Z" fill={c} />
          <path d="M17 14c0-4 3-6 7-6s7 2 7 6" stroke={D} strokeWidth="2.6" fill="none" opacity=".55" />
          <path d="M6 24h36" stroke={W} strokeWidth="2" opacity=".6" />
        </>
      );
    case 'shin':
    case 'elbow':
      return (
        <>
          <path d="M15 6h18c2 0 3 2 3 4l-3 28c0 3-3 5-6 5h-6c-3 0-6-2-6-5l-3-28c0-2 1-4 3-4Z" fill={c} />
          <path d="M18 14h12M18 22h12" stroke={W} strokeWidth="2.2" opacity=".6" />
          <ellipse cx="24" cy="33" rx="5" ry="4" fill={W} opacity=".4" />
        </>
      );
    case 'neck':
      return (
        <>
          <ellipse cx="24" cy="26" rx="17" ry="12" fill={c} />
          <ellipse cx="24" cy="24" rx="10" ry="6" fill="#f4f6fa" />
        </>
      );
    case 'fund':
      return (
        <>
          <path d="M24 40S8 31 8 19c0-5 4-9 9-9 3 0 5 1 7 4 2-3 4-4 7-4 5 0 9 4 9 9 0 12-16 21-16 21Z" fill={c} />
          <path d="M16 18c1-3 3-4 5-4" stroke={W} strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
        </>
      );
    default:
      return (
        <>
          <path d="M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10Z" fill={c} />
          <path d="M17 23l5 5 9-10" stroke={W} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
  }
}

/** A square tile with the gear drawing. `color` defaults to the team color, then the site blue. */
export function GearArt({ name, category, size = 48, color, className, tile = true }: { name: string; category?: string | null; size?: number; color?: string; className?: string; tile?: boolean }) {
  const c = color ?? 'var(--team, #1747d1)';
  const svg = (
    <svg aria-hidden viewBox="0 0 48 48" width={tile ? size * 0.66 : size} height={tile ? size * 0.66 : size}>
      {art(gearKind(name, category), c)}
    </svg>
  );
  if (!tile) return svg;
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[12px] bg-[var(--team-soft,#ebf1ff)] ring-1 ring-black/[0.04] ring-inset', className)}
      style={{ width: size, height: size }}
    >
      {svg}
    </span>
  );
}
