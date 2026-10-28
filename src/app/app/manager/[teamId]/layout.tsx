import { loadTeamCtx, teamCounts } from '@/lib/app/team';
import { placesFor } from '@/lib/app/places';
import { AppShell, AppMain } from '@/components/app/AppShell';
import { AppNav, type NavItem } from '@/components/app/AppNav';
import { PlaceSwitcher } from '@/components/app/PlaceSwitcher';
import { Banner } from '@/components/ui/Banner';
import { mode } from '@/lib/env';

export const metadata = { title: { template: '%s · Team · Gridiron Give', default: 'Team' } };

/** Manager app chrome (ui-ux-spec 4.2 and 8). */
export default async function ManagerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  const [places, counts] = await Promise.all([placesFor(ctx.user.id), teamCounts(teamId)]);
  const base = `/app/manager/${teamId}`;
  const options = [
    ...places.teams.map((t) => ({ href: `/app/manager/${t.id}`, label: t.name })),
    ...places.athletes.map((a) => ({ href: `/app/athlete/${a.id}`, label: `${a.name} · ${a.teamName}` })),
  ];
  if (!options.some((o) => o.href === base)) options.unshift({ href: base, label: ctx.team.name });
  // Mobile tabs: the first four plus More (ui-ux-spec 4.2).
  const items: NavItem[] = [
    { href: base, label: 'Overview', icon: 'overview', exact: true },
    { href: `${base}/roster`, label: 'Roster', icon: 'roster' },
    { href: `${base}/approvals`, label: 'Approvals', icon: 'approvals', count: counts.approvals },
    { href: `${base}/donations`, label: 'Donations', icon: 'donations' },
    { href: `${base}/purchases`, label: 'Purchases', icon: 'purchases', count: counts.to_buy },
    ...(ctx.isCoach ? [{ href: `${base}/payouts`, label: 'Payouts', icon: 'payouts' } as NavItem] : []),
    { href: `${base}/templates`, label: 'Gear templates', icon: 'catalog' },
    { href: `${base}/share`, label: 'Share kit', icon: 'share' },
    { href: `${base}/settings`, label: 'Settings', icon: 'settings' },
  ];
  return (
    <AppShell user={ctx.user} switcher={<PlaceSwitcher current={base} options={options} label="Switch team or player" />}>
      <div className="flex flex-1">
        <AppNav label="Team" items={items} />
        <AppMain wide>
          {/* Live site without an email provider: invites would look sent but never arrive. */}
          {!mode.demo && mode.email === 'outbox' && (
            <Banner tone="warn" rounded className="mb-6">
              Email isn&apos;t set up on Gridiron Give yet, so invites, consent requests and gift notices are not being sent to families.
            </Banner>
          )}
          {children}
        </AppMain>
      </div>
    </AppShell>
  );
}
