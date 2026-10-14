import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { placesFor } from '@/lib/app/places';
import { AppShell, AppMain } from '@/components/app/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { AthleteStatusChip, Chip } from '@/components/ui/Chip';

export const metadata = { title: 'Dashboard' };

const roleLabel: Record<string, string> = { coach: 'Head coach', staff: 'Staff', viewer: 'Viewer' };

/** Sends people with one place straight there; otherwise lets them choose. */
export default async function AppHome() {
  const user = await requireUser('/app');
  const places = await placesFor(user.id);
  const total = places.teams.length + places.athletes.length;
  if (total === 1) redirect(places.teams[0] ? `/app/manager/${places.teams[0].id}` : `/app/athlete/${places.athletes[0].id}`);

  const row = 'flex min-h-16 items-center gap-4 px-4 py-3 no-underline hover:bg-chrome';
  return (
    <AppShell user={user}>
      <AppMain>
        <div className="mx-auto flex max-w-[720px] flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h1 className="t-hero">{user.fullName ? `Hi, ${user.fullName.split(' ')[0]}` : 'Your dashboard'}</h1>
            <p className="t-body">{total ? 'Pick where you want to work.' : "You don't manage a team or a player page yet."}</p>
          </div>

          {places.teams.length > 0 && (
            <section aria-labelledby="teams-h" className="flex flex-col gap-3">
              <h2 id="teams-h" className="t-subhead">
                Teams
              </h2>
              <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
                {places.teams.map((t) => (
                  <li key={t.id}>
                    <Link href={`/app/manager/${t.id}`} className={row}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-medium text-ink">{t.name}</span>
                        <span className="t-caption">{roleLabel[t.role] ?? t.role}</span>
                      </span>
                      {t.status === 'draft' && <Chip tone="warn">Setup</Chip>}
                      <ChevronRight size={20} aria-hidden className="text-ink-meta" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {places.athletes.length > 0 && (
            <section aria-labelledby="players-h" className="flex flex-col gap-3">
              <h2 id="players-h" className="t-subhead">
                Player pages
              </h2>
              <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
                {places.athletes.map((a) => (
                  <li key={a.id}>
                    <Link href={`/app/athlete/${a.id}`} className={row}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-medium text-ink">{a.name}</span>
                        <span className="t-caption">
                          {a.teamName} · {a.role === 'guardian' ? 'Parent or guardian' : 'Player'}
                        </span>
                      </span>
                      <AthleteStatusChip status={a.status} />
                      <ChevronRight size={20} aria-hidden className="text-ink-meta" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-col gap-3 border-t border-hairline-soft pt-6 sm:flex-row">
            <ButtonLink href="/app/manager/new" variant={total ? 'secondary' : 'primary'}>
              <Plus size={18} aria-hidden /> Set up a team
            </ButtonLink>
            <ButtonLink href="/app/donor" variant="tertiary">
              My gifts
            </ButtonLink>
          </div>
          <p className="t-caption">Got an invite from a coach? Open the link in the email to join your player&apos;s page.</p>
        </div>
      </AppMain>
    </AppShell>
  );
}
