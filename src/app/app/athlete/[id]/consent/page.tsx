import { redirect } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { loadAthleteCtx } from '@/lib/app/athlete';
import { possessive } from '@/lib/domain/names';
import { ConsentForm } from './ConsentForm';

export const metadata = { title: 'Consent' };

/** Guardian consent (ui-ux-spec 7.2): plain language, one page. */
export default async function ConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAthleteCtx(id);
  const { athlete: a, team } = ctx;
  if (ctx.role !== 'guardian') redirect(`/app/athlete/${id}`);
  const first = a.first;
  const lastInitial = `${a.lastName.charAt(0).toUpperCase()}.`;

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="t-caption">{team.name}</p>
        <h1 className="t-hero">Consent for {possessive(first)} page</h1>
        <p className="t-body">
          Read what will be shown and who can see it. {a.consentAt ? 'You already gave consent. You can update your choices here.' : 'Nothing about ' + first + ' is visible until you give consent.'}
        </p>
      </header>

      <section aria-labelledby="c1" className="flex flex-col gap-3">
        <h2 id="c1" className="t-subhead">
          1. What people with the team code will see
        </h2>
        <ul className="flex flex-col gap-2">
          {[
            `${first} ${lastInitial} (first name and last initial)`,
            'Jersey number, position and grade',
            'A photo, if one is added',
            `A short bio written by ${first} or you`,
            'The gear list and how much has been raised',
            'Supporter names and messages, after the coach approves them',
          ].map((t) => (
            <li key={t} className="flex gap-3 text-[16px] leading-6 text-ink-body">
              <Check aria-hidden size={20} className="mt-0.5 shrink-0 text-funded" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="c2" className="flex flex-col gap-3">
        <h2 id="c2" className="t-subhead">
          2. What is never shown
        </h2>
        <ul className="flex flex-col gap-2">
          {['Email address or phone number', 'Home address or hometown', 'Birthdate or school ID', 'Full last name, unless you turn it on below'].map((t) => (
            <li key={t} className="flex gap-3 text-[16px] leading-6 text-ink-body">
              <X aria-hidden size={20} className="mt-0.5 shrink-0 text-error" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="c3" className="flex flex-col gap-2">
        <h2 id="c3" className="t-subhead">
          3. Who can see the page
        </h2>
        <p className="t-body">
          Only people who have the team code, and anyone you or {first} send {possessive(first)} personal link to. Player pages are not in search engines and
          don&apos;t appear in link previews. The team&apos;s public page never lists players.
        </p>
      </section>

      <section aria-labelledby="c4" className="flex flex-col gap-2">
        <h2 id="c4" className="t-subhead">
          4. Controls you keep
        </h2>
        <p className="t-body">
          You can hide the page, delete the photo, or delete the profile at any time from Profile and privacy. Withdrawing consent hides the page right away.
        </p>
      </section>

      <ConsentForm
        athleteId={a.id}
        first={first}
        under13={a.under13}
        defaults={{ showFullLastName: a.showFullLastName, athleteCanEdit: a.athleteCanEdit && !a.under13 }}
        already={Boolean(a.consentAt)}
        nameDefault={ctx.user.fullName ?? ''}
      />
    </div>
  );
}
