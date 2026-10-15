import type { Metadata } from 'next';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { DEMO } from '@/lib/db/demo-seed';
import { mode } from '@/lib/env';
import { getUser } from '@/lib/auth/session';
import { DocPage, DocSection } from '@/components/public/DocPage';
import { Banner } from '@/components/ui/Banner';
import { CopyButton } from '@/components/ui/CopyButton';

export const metadata: Metadata = { title: 'Demo guide', robots: { index: false, follow: false } };

type Email = (typeof DEMO.accounts)[number]['email'];

/** What to try as each seeded person. Keyed by email so a renamed account still lines up. */
const TRY: Record<Email, { start: string; steps: string[] }> = {
  'coach.alex@example.com': {
    start: '/app',
    steps: [
      'Open the team overview and see what needs action.',
      'Approve a profile or a supporter message in Approvals.',
      'Check the buy list, then log a purchase with a receipt photo.',
      'Look at Donations and export them as CSV.',
      'Open the share kit and change the team code.',
    ],
  },
  'jordan.lee@example.com': {
    start: '/app',
    steps: ['Manage the roster and approvals like the head coach.', 'Notice that payout settings and deleting the team are not available to staff.'],
  },
  'pat.smith@example.com': {
    start: '/app',
    steps: [
      "Review the consent for Jayden's page and change a privacy choice.",
      'Hide the page, then show it again, from Profile and privacy.',
      "See Jayden's supporters and approve a thank-you note.",
    ],
  },
  'jayden.smith@example.com': {
    start: '/app',
    steps: ['See your gear and what has been funded.', 'Move the gear markers on your photo.', 'Write a thank-you note to supporters.', 'Copy your personal share link.'],
  },
  'coach.riley@example.com': {
    start: '/app',
    steps: ['Finish setting up the draft Hillcrest team.', 'Import a roster and apply a gear template.', 'Try to publish and see what is still required.'],
  },
  'admin@example.com': {
    start: '/app',
    steps: ['Review the team verification queue.', 'Look at reports and moderation.', 'Find a donation and see how refunds work.'],
  },
};

const DECLINES = [
  { number: '4000 0000 0000 0002', result: 'Card declined' },
  { number: '4000 0000 0000 9995', result: 'Insufficient funds' },
  { number: '4000 0000 0000 0069', result: 'Expired card' },
];

const toc = [
  { id: 'donor', label: 'Give as a visitor' },
  { id: 'accounts', label: 'Sign in as someone' },
  { id: 'invites', label: 'Accept an invite' },
  { id: 'email', label: 'Emails' },
];

export default async function DemoPage() {
  if (!mode.demo) {
    return (
      <DocPage title="Demo guide" intro={<p>The demo isn&apos;t available on this site. It only runs in demo mode, with sample data and no real payments.</p>}>
        <p className="t-body">
          Looking for a team? <Link href="/search">Search teams</Link>. Running a team? <Link href="/for-teams">See how it works for teams</Link>.
        </p>
      </DocPage>
    );
  }

  const user = await getUser();
  const simulated = mode.payments === 'simulated';
  return (
    <DocPage
      title="Demo guide"
      intro={<p>Everything here is sample data. No real money moves, and every email lands in the on-site outbox. Try the site as a donor, a coach, a parent or a player.</p>}
      toc={toc}
      aside={user ? <Banner tone="info">You&apos;re signed in as {user.email}. Signing in as someone else below switches accounts.</Banner> : undefined}
    >
      <DocSection id="donor" title="Give as a visitor">
        <ol>
          <li>
            Open <Link href={`/t/${DEMO.teamSlug}`}>Central High Varsity Football</Link>, or find it with search.
          </li>
          <li>
            Enter the team code{' '}
            <span className="inline-flex items-center gap-2 align-middle">
              <code className="rounded-sm bg-chrome px-2 py-0.5 font-mono text-[15px] tracking-[0.15em] text-ink">{DEMO.teamCode}</code>
              <CopyButton value={DEMO.teamCode} label="Copy code" variant="tertiary" />
            </span>{' '}
            to see the roster.
          </li>
          <li>Pick a player, choose a piece of gear and give.</li>
          <li>
            {simulated ? (
              <>Pay with any card number. These numbers show what happens when a payment fails:</>
            ) : (
              <>Checkout uses Stripe test mode. Pay with 4242 4242 4242 4242, any future date and any CVC. These numbers show what happens when a payment fails:</>
            )}
          </li>
        </ol>
        <div className="overflow-x-auto">
          <table className="w-full max-w-md border-collapse text-left text-[15px] leading-[22px]">
            <caption className="sr-only">Test card numbers that fail</caption>
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className="py-2 pr-4 font-medium text-ink">
                  Card number
                </th>
                <th scope="col" className="py-2 font-medium text-ink">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {DECLINES.map((d) => (
                <tr key={d.number} className="border-b border-hairline-soft">
                  <td className="py-2 pr-4 font-mono tabular whitespace-nowrap">{d.number}</td>
                  <td className="py-2">{d.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{simulated ? 'Every other card number succeeds.' : 'Other Stripe test cards behave as Stripe documents them.'} After paying you land on the thank-you page, and the receipt arrives in the outbox.</p>
      </DocSection>

      <DocSection id="accounts" title="Sign in as someone">
        <p>One click signs you in. No email needed.</p>
        <ul className="list-none! gap-0! pl-0! divide-y divide-hairline-soft rounded-md border border-hairline-soft">
          {DEMO.accounts.map((a) => {
            const t = TRY[a.email];
            return (
              <li key={a.email} className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between md:gap-6">
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="mt-0!">{a.name}</h3>
                  <p className="t-caption">{a.label}</p>
                  {t && (
                    <ul className="mt-1 list-disc! pl-5! text-[15px] leading-[22px]">
                      {t.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <form action="/api/auth/demo" method="post" className="shrink-0">
                  <input type="hidden" name="email" value={a.email} />
                  <input type="hidden" name="next" value={t?.start ?? '/app'} />
                  <button
                    type="submit"
                    aria-label={`Sign in as ${a.name}`}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-hairline bg-canvas px-4 py-3 font-medium text-primary-deep hover:bg-band-blue md:w-auto"
                  >
                    <LogIn aria-hidden size={18} strokeWidth={1.75} />
                    Sign in
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </DocSection>

      <DocSection id="invites" title="Accept an invite">
        <p>Coaches invite players and parents by email. These sample invites are waiting for Owen&apos;s family:</p>
        <ul>
          <li>
            <Link href={`/invite/${DEMO.inviteTokens.guardian}`}>Open the parent invite</Link> to see guardian consent and profile setup.
          </li>
          <li>
            <Link href={`/invite/${DEMO.inviteTokens.athlete}`}>Open the player invite</Link> to see what a player gets.
          </li>
        </ul>
        <p>Sign in with any email on the invite page. The sign-in code shows up in the outbox.</p>
      </DocSection>

      <DocSection id="email" title="Emails">
        <p>
          Receipts, invites, sign-in links and updates are kept in the <Link href="/dev/outbox">outbox</Link> instead of being sent.
        </p>
      </DocSection>
    </DocPage>
  );
}
