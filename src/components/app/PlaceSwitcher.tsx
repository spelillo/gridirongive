'use client';
import { useRouter } from 'next/navigation';

/** Team or athlete switcher in the app bar, shown when someone has more than one. */
export function PlaceSwitcher({ current, options, label }: { current: string; options: { href: string; label: string }[]; label: string }) {
  const router = useRouter();
  if (options.length < 2) {
    return <p className="truncate text-[15px] font-medium text-ink-list">{options[0]?.label}</p>;
  }
  return (
    <label className="flex min-w-0 items-center">
      <span className="sr-only">{label}</span>
      <select
        value={current}
        onChange={(e) => router.push(e.target.value)}
        className="h-10 max-w-full truncate rounded-md border border-hairline-soft bg-canvas pl-3 pr-8 text-[15px] font-medium text-ink"
      >
        {options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
