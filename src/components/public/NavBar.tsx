import Link from 'next/link';
import { getUser } from '@/lib/auth/session';
import { NavSearch } from './NavSearch';
import { MobileMenu } from './MobileMenu';
import { CodeEntryLink } from './CodeEntryLink';
import { NavLinks } from './NavLinks';
import { AccountMenu } from '@/components/app/AccountMenu';
import { Logo } from '@/components/ui/Logo';

/** Sticky top bar: logo, team search, main links, team code and account. */
export async function NavBar({ hideSearch }: { hideSearch?: boolean }) {
  const user = await getUser();
  return (
    <header className="no-print sticky top-0 z-40 h-16 border-b border-hairline-soft/80 bg-canvas/90 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/80">
      <div className="page-x mx-auto flex h-full max-w-[1280px] items-center gap-6">
        <Link href="/" className="shrink-0 rounded-md no-underline" aria-label="Gridiron Give home">
          <Logo />
        </Link>
        <NavLinks />
        <div className="hidden min-w-0 flex-1 justify-end lg:flex">{!hideSearch && <div className="w-full max-w-sm"><NavSearch /></div>}</div>
        <div className="ml-auto hidden items-center gap-2 lg:ml-0 lg:flex">
          <CodeEntryLink
            bare
            label="Enter team code"
            className="inline-flex min-h-10 items-center rounded-full border border-[#cfd6e1] px-4 text-[14px] font-semibold text-ink no-underline hover:bg-chrome hover:text-ink hover:no-underline"
          />
          {user ? (
            <AccountMenu user={{ email: user.email, name: user.fullName, isAdmin: user.isAdmin }} />
          ) : (
            <Link href="/sign-in" className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-[14px] font-semibold text-white no-underline hover:bg-navy hover:text-white">
              Sign in
            </Link>
          )}
        </div>
        <div className="ml-auto flex items-center lg:hidden">
          <MobileMenu signedIn={Boolean(user)} isAdmin={Boolean(user?.isAdmin)} />
        </div>
      </div>
    </header>
  );
}
