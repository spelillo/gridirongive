import type { Metadata } from 'next';
import Link from 'next/link';
import { DocPage, DocSection } from '@/components/public/DocPage';
import { feeFormula } from '@/lib/fees-copy';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The rules for using Gridiron Give as a donor, a coach, a player or a family.',
  alternates: { canonical: '/terms' },
};

const toc = [
  { id: 'about', label: 'What Gridiron Give is' },
  { id: 'accounts', label: 'Accounts and eligibility' },
  { id: 'donors', label: 'Giving' },
  { id: 'fees', label: 'Fees' },
  { id: 'refunds', label: 'Refunds and leftover funds' },
  { id: 'teams', label: 'Coaches and teams' },
  { id: 'players', label: 'Players and families' },
  { id: 'content', label: 'Content and conduct' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'ending', label: 'Suspension and ending' },
  { id: 'disclaimers', label: 'Disclaimers and limits' },
  { id: 'changes', label: 'Changes and contact' },
];

export default function TermsPage() {
  const mail = <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>;
  return (
    <DocPage
      title="Terms of use"
      intro={<p>These terms are the agreement between you and Gridiron Give when you use the site. By giving, setting up a team, or creating a profile, you agree to them.</p>}
      meta="Effective October 14, 2026."
      toc={toc}
    >
      <DocSection id="about" title="What Gridiron Give is">
        <p>
          Gridiron Give is a platform that lets supporters fund specific sports equipment for specific players on a high school or youth team. Gifts go to the team&apos;s
          payout account, held by the school, a booster club, or a coach as custodian. The team buys the gear and records the purchase.
        </p>
        <p>
          Gridiron Give is not a charity, a bank or a payment processor. We don&apos;t buy or ship gear, and we are not the seller of anything a team buys.
          {SITE.taxDeductibleReceipts
            ? ' Gifts are tax deductible only when the team’s organization is a registered tax-exempt organization, and the receipt says so.'
            : ' Gifts made through Gridiron Give are not tax deductible, and receipts are not tax receipts.'}
        </p>
      </DocSection>

      <DocSection id="accounts" title="Accounts and eligibility">
        <ul>
          <li>Donors don&apos;t need an account. You must be 18 or older, or have a parent&apos;s permission, to give.</li>
          <li>Coaches and staff must be adults authorized by the school or club to run the team&apos;s fundraising.</li>
          <li>Players are added by their coach. A parent or legal guardian must give consent before any player under 18 appears. Players under 13 don&apos;t get their own account.</li>
          <li>We sign you in with a one-time link or code sent to your email. Keep access to your email secure. You are responsible for activity on your account.</li>
          <li>Give accurate information, and don&apos;t sign in as someone else.</li>
        </ul>
      </DocSection>

      <DocSection id="donors" title="Giving">
        <ul>
          <li>You choose a player and item, several items, or the team fund. Your gift is earmarked for what you chose.</li>
          <li>An item can&apos;t take more than what&apos;s left on it. If your gift is more than that, the extra goes to the team fund, and you see that before paying.</li>
          <li>Totals on the site update only when the payment is confirmed by Stripe.</li>
          <li>Your gift is a voluntary contribution to the team. You don&apos;t receive goods or services in return, and you don&apos;t gain any right to direct the team beyond the earmark.</li>
          <li>Payments are processed by Stripe and are subject to Stripe&apos;s terms.</li>
        </ul>
      </DocSection>

      <DocSection id="fees" title="Fees">
        <p>Each gift carries {feeFormula()}.</p>
        <p>
          You can choose to cover these fees at checkout so the team receives your full gift. If you don&apos;t, they come out of the gift. Checkout always shows the exact
          amounts before you pay. We may change the fees for future gifts by updating this page and the <Link href="/for-teams#fees">fees section</Link>.
        </p>
      </DocSection>

      <DocSection id="refunds" title="Refunds and leftover funds">
        <ul>
          <li>Refunds and payment disputes are handled by Gridiron Give admins, not by coaches. Email {mail} with the email you gave with and the date of the gift.</li>
          <li>We refund gifts made in error, unauthorized charges, and gifts to a team that we remove for breaking these terms. Other requests are reviewed case by case.</li>
          <li>
            If an item is removed, or a player leaves the team, money earmarked for it moves to the team fund for other gear, and the donors are told. You can ask for a refund of
            that amount within 30 days of the notice.
          </li>
          <li>At the end of a season, unspent earmarked money moves to the team fund for the team&apos;s gear.</li>
          <li>A refund reverses the gift and reopens the item. Fees already paid to Stripe may not be returned by Stripe.</li>
        </ul>
      </DocSection>

      <DocSection id="teams" title="Coaches and teams">
        <ul>
          <li>You must be authorized to raise money for the team, and you must tell us the truth when verifying it.</li>
          <li>The payout account must belong to the school, a booster club, or you as custodian for the team. You agree to Stripe&apos;s connected account terms.</li>
          <li>You must spend gifts on the gear they were earmarked for, or on team gear from the team fund, and record purchases honestly with receipts.</li>
          <li>You must not withdraw more than the funded items and the team fund, or use gifts for anything other than team equipment.</li>
          <li>You must add only players on your team, invite their guardians, and respect the guardian&apos;s choices and any withdrawal of consent.</li>
          <li>Keep the team code to people connected with the team. Change it if it&apos;s posted publicly.</li>
          <li>You are responsible for following your school, league and state athletic association rules about fundraising and equipment, including safety standards such as certified helmets.</li>
        </ul>
      </DocSection>

      <DocSection id="players" title="Players and families">
        <ul>
          <li>A guardian decides what appears and can hide or delete the page at any time.</li>
          <li>Only post photos and text you have the right to share. Don&apos;t include contact details, addresses or other personal information in a bio or photo.</li>
          <li>Players never receive money directly. Gear is bought by the team.</li>
          <li>The coach approves profiles and changes before they appear.</li>
        </ul>
      </DocSection>

      <DocSection id="content" title="Content and conduct">
        <p>You keep ownership of the photos and text you add. You let us host, show and resize them on Gridiron Give, and in emails we send, for as long as they are on the site.</p>
        <p>Don&apos;t use Gridiron Give to:</p>
        <ul>
          <li>post anything harassing, hateful, sexual, violent or otherwise inappropriate for a youth sports audience;</li>
          <li>collect information about players, contact players, or share a team code or player link to people outside the team&apos;s community for a harmful purpose;</li>
          <li>misrepresent a team, a player, a need or how money will be used;</li>
          <li>test stolen cards, launder money, or break any law;</li>
          <li>scrape the site, guess team codes, or get around our security.</li>
        </ul>
        <p>
          We may remove content or hide a page that breaks these rules or that a guardian or coach asks us to remove. To flag something, use{' '}
          <Link href="/report">Report a problem</Link>.
        </p>
      </DocSection>

      <DocSection id="privacy" title="Privacy">
        <p>
          Our <Link href="/privacy">privacy policy</Link> and <Link href="/guardian-consent">guardian consent policy</Link> explain how we handle information about players,
          families, coaches and donors. They are part of these terms.
        </p>
      </DocSection>

      <DocSection id="ending" title="Suspension and ending">
        <ul>
          <li>You can stop using Gridiron Give at any time, and ask us to close your account by emailing {mail}.</li>
          <li>
            We may pause giving to a team, hide a page, or suspend an account if we believe these terms were broken, a child&apos;s safety is at risk, or a payment issue needs
            review. Where we can, we tell you why.
          </li>
          <li>If a team is removed, we work with Stripe to refund or redirect gifts that haven&apos;t been spent.</li>
        </ul>
      </DocSection>

      <DocSection id="disclaimers" title="Disclaimers and limits">
        <ul>
          <li>We provide the service as is. We work to keep it running and accurate, but we can&apos;t promise it will always be available or error free.</li>
          <li>Teams, not Gridiron Give, choose, buy and hand out gear. We are not responsible for the quality, fit or safety of gear a team buys.</li>
          <li>
            To the extent the law allows, Gridiron Give is not liable for indirect or consequential losses, and our total liability to you for any claim is limited to the fees
            we received from your gifts in the 12 months before the claim.
          </li>
          <li>Nothing in these terms limits rights you have under consumer protection law that can&apos;t be waived.</li>
        </ul>
      </DocSection>

      <DocSection id="changes" title="Changes and contact">
        <p>
          We may update these terms. If a change matters, we post it here with a new effective date before it applies. Using Gridiron Give after that means you accept the
          new terms. Questions: {mail}.
        </p>
      </DocSection>
    </DocPage>
  );
}
