import Link from 'next/link';
import { Bell } from 'lucide-react';
import { AccountMenu } from './AccountMenu';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { DemoBanner } from '@/components/public/DemoBanner';
import { sys } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';

/** App chrome (ui-ux-spec 4.2): 64px top bar with notifications and the account menu. */
export async function AppShell({ user, children, switcher }: { user: SessionUser; children: React.ReactNode; switcher?: React.ReactNode }) {
  const unread = await sys.one<{ n: number }>(`select count(*)::int as n from notifications where user_id = $1 and in_app and read_at is null`, [user.id]);
  const n = unread?.n ?? 0;
  return (
    <div className="flex min-h-dvh flex-col bg-chrome">
      <DemoBanner />
      <header className="no-print sticky top-0 z-40 h-16 border-b border-hairline-soft bg-canvas/90 backdrop-blur-md">
        <div className="flex h-full items-center gap-3 px-4 lg:px-6">
          <Link href="/app" className="shrink-0 rounded-md no-underline" aria-label="Gridiron Give, your dashboard">
            <span className="hidden sm:block">
              <Logo />
            </span>
            <span className="sm:hidden">
              <LogoMark size={32} />
            </span>
          </Link>
          {switcher && <div className="min-w-0 flex-1 lg:ml-6">{switcher}</div>}
          <div className="ml-auto flex items-center gap-1">
            <Link href="/app/notifications" className="relative flex size-11 items-center justify-center rounded-full text-ink-nav no-underline hover:bg-chrome">
              <Bell size={22} strokeWidth={1.75} aria-hidden />
              <span className="sr-only">Notifications{n ? `, ${n} unread` : ''}</span>
              {n > 0 && (
                <span aria-hidden className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-error px-1 text-center text-[11px] leading-[18px] font-medium text-white tabular">
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </Link>
            <AccountMenu user={{ email: user.email, name: user.fullName, isAdmin: user.isAdmin }} />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

/** Content column next to the sidebar; leaves room for the mobile tab bar. */
export function AppMain({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
      <div className={`mx-auto w-full px-4 pb-28 pt-6 md:px-6 lg:px-8 lg:pb-12 lg:pt-8 ${wide ? 'max-w-[1280px]' : 'max-w-[1040px]'}`}>{children}</div>
    </main>
  );
}
