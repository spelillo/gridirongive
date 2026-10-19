import { cn } from './cn';

/** The mark: a laced ball in a rounded square. Decorative; the wordmark carries the name. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  // The gradient is CSS rather than an SVG <defs> id, so several marks on a page (some hidden) never clash.
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 bg-[linear-gradient(135deg,#2a5cf0,#0a1a4a)]', className)}
      style={{ width: size, height: size, borderRadius: (size * 9) / 32 }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32">
        <g transform="rotate(-35 16 16)">
          <path d="M5 16 C9 9.5 23 9.5 27 16 C23 22.5 9 22.5 5 16Z" fill="#fff" />
          <path d="M11 16 H21" stroke="#0f2a78" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M13 14.2 V17.8 M15.7 14.2 V17.8 M18.3 14.2 V17.8" stroke="#0f2a78" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      </svg>
    </span>
  );
}

export function Logo({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('text-[18px] font-bold tracking-[-0.02em] md:text-[19px]', tone === 'light' ? 'text-white' : 'text-ink')}>Gridiron Give</span>
    </span>
  );
}
