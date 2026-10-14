'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

export function AccountMenu({ user }: { user: { email: string; name: string | null; isAdmin: boolean } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const item = 'flex min-h-11 items-center px-4 text-[15px] text-ink-list no-underline hover:bg-band-blue hover:text-ink';
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 items-center gap-2 rounded-md px-1 text-ink-nav hover:bg-band">
        <Avatar name={user.name || user.email} size={32} />
        <span className="sr-only">Account menu for {user.email}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-hairline-soft bg-canvas py-1 shadow-pop">
          <p className="truncate px-4 py-2 text-[13px] text-ink-meta">{user.email}</p>
          <Link role="menuitem" href="/app" className={item} onClick={() => setOpen(false)}>My dashboard</Link>
          <Link role="menuitem" href="/app/notifications" className={item} onClick={() => setOpen(false)}>Notifications</Link>
          <Link role="menuitem" href="/app/donor" className={item} onClick={() => setOpen(false)}>My gifts</Link>
          <Link role="menuitem" href="/app/account" className={item} onClick={() => setOpen(false)}>Account settings</Link>
          {user.isAdmin && <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}>Admin</Link>}
          <div className="my-1 border-t border-hairline-soft" />
          <form action="/auth/sign-out" method="post">
            <button role="menuitem" type="submit" className="flex min-h-11 w-full items-center px-4 text-left text-[15px] text-error hover:bg-error-bg">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
