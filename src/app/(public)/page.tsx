import Link from 'next/link';
import { cookies } from 'next/headers';
import { SearchField } from '@/components/public/SearchField';
import { CodeEntryLink } from '@/components/public/CodeEntryLink';
import { TeamRow } from '@/components/public/TeamRow';
import { ButtonLink } from '@/components/ui/Button';
import { teamsNear } from '@/lib/queries/public';
import { approxLocation } from '@/lib/request';
import { feeFormula } from '@/lib/fees-copy';
import { SITE } from '@/config/site';
import { ZipForm } from './ZipForm';

export const metadata = { title: { absolute: 'Gridiron Give: fund gear for local athletes' } };

export default async function Landing() {
  const store = await cookies();
  const savedZip = store.get('gg_zip')?.value;
  const approx = savedZip ? { zip: savedZip } : await approxLocation();
  const near = approx.zip || approx.state ? await teamsNear(approx.zip, approx.state) : [];
  const where = approx.zip ? `near ${approx.zip}` : approx.state ? `in ${approx.state}` : '';

  return (
    <>
      <section aria-labelledby="find" className="bg-band-blue">
        <div className="page-x mx-auto flex max-w-[1200px] flex-col gap-4 py-6 md:py-12">
          <h1 id="find" className="t-hero">
            Find a team
          </h1>
          <p className="t-body max-w-2xl">Search by school, team, or town. You&apos;ll need the team code from a player or coach to see the roster.</p>
          <div className="max-w-3xl">
            <SearchField size="lg" withSport sports={[...SITE.sports]} label="Search by school, team, or town" />
          </div>
          <div>
            <CodeEntryLink />
          </div>
        </div>
      </section>

      <section aria-labelledby="near" className="page-x mx-auto w-full max-w-[1200px] py-8 md:py-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="near" className="t-section">
            Teams near you
          </h2>
          {(approx.zip || approx.state) && <ZipForm current={approx.zip} compact />}
        </div>
        {!approx.zip && !approx.state ? (
          <div className="flex max-w-md flex-col gap-2">
            <p className="t-body">Enter your ZIP code to see teams nearby.</p>
            <ZipForm />
          </div>
        ) : near.length === 0 ? (
          <p className="t-body">
            No teams {where} yet. <Link href="/search">Search all teams</Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {near.map((t) => (
              <TeamRow key={t.id} team={t} />
            ))}
          </ul>
        )}
      </section>

      <section id="how-it-works" aria-labelledby="how" className="page-x mx-auto w-full max-w-[1200px] pb-12">
        <div className="grid gap-8 border-t border-hairline-soft pt-8 md:grid-cols-[1fr_1fr] md:pt-12">
          <div>
            <h2 id="how" className="t-section mb-4">
              How it works
            </h2>
            <ol className="flex list-decimal flex-col gap-2 pl-6 t-body marker:font-medium marker:text-ink">
              <li>Find the team.</li>
              <li>Enter the team code to see players.</li>
              <li>Pick a player and a piece of gear.</li>
              <li>The coach buys it, and you get an update when it&apos;s purchased.</li>
            </ol>
          </div>
          <div className="flex flex-col gap-2 md:pt-14">
            <h3 className="t-label">Fees</h3>
            <p className="t-body">{feeFormula()}. Donors can choose to cover the fees so the player gets the full amount.</p>
            <ButtonLink href="/for-teams#fees" variant="tertiary" className="self-start">
              Read more
            </ButtonLink>
          </div>
        </div>
      </section>

      <section aria-label="For coaches" className="bg-chrome">
        <div className="page-x mx-auto flex max-w-[1200px] flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
          <p className="t-body">Running a team? Set up rosters, gear lists and payouts.</p>
          <ButtonLink href="/app/manager/new" variant="primary" fullMobile>
            Set up a team
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
