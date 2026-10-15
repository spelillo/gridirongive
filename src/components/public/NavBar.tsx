import Link from 'next/link';
import { getUser } from '@/lib/auth/session';
import { NavSearch } from './NavSearch';
import { MobileMenu } from './MobileMenu';
import { AccountMenu } from '@/components/app/AccountMenu';

/** 60px chrome bar (ui-ux-spec 4.1). */
export async function NavBar({ hideSearch }: { hideSearch?: boolean }) {
  const user = await getUser();
  return (
    <header className="no-print sticky top-0 z-40 h-[60px] bg-chrome">
      <div className="page-x mx-auto flex h-full max-w-[1440px] items-center gap-4">
        <Link href="/" className="shrink-0 text-[18px] font-medium text-ink no-underline md:text-[20px]">
          Gridiron Give
        </Link>
        <div className="hidden flex-1 justify-center lg:flex">{!hideSearch && <NavSearch />}</div>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-6 lg:flex">
          <Link href="/for-teams" className="t-nav no-underline hover:text-primary">
            For teams
          </Link>
          {user ? (
            <AccountMenu user={{ email: user.email, name: user.fullName, isAdmin: user.isAdmin }} />
          ) : (
            <Link href="/sign-in" className="t-nav no-underline hover:text-primary">
              Sign in
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center lg:hidden">
          <MobileMenu signedIn={Boolean(user)} isAdmin={Boolean(user?.isAdmin)} />
        </div>
      </div>
    </header>
  );
}
