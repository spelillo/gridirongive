import type { Metadata } from 'next';
import Link from 'next/link';
import { Link2Off } from 'lucide-react';
import { CodeEntryForm } from '@/components/public/CodeEntry';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Link expired', robots: { index: false, follow: false } };

/** Where expired or replaced share and invite links land (ui-ux-spec 11 edge cases). */
export default function LinkExpiredPage() {
  return (
    <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-8 py-8 md:py-12">
      <header className="flex flex-col gap-3">
        <Link2Off aria-hidden size={28} strokeWidth={1.75} className="text-ink-nav" />
        <h1 className="t-hero">This link no longer works</h1>
        <p className="t-body">
          The team may have changed its code, which replaces old links, or the link was copied only in part. Invite links also expire after 30 days.
        </p>
      </header>

      <section aria-labelledby="code-h" className="flex flex-col gap-3 rounded-lg bg-chrome p-5 md:p-6">
        <h2 id="code-h" className="t-subhead">
          Have the team code?
        </h2>
        <CodeEntryForm />
      </section>

      <section aria-labelledby="next-h" className="flex flex-col gap-3">
        <h2 id="next-h" className="t-subhead">
          Other ways in
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-6 text-[16px] leading-6 text-ink-body">
          <li>Ask the coach, the player or the player&apos;s family for the new code or a new link.</li>
          <li>
            Got an invite by email? Open the newest one. If it expired, open it anyway and ask the coach to resend it. We pass the message on without sharing your email.
          </li>
          <li>
            Already set up? <Link href="/sign-in" className="underline">Sign in</Link> to reach your team or player page.
          </li>
          <li>You can still find the team and give to its team fund without a code.</li>
        </ul>
        <div className="pt-1">
          <ButtonLink href="/search" variant="secondary" fullMobile>
            Search teams
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
