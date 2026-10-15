'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';

const LINKS = [
  { href: '/search', label: 'Find a team' },
  { href: '/for-teams', label: 'For coaches' },
  { href: '/help', label: 'Help' },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {LINKS.map((l) => {
        const on = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-10 items-center rounded-full px-3.5 text-[14.5px] font-medium no-underline transition-colors',
              on ? 'bg-chrome text-ink' : 'text-ink-nav hover:bg-chrome hover:text-ink',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
