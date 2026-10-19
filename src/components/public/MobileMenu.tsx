'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Menu, Search, KeyRound } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { SearchField } from './SearchField';
import { CodeEntryForm } from './CodeEntry';

export function MobileMenu({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [code, setCode] = useState(false);
  const item = 'flex min-h-12 items-center rounded-[10px] px-3 text-[16px] font-medium text-ink no-underline hover:bg-chrome';
  return (
    <>
      <button type="button" aria-label="Search teams" onClick={() => setSearch(true)} className="inline-flex size-11 items-center justify-center rounded-full text-ink-nav hover:bg-chrome">
        <Search size={22} strokeWidth={1.75} aria-hidden />
      </button>
      <button type="button" aria-label="Menu" onClick={() => setMenu(true)} className="inline-flex size-11 items-center justify-center rounded-full text-ink-nav hover:bg-chrome">
        <Menu size={22} strokeWidth={1.75} aria-hidden />
      </button>
      <Sheet open={search} onClose={() => setSearch(false)} title="Find a team">
        <SearchField size="lg" autoFocus onNavigate={() => setSearch(false)} />
      </Sheet>
      <Sheet open={code} onClose={() => setCode(false)} title="Enter a team code">
        <CodeEntryForm onDone={() => setCode(false)} />
      </Sheet>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <nav aria-label="Mobile">
          <ul className="flex flex-col gap-0.5">
            <li>
              <button type="button" className={`${item} w-full gap-3 text-left`} onClick={() => { setMenu(false); setSearch(true); }}>
                <Search size={20} aria-hidden className="text-ink-nav" /> Search
              </button>
            </li>
            <li>
              <button type="button" className={`${item} w-full gap-3 text-left`} onClick={() => { setMenu(false); setCode(true); }}>
                <KeyRound size={20} aria-hidden className="text-ink-nav" /> Enter a team code
              </button>
            </li>
            <li><Link className={item} href="/search" onClick={() => setMenu(false)}>Find a team</Link></li>
            <li><Link className={item} href="/for-teams" onClick={() => setMenu(false)}>For coaches</Link></li>
            {signedIn ? (
              <>
                <li><Link className={item} href="/app" onClick={() => setMenu(false)}>My dashboard</Link></li>
                <li><Link className={item} href="/app/notifications" onClick={() => setMenu(false)}>Notifications</Link></li>
                <li><Link className={item} href="/app/account" onClick={() => setMenu(false)}>Account settings</Link></li>
                {isAdmin && <li><Link className={item} href="/admin" onClick={() => setMenu(false)}>Admin</Link></li>}
              </>
            ) : (
              <li><Link className={item} href="/sign-in" onClick={() => setMenu(false)}>Sign in</Link></li>
            )}
            <li><Link className={item} href="/help" onClick={() => setMenu(false)}>Help</Link></li>
            {signedIn && (
              <li className="mt-4 border-t border-hairline-soft px-3 pt-4">
                <form action="/auth/sign-out" method="post">
                  <button type="submit" className="min-h-11 text-[16px] text-error">Sign out</button>
                </form>
              </li>
            )}
          </ul>
        </nav>
      </Sheet>
    </>
  );
}
