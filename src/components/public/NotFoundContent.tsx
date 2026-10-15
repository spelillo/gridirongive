import Link from 'next/link';
import { SearchField } from './SearchField';
import { CodeEntryLink } from './CodeEntryLink';

/** 404 body (ui-ux-spec 10.2): one plain line, search, and a way home. */
export function NotFoundContent() {
  return (
    <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-6 py-12 md:py-20">
      <div className="flex flex-col gap-2">
        <h1 className="t-hero">We can&apos;t find that page.</h1>
        <p className="t-body">The link may be wrong, or the page was removed. Search for a team instead.</p>
      </div>
      <SearchField size="lg" showButton label="Search by school, team, or town" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/" className="inline-flex min-h-11 items-center text-[16px]">
          Go to the home page
        </Link>
        <CodeEntryLink />
      </div>
    </div>
  );
}
