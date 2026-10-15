import { requireUser } from '@/lib/auth/session';
import { AppShell, AppMain } from '@/components/app/AppShell';

export const metadata = { title: 'Set up a team · Gridiron Give' };

/** The setup wizard has no team yet, so it uses the app chrome without the team nav. */
export default async function NewTeamLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/app/manager/new');
  return (
    <AppShell user={user}>
      <AppMain>{children}</AppMain>
    </AppShell>
  );
}
