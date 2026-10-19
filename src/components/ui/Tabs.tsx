import Link from 'next/link';
import { cn } from './cn';

/** Link tabs. Inactive: 32px caption. Active: 44px subhead in primary with an underline (design file). */
export function Tabs({ tabs, active, label }: { tabs: { id: string; label: string; href: string; count?: number }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-hairline-soft px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max items-end gap-6">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.href}
                aria-current={on ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'flex items-center gap-2 border-b-2 no-underline',
                  on ? 'h-11 border-primary text-[15px] font-semibold text-ink' : 'h-11 border-transparent text-[15px] font-medium text-ink-meta hover:text-ink',
                )}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="rounded-full bg-band px-2 text-[12px] leading-5 font-semibold text-ink tabular">{t.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
