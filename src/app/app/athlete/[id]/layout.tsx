import { loadAthleteCtx } from '@/lib/app/athlete';
import { placesFor } from '@/lib/app/places';
import { AppShell, AppMain } from '@/components/app/AppShell';
import { AppNav } from '@/components/app/AppNav';
import { PlaceSwitcher } from '@/components/app/PlaceSwitcher';

export default async function AthleteAppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAthleteCtx(id);
  const places = await placesFor(ctx.user.id);
  const base = `/app/athlete/${id}`;
  const options = [
    ...places.athletes.map((a) => ({ href: `/app/athlete/${a.id}`, label: `${a.name} · ${a.teamName}` })),
    ...places.teams.map((t) => ({ href: `/app/manager/${t.id}`, label: t.name })),
  ];
  return (
    <AppShell user={ctx.user} switcher={<PlaceSwitcher current={base} options={options} label="Switch player or team" />}>
      <div className="flex flex-1">
        <AppNav
          label="Player"
          items={[
            { href: base, label: 'My page', icon: 'home', exact: true },
            { href: `${base}/gear`, label: 'Gear', icon: 'gear' },
            { href: `${base}/supporters`, label: 'Supporters', icon: 'supporters' },
            { href: `${base}/share`, label: 'Share', icon: 'share' },
            { href: `${base}/profile`, label: 'Profile', icon: 'profile' },
          ]}
        />
        <AppMain>{children}</AppMain>
      </div>
    </AppShell>
  );
}
