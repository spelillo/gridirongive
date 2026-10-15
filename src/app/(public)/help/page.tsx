import type { Metadata } from 'next';
import Link from 'next/link';
import { DocPage } from '@/components/public/DocPage';
import { Disclosure } from '@/components/public/Collapsible';
import { CodeEntryLink } from '@/components/public/CodeEntryLink';
import { ButtonLink } from '@/components/ui/Button';
import { feeFormula } from '@/lib/fees-copy';
import { money } from '@/lib/domain/money';
import { MIN_GIFT_CENTS } from '@/config/fees';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Help',
  description: 'Answers for donors, families and coaches: fees, receipts, refunds, team codes, privacy and how to report a problem.',
  alternates: { canonical: '/help' },
};

const toc = [
  { id: 'donors', label: 'For donors' },
  { id: 'families', label: 'For players and families' },
  { id: 'coaches', label: 'For coaches' },
  { id: 'report', label: 'Report a problem' },
  { id: 'contact', label: 'Contact' },
];

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[84px]">
      <h2 id={`${id}-h`} className="t-subhead mb-2">
        {title}
      </h2>
      <div className="border-t border-hairline-soft">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  const mail = (
    <a href={`mailto:${SITE.supportEmail}`} className="underline">
      {SITE.supportEmail}
    </a>
  );
  return (
    <DocPage title="Help" intro={<p>Short answers for donors, families and coaches. If you can&apos;t find what you need, email {mail}.</p>} toc={toc}>
      <Group id="donors" title="For donors">
        <Disclosure summary="How do I get a team code?">
          <p>Ask a coach, a player or a player&apos;s family. Codes are usually 6 letters and numbers. Links that players and coaches share have the code built in, so opening one unlocks the page for you.</p>
          <div>
            <CodeEntryLink label="Enter a team code" className="min-h-9" />
          </div>
        </Disclosure>
        <Disclosure summary="Why can't I search for a player by name?">
          <p>To protect minors. Search only finds teams. Player pages are visible to people with the team code or the player&apos;s own link, and they never appear in search engines.</p>
        </Disclosure>
        <Disclosure summary="What are the fees?">
          <p>{feeFormula()}.</p>
          <p>
            You can cover the fees at checkout so the player gets the full amount. That box is on by default and shows the exact amount. The smallest gift is{' '}
            {money(MIN_GIFT_CENTS).replace(/\.00$/, '')}. <Link href="/for-teams#fees">See a worked example</Link>.
          </p>
        </Disclosure>
        <Disclosure summary="Where does my money go?">
          <p>
            To the team&apos;s account through Stripe, earmarked for the player and item you chose. Money never goes to a player directly. The coach buys the gear and logs the
            receipt, and you get an email when it&apos;s purchased.
          </p>
        </Disclosure>
        <Disclosure summary="Is my gift tax deductible?">
          {SITE.taxDeductibleReceipts ? (
            <p>
              Only when the team&apos;s school or booster club is a registered tax-exempt organization. Your receipt says so and shows its EIN when it applies. Otherwise the
              receipt is not a tax receipt.
            </p>
          ) : (
            <p>No. Gridiron Give is not a charity, and receipts are not tax receipts. Keep them for your records.</p>
          )}
        </Disclosure>
        <Disclosure summary="Where is my receipt?">
          <p>We email it as soon as the payment goes through. The email has a link to a printable copy. Check your spam folder if you don&apos;t see it within a few minutes.</p>
        </Disclosure>
        <Disclosure summary="Can I give without my name on the page?">
          <p>Yes. Uncheck the option to show your name and the page shows &quot;A supporter&quot;. The coach still sees your name for the team&apos;s records, and you still get a receipt.</p>
        </Disclosure>
        <Disclosure summary="Do I need an account?">
          <p>No. Giving works without one. An account only adds a history of your gifts and receipts.</p>
        </Disclosure>
        <Disclosure summary="How do I get a refund?">
          <p>
            Refunds are handled by Gridiron Give admins, not by coaches. Email {mail} with the email address you used and the date of the gift. If part of your gift moved to the
            team fund, you can ask for that part back within 30 days.
          </p>
        </Disclosure>
        <Disclosure summary="Someone funded the same item while I was paying. What happened?">
          <p>An item can&apos;t take more than what&apos;s left on it. Any extra goes to the team fund, and we email you. Reply within 30 days if you want that part refunded instead.</p>
        </Disclosure>
      </Group>

      <Group id="families" title="For players and families">
        <Disclosure summary="What will people see about my child?">
          <p>
            Only after a parent or guardian gives consent: first name and last initial, jersey number, position, grade, photo, bio and gear list. Never an email, phone,
            address, birthdate or school ID. Read the full <Link href="/guardian-consent">guardian consent policy</Link>.
          </p>
        </Disclosure>
        <Disclosure summary="Who can see my child's page?">
          <p>People with the team code, and anyone you or your child send the personal link to. Player pages are not in search engines and don&apos;t show in link previews.</p>
        </Disclosure>
        <Disclosure summary="My child is under 13. How does it work?">
          <p>A parent or guardian sets up and manages the page. Players under 13 can&apos;t edit their own profile.</p>
        </Disclosure>
        <Disclosure summary="How do I hide or delete the page?">
          <p>
            Sign in and open Profile and privacy. You can hide the page, delete the photo, withdraw consent or delete the profile at any time. Withdrawing consent hides the page
            right away. Money already given stays earmarked for your child&apos;s gear.
          </p>
        </Disclosure>
        <Disclosure summary="My invite link doesn't work.">
          <p>
            Invites work for 30 days. Open the link again and use the button that asks the coach to resend it, or contact the coach directly. <Link href="/link-expired">More about expired links</Link>.
          </p>
        </Disclosure>
        <Disclosure summary="Can my child see donors' emails?">
          <p>No. Players see supporter names (or &quot;A supporter&quot;) and messages. Thank-you notes are sent by Gridiron Give, so donor emails stay private.</p>
        </Disclosure>
      </Group>

      <Group id="coaches" title="For coaches">
        <Disclosure summary="How do I set up a team?">
          <p>
            <Link href="/app/manager/new">Start a team</Link> with your email. You&apos;ll add your school, verify that you coach the team, connect payouts through Stripe, and
            import your roster. <Link href="/for-teams">How it works for teams</Link>.
          </p>
        </Disclosure>
        <Disclosure summary="How does verification work?">
          <p>A school email address verifies the team right away. Otherwise upload a staff ID or a booster club letter, and an admin reviews it.</p>
        </Disclosure>
        <Disclosure summary="How do I change our team code?">
          <p>Open your team&apos;s share kit or settings and choose Change code. Old team links stop working right away.</p>
        </Disclosure>
        <Disclosure summary="When do we get paid?">
          <p>Stripe pays out to the bank account linked in your team&apos;s Stripe account on its regular schedule. Your Payouts page shows the history.</p>
        </Disclosure>
      </Group>

      <section id="report" aria-labelledby="report-h" className="scroll-mt-[84px] flex flex-col gap-3 border-t border-hairline-soft pt-6">
        <h2 id="report-h" className="t-subhead">
          Report a problem
        </h2>
        <p className="t-body">
          See something wrong on a team or player page, like personal details, an inappropriate photo or a team that doesn&apos;t look real? Tell us and an admin will review it.
        </p>
        <div>
          <ButtonLink href="/report" variant="secondary">
            Report a problem
          </ButtonLink>
        </div>
      </section>

      <section id="contact" aria-labelledby="contact-h" className="scroll-mt-[84px] flex flex-col gap-3 border-t border-hairline-soft pt-6">
        <h2 id="contact-h" className="t-subhead">
          Contact
        </h2>
        <p className="t-body">
          Email {mail}. For anything about a payment, include the email address you gave with and the date.
        </p>
      </section>
    </DocPage>
  );
}
