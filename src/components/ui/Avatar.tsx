import { initials } from '@/lib/domain/names';
import { cn } from './cn';

/** Circles are allowed for people only (ui-ux-spec 3). */
export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-band font-medium text-ink', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {src ? <img src={src} alt="" width={size} height={size} className="size-full object-cover" loading="lazy" /> : initials(name)}
    </span>
  );
}
