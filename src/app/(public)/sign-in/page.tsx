import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser, safeNext } from '@/lib/auth/session';
import { mode } from '@/lib/env';
import { DEMO } from '@/lib/db/demo-seed';
import { Banner } from '@/components/ui/Banner';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string; error?: string; email?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const { next: rawNext, error, email } = await searchParams;
  const next = safeNext(rawNext);
  if (await getUser()) redirect(next);
  return (
    <div className="page-x mx-auto flex w-full max-w-[440px] flex-col gap-6 py-10 md:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="t-section">Sign in</h1>
        <p className="t-body">We&apos;ll email you a link and a code. No password needed.</p>
      </div>
      {error === 'link' && <Banner tone="warn">That sign-in link expired or was already used. Request a new one.</Banner>}
      <SignInForm next={next} initialEmail={email ?? ''} demo={mode.demo} />
      <p className="t-caption">
        Coaches setting up a team for the first time start here too. New to Gridiron Give? <Link href="/for-teams">See how it works for teams</Link>.
      </p>
      {mode.demo && (
        <section aria-labelledby="demo-h" className="flex flex-col gap-3 border-t border-hairline-soft pt-6">
          <h2 id="demo-h" className="t-subhead">
            Demo accounts
          </h2>
          <p className="t-caption">Sign straight in as one of the sample people. Nothing here is real.</p>
          <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {DEMO.accounts.map((a) => (
              <li key={a.email}>
                <form action="/api/auth/demo" method="post">
                  <input type="hidden" name="email" value={a.email} />
                  <input type="hidden" name="next" value={rawNext ? next : ''} />
                  <button type="submit" className="flex min-h-14 w-full flex-col items-start px-4 py-2.5 text-left hover:bg-band focus-visible:bg-band">
                    <span className="text-[15px] font-medium text-ink">{a.name}</span>
                    <span className="t-caption">{a.label}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="t-caption">
            Emails in demo mode land in the <Link href="/dev/outbox">outbox</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
