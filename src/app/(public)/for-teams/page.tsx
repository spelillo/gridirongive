import type { Metadata } from 'next';
import Link from 'next/link';
import { DocPage, DocSection } from '@/components/public/DocPage';
import { Disclosure } from '@/components/public/Collapsible';
import { ButtonLink } from '@/components/ui/Button';
import { feeExample, feeFormula } from '@/lib/fees-copy';
import { money } from '@/lib/domain/money';
import { FEES, MIN_GIFT_CENTS } from '@/config/fees';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'For teams',
  description: 'How Gridiron Give works for coaches: team pages, rosters behind a team code, gear lists, fees and payouts through Stripe.',
  alternates: { canonical: '/for-teams' },
};

const toc = [
  { id: 'what-you-get', label: 'What you get' },
  { id: 'fees', label: 'What it costs' },
  { id: 'what-you-need', label: 'What you need' },
  { id: 'privacy', label: 'How privacy works' },
  { id: 'payouts', label: 'How payouts work' },
  { id: 'faq', label: 'Questions' },
];

/** ui-ux-spec 5.10: plain sections, no cards. Fee numbers come from config/fees.ts. */
export default function ForTeamsPage() {
  const gift = 10000;
  const { covered, notCovered } = feeExample(gift);
  const pct = `${FEES.platformBasisPoints / 100}%`;
  const fixed = money(FEES.platformFixedCents).replace(/\.00$/, '');

  return (
    <DocPage
      title="Gridiron Give for teams"
      intro={<p>Set up a team page, invite your players, and let supporters fund the exact gear each player needs. You buy the gear and post the receipt, so donors see where their money went.</p>}
      toc={toc}
      aside={
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-6">
          <ButtonLink href="/app/manager/new" fullMobile>
            Set up a team
          </ButtonLink>
          <p className="t-body">
            Already set up? <Link href="/sign-in" className="underline">Sign in</Link>
          </p>
        </div>
      }
    >
      <DocSection id="what-you-get" title="What you get">
        <ul>
          <li>A public team page with your school, your story and your progress. It never lists players.</li>
          <li>A roster behind a team code. Each player has a page with a photo, a short bio and their own gear list.</li>
          <li>Gear templates by position, so every player starts with a sensible list they can trim.</li>
          <li>Invites for players and parents, guardian consent, and your approval before any player appears.</li>
          <li>A donations list with CSV export for your athletic director or booster club.</li>
          <li>A buy list of funded gear, a purchase log with receipt photos, and automatic updates to donors.</li>
          <li>Payouts to your school, booster club or team account through Stripe.</li>
        </ul>
      </DocSection>

      <DocSection id="fees" title="What it costs">
        <p>Nothing to set up. Fees are taken per gift: {feeFormula()}.</p>
        <p>
          Donors can cover the fees at checkout, and that box is on by default. When they do, the team gets the full gift. When they don&apos;t, the fees come out of the
          gift. The smallest gift is {money(MIN_GIFT_CENTS).replace(/\.00$/, '')}.
        </p>
        <h3>Example: a {money(gift).replace(/\.00$/, '')} gift</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-left text-[15px] leading-[22px]">
            <caption className="sr-only">Fees on a {money(gift)} gift</caption>
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className="py-2 pr-4 font-medium text-ink">
                  &nbsp;
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium text-ink">
                  Donor covers fees
                </th>
                <th scope="col" className="py-2 text-right font-medium text-ink">
                  Fees from the gift
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              <tr className="border-b border-hairline-soft">
                <th scope="row" className="py-2 pr-4 font-normal">
                  Donor pays
                </th>
                <td className="py-2 pr-4 text-right">{money(covered.totalCents)}</td>
                <td className="py-2 text-right">{money(notCovered.totalCents)}</td>
              </tr>
              <tr className="border-b border-hairline-soft">
                <th scope="row" className="py-2 pr-4 font-normal">
                  Gridiron Give fee ({fixed} + {pct})
                </th>
                <td className="py-2 pr-4 text-right">{money(covered.platformFeeCents)}</td>
                <td className="py-2 text-right">{money(notCovered.platformFeeCents)}</td>
              </tr>
              <tr className="border-b border-hairline-soft">
                <th scope="row" className="py-2 pr-4 font-normal">
                  Stripe card fee
                </th>
                <td className="py-2 pr-4 text-right">{money(covered.stripeFeeCents)}</td>
                <td className="py-2 text-right">{money(notCovered.stripeFeeCents)}</td>
              </tr>
              <tr>
                <th scope="row" className="py-2 pr-4 font-medium text-ink">
                  Team receives
                </th>
                <td className="py-2 pr-4 text-right font-medium text-ink">{money(covered.netCents)}</td>
                <td className="py-2 text-right font-medium text-ink">{money(notCovered.netCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="t-caption">When the donor covers fees, the total is rounded so the team never loses a cent. Any rounding comes out of the Gridiron Give fee.</p>
      </DocSection>

      <DocSection id="what-you-need" title="What you need">
        <ul>
          <li>
            <strong>Proof you coach the team.</strong> A school email address verifies the team right away. Otherwise upload a staff ID or a booster club letter and we
            review it.
          </li>
          <li>
            <strong>A bank account through Stripe.</strong> It belongs to the school, the booster club, or you as the team&apos;s custodian. Stripe checks identity and tax
            details.
          </li>
          <li>
            <strong>Your roster.</strong> A spreadsheet or CSV with first name, last name, position, grade, jersey number and a parent or guardian email. You can also
            paste a list or add players one at a time.
          </li>
        </ul>
        <p>You can build the whole team while verification is pending. The team goes live once it&apos;s verified and payouts are connected.</p>
      </DocSection>

      <DocSection id="privacy" title="How privacy works">
        <ul>
          <li>
            <strong>Team code.</strong> Anyone can find your team page. Only people with your team code, or a player&apos;s own link, can see the roster and player
            pages. You can change the code at any time, and old links stop working.
          </li>
          <li>
            <strong>Guardian consent.</strong> A parent or guardian gives consent before any player under 18 appears, even behind the code. Players under 13 have their
            page set up by a guardian.
          </li>
          <li>
            <strong>Your approval.</strong> You check each profile, photo and supporter message before it&apos;s shown.
          </li>
          <li>
            <strong>What players&apos; pages show.</strong> First name and last initial, number, position, grade, photo, bio and gear list. The full last name only if a
            guardian turns it on.
          </li>
          <li>
            <strong>What is never shown.</strong> Emails, phone numbers, addresses, birthdates and school IDs. Player names never appear in search, search engines or link
            previews.
          </li>
        </ul>
        <p>
          Read the <Link href="/guardian-consent">guardian consent policy</Link> and our <Link href="/privacy">privacy policy</Link>.
        </p>
      </DocSection>

      <DocSection id="payouts" title="How payouts work">
        <ul>
          <li>Payouts run through Stripe Connect. Gifts settle in your team&apos;s Stripe account and Stripe pays them out to the linked bank account.</li>
          <li>Gridiron Give never sees or stores bank or card numbers.</li>
          <li>Money is earmarked to the player and item the donor chose. You buy that gear and log the purchase with a receipt photo, and donors get an update.</li>
          <li>Money left on removed items, or on a player who leaves the team, moves to the team fund and the donors are told.</li>
          <li>Refunds and disputes are handled by Gridiron Give admins, not by coaches.</li>
        </ul>
      </DocSection>

      <section aria-label="Get started" className="flex flex-col gap-4 rounded-md bg-chrome p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <p className="t-body">Ready to set up your team? It starts with your email. No password needed.</p>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
          <ButtonLink href="/app/manager/new" fullMobile>
            Set up a team
          </ButtonLink>
          <Link href="/sign-in" className="inline-flex min-h-11 items-center justify-center text-[16px] whitespace-nowrap">
            Sign in
          </Link>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-h" className="scroll-mt-[84px] border-t border-hairline-soft pt-6">
        <h2 id="faq-h" className="t-subhead mb-2">
          Questions coaches ask
        </h2>
        <div className="border-t border-hairline-soft">
          <Disclosure summary="Does a player get any money directly?">
            <p>No. Gifts go to the team&apos;s Stripe account, earmarked for a specific player and item. The coach buys the gear.</p>
          </Disclosure>
          <Disclosure summary="Can assistant coaches help?">
            <p>Yes. Invite them as staff. They can manage the roster, approvals and purchases, but they can&apos;t change payout details or delete the team.</p>
          </Disclosure>
          <Disclosure summary="Does every player have to be ready before we go live?">
            <p>No. The team page goes live when you publish, and each player appears as soon as their guardian consents and you approve the profile.</p>
          </Disclosure>
          <Disclosure summary="What if our team code gets posted publicly?">
            <p>Change it from your share kit or team settings. Old team links stop working right away. Players&apos; own links keep working.</p>
          </Disclosure>
          <Disclosure summary="What happens to money when a player leaves the team?">
            <p>You move their unspent funds to the team fund before removing them, and the donors are told. Donors can ask for a refund within 30 days.</p>
          </Disclosure>
          <Disclosure summary="Can a donor give more than an item costs?">
            <p>No. An item can&apos;t take more than what&apos;s left on it. Anything extra goes to the team fund, and the donor sees that before paying.</p>
          </Disclosure>
          <Disclosure summary="Who handles refunds?">
            <p>
              Gridiron Give admins. A refund reverses the gift and reopens the item. Send refund requests to <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
            </p>
          </Disclosure>
          <Disclosure summary="Are gifts tax deductible?">
            <p>
              {SITE.taxDeductibleReceipts
                ? 'Only when your school or booster club is a registered tax-exempt organization and its EIN is on file. Receipts say so when it applies.'
                : 'Not through Gridiron Give right now. Receipts say the gift is not tax deductible.'}
            </p>
          </Disclosure>
          <Disclosure summary="What happens at the end of the season?">
            <p>You close the season. Unspent earmarked funds move to the team fund, graduating players are archived, and donors get a season summary. Next season starts from the same roster.</p>
          </Disclosure>
          <Disclosure summary="Which sports can use Gridiron Give?">
            <p>
              {SITE.sports.map((s) => s.label).join(', ')}. Levels: {SITE.levels.map((l) => l.label).join(', ')}.
            </p>
          </Disclosure>
        </div>
        <p className="t-body mt-6">
          More answers are in <Link href="/help" className="underline">Help</Link>.
        </p>
      </section>
    </DocPage>
  );
}
