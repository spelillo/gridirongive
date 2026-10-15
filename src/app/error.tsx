'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

/**
 * Last-resort error boundary for every page under the root layout. It can't
 * render the server nav bar, so it shows a plain wordmark bar instead.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="h-[60px] bg-chrome">
        <div className="page-x mx-auto flex h-full max-w-[1440px] items-center">
          <Link href="/" className="text-[18px] font-medium text-ink no-underline md:text-[20px]">
            Gridiron Give
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-6 py-12 md:py-20">
          <div className="flex flex-col gap-2">
            <h1 className="t-hero">Something went wrong.</h1>
            <p className="t-body" role="alert">
              This page didn&apos;t load. Try again. If it keeps happening, wait a minute and reload.
            </p>
            {error.digest && <p className="t-caption">Reference: {error.digest}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button onClick={() => retry()}>Try again</Button>
            <Link href="/" className="inline-flex min-h-11 items-center text-[16px]">
              Go to the home page
            </Link>
            <Link href="/help" className="inline-flex min-h-11 items-center text-[16px]">
              Help
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
