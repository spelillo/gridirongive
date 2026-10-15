'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, ClipboardCheck, Receipt, ShoppingCart, Landmark, Share2, Settings, MoreHorizontal, Home, Shirt, Heart, UserRound, X,
  ShieldCheck, Building2, Flag, BookOpen, Inbox, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  count?: number;
  /** Exact match only (for index routes). */
  exact?: boolean;
}

const ICONS = {
  overview: LayoutDashboard, roster: Users, approvals: ClipboardCheck, donations: Receipt, purchases: ShoppingCart, payouts: Landmark,
  share: Share2, settings: Settings, home: Home, gear: Shirt, supporters: Heart, profile: UserRound, verify: ShieldCheck, teams: Building2,
  flag: Flag, catalog: BookOpen, inbox: Inbox,
} satisfies Record<string, LucideIcon>;

function isActive(path: string, item: NavItem) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

/**
 * App navigation (ui-ux-spec 4.2): a left sidebar on desktop, and on mobile
 * a bottom tab bar with at most five items. Extra items move under More.
 */
export function AppNav({ items, mobileTabs = 5, label }: { items: NavItem[]; mobileTabs?: number; label: string }) {
  const path = usePathname();
  // The More sheet is tied to the page it was opened on, so navigating closes it.
  const [moreOn, setMoreOn] = useState<string | null>(null);
  const more = moreOn === path;
  const setMore = (v: boolean | ((m: boolean) => boolean)) => setMoreOn((typeof v === 'function' ? v(more) : v) ? path : null);
  const overflow = items.length > mobileTabs;
  const tabs = overflow ? items.slice(0, mobileTabs - 1) : items;
  const rest = overflow ? items.slice(mobileTabs - 1) : [];
  const moreActive = rest.some((i) => isActive(path, i));

  return (
    <>
      <nav aria-label={label} className="no-print hidden w-64 shrink-0 border-r border-hairline-soft bg-canvas lg:block">
        <ul className="sticky top-16 flex flex-col gap-0.5 p-3">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const on = isActive(path, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] no-underline',
                    on ? 'bg-band-blue font-semibold text-ink' : 'text-ink-list hover:bg-chrome hover:text-ink',
                  )}
                >
                  <Icon size={20} strokeWidth={1.75} aria-hidden className={on ? 'text-primary' : 'text-ink-meta'} />
                  <span className="flex-1">{item.label}</span>
                  {item.count ? <Count n={item.count} /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label={label} className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-hairline-soft bg-canvas/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(11,18,32,0.06)] backdrop-blur-md lg:hidden">
        <ul className="flex h-16">
          {tabs.map((item) => (
            <Tab key={item.href} item={item} active={isActive(path, item)} />
          ))}
          {overflow && (
            <li className="flex-1">
              <button
                type="button"
                aria-expanded={more}
                onClick={() => setMore((m) => !m)}
                className={cn('flex h-full w-full flex-col items-center justify-center gap-0.5 text-[12px]', moreActive || more ? 'text-primary' : 'text-ink-nav')}
              >
                <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden />
                More
              </button>
            </li>
          )}
        </ul>
      </nav>
      {more && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] bg-canvas pb-[calc(64px+env(safe-area-inset-bottom))]" style={{ animation: 'gg-sheet-in 200ms ease-out' }}>
            <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-2">
              <p className="t-subhead">More</p>
              <button type="button" aria-label="Close" onClick={() => setMore(false)} className="flex size-11 items-center justify-center rounded-md text-ink-nav hover:bg-band">
                <X size={20} aria-hidden />
              </button>
            </div>
            <ul className="py-1">
              {rest.map((item) => {
                const Icon = ICONS[item.icon];
                const on = isActive(path, item);
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={on ? 'page' : undefined} className={cn('flex min-h-12 items-center gap-3 px-4 text-[16px] no-underline', on ? 'font-medium text-primary' : 'text-ink-list')}>
                      <Icon size={20} strokeWidth={1.75} aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {item.count ? <Count n={item.count} /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <li className="flex-1">
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn('relative flex h-full flex-col items-center justify-center gap-1 text-[12px] no-underline', active ? 'font-semibold text-primary' : 'text-ink-nav')}
      >
        <span className={cn('relative flex h-7 w-14 items-center justify-center rounded-full', active && 'bg-band-blue')}>
          <Icon size={22} strokeWidth={1.75} aria-hidden />
          {item.count ? (
            <span className="absolute -right-0.5 -top-1.5 min-w-[18px] rounded-full bg-error px-1 text-center text-[11px] leading-[18px] font-medium text-white tabular">
              {item.count > 99 ? '99+' : item.count}
              <span className="sr-only"> waiting</span>
            </span>
          ) : null}
        </span>
        {item.label}
      </Link>
    </li>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-primary px-2 text-[12px] leading-5 font-medium text-white tabular">
      {n}
      <span className="sr-only"> waiting</span>
    </span>
  );
}
