import type { Metadata } from 'next';
import Link from 'next/link';
import { DocPage, DocSection } from '@/components/public/DocPage';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How Gridiron Give collects, uses, shows and deletes information about players, families, coaches and donors.',
  alternates: { canonical: '/privacy' },
};

const toc = [
  { id: 'summary', label: 'The short version' },
  { id: 'players', label: 'Players and children' },
  { id: 'under-13', label: 'Children under 13' },
  { id: 'shown', label: 'What is public' },
  { id: 'donors', label: 'Donors and payments' },
  { id: 'coaches', label: 'Coaches and staff' },
  { id: 'use', label: 'How we use information' },
  { id: 'sharing', label: 'Who we share it with' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'retention', label: 'How long we keep it' },
  { id: 'rights', label: 'Your choices and rights' },
  { id: 'security', label: 'Security' },
  { id: 'changes', label: 'Changes and contact' },
];

export default function PrivacyPage() {
  const mail = <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>;
  return (
    <DocPage
      title="Privacy policy"
      intro={<p>Gridiron Give helps supporters fund gear for high school and youth athletes, many of whom are minors. This policy explains what we collect, why, who sees it, and how to have it deleted.</p>}
      meta="Effective October 14, 2026."
      toc={toc}
    >
      <DocSection id="summary" title="The short version">
        <ul>
          <li>We collect as little as we can about players, and nothing about a player is visible until a parent or guardian gives consent.</li>
          <li>Rosters and player pages sit behind a team code. Players can&apos;t be searched by name, and their pages are kept out of search engines and link previews.</li>
          <li>Players are shown by first name and last initial unless a guardian chooses otherwise.</li>
          <li>Payments are handled by Stripe. We never see or store full card numbers or bank account numbers.</li>
          <li>We don&apos;t sell personal information and we don&apos;t show ads.</li>
          <li>A guardian can hide or delete a player&apos;s page at any time.</li>
        </ul>
      </DocSection>

      <DocSection id="players" title="Information about players and children">
        <h3>What we collect</h3>
        <ul>
          <li>
            <strong>From the coach&apos;s roster:</strong> first and last name, jersey number, position, grade, and the email address (and optionally phone number) of a
            parent or guardian. For players 13 and older the coach may add the player&apos;s own email.
          </li>
          <li>
            <strong>From the guardian or player:</strong> an optional preferred name, a photo, a short bio, which gear the player needs, and thank-you notes to supporters.
          </li>
          <li>
            <strong>The consent record:</strong> the guardian&apos;s typed name, the time, their network (IP) address and browser type, the choices they made and the policy
            version they agreed to.
          </li>
        </ul>
        <h3>What we don&apos;t collect</h3>
        <p>We don&apos;t ask for a player&apos;s birthdate, home address, school ID, social media accounts or location. Grade is used instead of age.</p>
        <h3>How it&apos;s used</h3>
        <p>
          Only to run the player&apos;s gear page: showing it to people with access, letting supporters fund the gear, telling the family when gear is funded, purchased and
          delivered, and passing on thank-you notes. Player information is never used for advertising and never sold.
        </p>
      </DocSection>

      <DocSection id="under-13" title="Children under 13">
        <p>
          We follow the Children&apos;s Online Privacy Protection Act (COPPA). For players under 13:
        </p>
        <ul>
          <li>A parent or guardian gives consent before we show anything about the child. The coach&apos;s invite goes to the guardian, not to the child.</li>
          <li>The child does not get their own account. The guardian sets up and manages the page, and the option for the child to edit the profile is not available.</li>
          <li>We collect only what the page needs, listed above, and we don&apos;t require a child to give more information to take part.</li>
          <li>
            A parent or guardian can review what we hold about their child, ask us to correct it, stop further collection, or have it deleted. Use the controls in Profile and
            privacy, or email {mail}.
          </li>
        </ul>
        <p>
          The same consent applies to every player under 18, even though the law only requires it under 13. If you believe we hold a child&apos;s information without a
          guardian&apos;s consent, email {mail} and we will remove it.
        </p>
      </DocSection>

      <DocSection id="shown" title="What is public and what is not">
        <ul>
          <li>
            <strong>Anyone can see</strong> a live team&apos;s page: team name, school, city and state, the team&apos;s photo and story, and its funding totals. Team pages never
            list players.
          </li>
          <li>
            <strong>People with the team code</strong> (or a player&apos;s personal link) can see that player&apos;s page: first name and last initial, jersey number, position,
            grade, photo, bio, gear list, progress, and approved supporter names and messages. The full last name is shown only if the guardian turns it on.
          </li>
          <li>
            <strong>Never shown to visitors:</strong> emails, phone numbers, addresses, hometowns, birthdates, school IDs and donor email addresses.
          </li>
          <li>
            Player pages ask search engines not to index them, are left out of our sitemap, and show no name or photo in link previews. Search on Gridiron Give finds teams
            only.
          </li>
        </ul>
        <p>
          The full rules a guardian agrees to are in the <Link href="/guardian-consent">guardian consent policy</Link>.
        </p>
      </DocSection>

      <DocSection id="donors" title="Donors and payments">
        <ul>
          <li>When you give, we collect your name, email address, an optional message, and whether to show your name on the page.</li>
          <li>
            Payments are processed by Stripe. Your card details go straight to Stripe. We receive only the card brand, the last 4 digits and the payment status, which appear
            on your receipt.
          </li>
          <li>The team&apos;s coach and staff see your name, email, gift and message so they can thank you and keep records. Players see only your name (or &quot;A supporter&quot;) and your approved message.</li>
          <li>We email you a receipt and updates about the gear you funded. You can turn off non-essential updates.</li>
          <li>You don&apos;t need an account to give. If you create one, it holds your giving history.</li>
        </ul>
      </DocSection>

      <DocSection id="coaches" title="Coaches and staff">
        <ul>
          <li>We collect your name, email, school or club, and your role on the team.</li>
          <li>To verify a team we check your email domain, or review a document you upload, such as a staff ID or booster club letter. Only Gridiron Give admins see these documents.</li>
          <li>Payout accounts are set up with Stripe. Stripe collects identity, tax and bank details directly. We never store bank account numbers.</li>
          <li>Purchase receipts you upload are shown to donors as proof of purchase. Remove personal details from a receipt photo before uploading it.</li>
        </ul>
      </DocSection>

      <DocSection id="use" title="How we use information">
        <ul>
          <li>To run the service: team and player pages, giving, receipts, payouts, purchase records and notifications.</li>
          <li>To keep it safe: verifying teams, approving content, limiting repeated code guesses, and investigating reports and payment disputes.</li>
          <li>To improve it: we count events like &quot;team page viewed&quot; or &quot;gift completed&quot;. These counts contain no names, emails or other personal details.</li>
          <li>To meet legal and accounting obligations, such as keeping payment records.</li>
        </ul>
      </DocSection>

      <DocSection id="sharing" title="Who we share it with">
        <p>We share information only as needed to run Gridiron Give:</p>
        <ul>
          <li>
            <strong>Service providers</strong> that host and run the service for us under contract: Stripe (payments and payouts), our database and file storage host, our
            web host, and our email provider. They may use the information only to provide their service to us.
          </li>
          <li>
            <strong>The team</strong>, as described above: coaches and staff see their own team&apos;s roster, donations and consent status.
          </li>
          <li>
            <strong>When required by law</strong>, or to protect a child, a user or the public from harm.
          </li>
        </ul>
        <p>We don&apos;t sell or rent personal information, and we don&apos;t share it for advertising.</p>
      </DocSection>

      <DocSection id="cookies" title="Cookies">
        <p>We use a small number of cookies, all needed for the site to work. We don&apos;t use advertising or cross-site tracking cookies.</p>
        <ul>
          <li>A sign-in cookie, so you stay signed in.</li>
          <li>A team access cookie, so a team code you entered keeps working on that device for the season.</li>
          <li>Your ZIP code, if you enter one to see nearby teams.</li>
          <li>The share link you arrived from, so a team can see which links work. It holds no personal details.</li>
        </ul>
      </DocSection>

      <DocSection id="retention" title="How long we keep it">
        <ul>
          <li>
            <strong>Player profiles</strong> stay until a guardian deletes them or the team archives the player. When a profile is deleted, its photo, bio and contact details
            are removed. A player who graduates is archived and no longer shown.
          </li>
          <li>
            <strong>Consent records</strong> are kept while the profile exists and for as long afterwards as we need to show that consent was given.
          </li>
          <li>
            <strong>Payment and donation records</strong> are kept for as long as tax and accounting law requires, usually 7 years. If a player&apos;s profile is deleted, past
            gifts stay in the team&apos;s records without the player&apos;s details.
          </li>
          <li>
            <strong>Code attempt and rate limit records</strong> hold a scrambled version of your network address, never the address itself, and are only used for a short
            time.
          </li>
          <li>
            <strong>Accounts</strong> stay until you ask us to close them.
          </li>
        </ul>
      </DocSection>

      <DocSection id="rights" title="Your choices and rights">
        <ul>
          <li>Guardians can hide a page, delete the photo, withdraw consent or delete the profile at any time from Profile and privacy. Withdrawing consent hides the page right away.</li>
          <li>Guardians can download a copy of their child&apos;s information from Profile and privacy.</li>
          <li>Anyone can ask us to see, correct or delete information we hold about them by emailing {mail}. We may need to confirm who you are first.</li>
          <li>Donors can choose not to show their name on a page. Receipts and payment confirmations are always sent.</li>
          <li>
            Depending on where you live, you may have more rights under state privacy laws. We honor those requests through the same email address.
          </li>
        </ul>
      </DocSection>

      <DocSection id="security" title="Security">
        <p>
          Data is encrypted in transit. Access to player contact details, donor emails and verification documents is limited to the people who need it, and the database
          enforces those rules. Repeated team code guesses are blocked. No system is perfectly secure. If we learn of a breach that affects you, we
          will tell you as the law requires.
        </p>
      </DocSection>

      <DocSection id="changes" title="Changes and contact">
        <p>
          If we change this policy in a way that matters, we will post the new version here with a new effective date and, for changes affecting players, ask guardians to
          review it. Questions or requests: {mail}. To report a problem with a page, use <Link href="/report">Report a problem</Link>.
        </p>
      </DocSection>
    </DocPage>
  );
}
