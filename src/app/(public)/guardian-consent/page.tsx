import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { DocPage, DocSection } from '@/components/public/DocPage';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Guardian consent policy',
  description: 'What a parent or guardian agrees to before a player appears on Gridiron Give: what is shown, what is never shown, who can see it, and the controls you keep.',
  alternates: { canonical: '/guardian-consent' },
};

/**
 * The consent text guardians agree to. It mirrors the consent screen in
 * src/app/app/athlete/[id]/consent (page.tsx and ConsentForm.tsx) for policy
 * version SITE.consentPolicyVersion. Change both together and bump the version.
 */
const shown = [
  'First name and last initial (for example, Jayden S.)',
  'Jersey number, position and grade',
  'A photo, if one is added',
  'A short bio written by your child or you',
  'The gear list and how much has been raised',
  'Supporter names and messages, after the coach approves them',
];
const never = ['Email address or phone number', 'Home address or hometown', 'Birthdate or school ID', 'Full last name, unless you turn it on'];

function List({ items, icon }: { items: string[]; icon: 'check' | 'x' }) {
  const Icon = icon === 'check' ? Check : X;
  return (
    <ul className="list-none! pl-0!">
      {items.map((t) => (
        <li key={t} className="flex gap-3">
          <Icon aria-hidden size={20} className={`mt-0.5 shrink-0 ${icon === 'check' ? 'text-funded' : 'text-error'}`} />
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function GuardianConsentPolicy() {

  return (
    <DocPage
      title="Guardian consent policy"
      intro={
        <p>
          Nothing about a player is visible on Gridiron Give until a parent or legal guardian reads this and gives consent. This applies to every player under 18, even behind
          the team code.
        </p>
      }
      meta={`Policy version ${SITE.consentPolicyVersion}. Effective October 14, 2026.`}
    >
      <DocSection id="shown" title="1. What people with the team code will see">
        <List items={shown} icon="check" />
      </DocSection>

      <DocSection id="never" title="2. What is never shown">
        <List items={never} icon="x" />
      </DocSection>

      <DocSection id="who" title="3. Who can see the page">
        <p>
          Only people who have the team code, and anyone you or your child send your child&apos;s personal link to. Player pages are not in search engines and don&apos;t appear
          in link previews. The team&apos;s public page never lists players.
        </p>
      </DocSection>

      <DocSection id="controls" title="4. Controls you keep">
        <p>
          You can hide the page, delete the photo, or delete the profile at any time from Profile and privacy. Withdrawing consent hides the page right away.
        </p>
      </DocSection>

      <DocSection id="choices" title="Your choices">
        <ul>
          <li>
            <strong>Show full last name.</strong> Off by default. When it&apos;s off, your child is shown by first name and last initial.
          </li>
          <li>
            <strong>Let your child edit the profile.</strong> On by default for players 13 and older. Your child can update the photo, bio and gear, and you keep the privacy
            controls. Not available for players under 13.
          </li>
        </ul>
        <p>You can change these choices later from the consent page in your account.</p>
      </DocSection>

      <DocSection id="signing" title="How you give consent">
        <ul>
          <li>You confirm that you are the player&apos;s parent or legal guardian.</li>
          <li>You type your full name to sign.</li>
          <li>We save your name, the time and your network address with this consent. You can withdraw it at any time.</li>
        </ul>
        <p>
          After you give consent, you or your child set up the profile. The coach reviews the profile before it appears. A player with two guardians can be set up by either
          one.
        </p>
      </DocSection>

      <DocSection id="withdraw" title="If you withdraw consent">
        <ul>
          <li>The page is hidden right away.</li>
          <li>Money already given stays earmarked for your child&apos;s gear, and the coach is told.</li>
          <li>You can give consent again later, or delete the profile.</li>
        </ul>
      </DocSection>

      <DocSection id="more" title="More information">
        <p>
          This policy is part of our <Link href="/privacy">privacy policy</Link>, which explains how we handle children&apos;s information, how long we keep it and how to ask
          us to delete it. Questions: <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
        </p>
      </DocSection>
    </DocPage>
  );
}
