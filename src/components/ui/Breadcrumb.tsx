import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from './cn';

export function Breadcrumb({ items, tone = 'dark' }: { items: { label: string; href?: string }[]; tone?: 'dark' | 'light' }) {
  const light = tone === 'light';
  return (
    <nav aria-label="Breadcrumb" className="text-[14px] leading-5 font-medium">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight aria-hidden size={14} className={light ? 'text-white/60' : 'text-ink-meta'} />}
            {it.href && i < items.length - 1 ? (
              <Link href={it.href} className={cn('no-underline hover:underline', light ? 'text-white/85 hover:text-white' : 'text-ink-meta hover:text-primary')}>
                {it.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined} className={light ? 'text-white' : 'text-ink'}>
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
