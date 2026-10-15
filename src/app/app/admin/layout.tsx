import { requireAdmin } from '@/lib/auth/session';
import { adminCounts } from '@/lib/app/admin';
import { AppShell, AppMain } from '@/components/app/AppShell';
import { AppNav, type NavItem } from '@/components/app/AppNav';

export const metadata = { title: { template: '%s · Admin · Gridiron Give', default: 'Admin' } };

/** Platform admin area (ui-ux-spec 9). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const counts = await adminCounts();
  const items: NavItem[] = [
    { href: '/app/admin', label: 'Overview', icon: 'overview', exact: true },
    { href: '/app/admin/verification', label: 'Verification', icon: 'verify', count: counts.verification },
    { href: '/app/admin/donations', label: 'Donations', icon: 'donations', count: counts.refunds },
    { href: '/app/admin/moderation', label: 'Moderation', icon: 'flag', count: counts.moderation },
    { href: '/app/admin/teams', label: 'Teams', icon: 'teams' },
    { href: '/app/admin/catalog', label: 'Catalog', icon: 'catalog' },
    { href: '/app/admin/outbox', label: 'Email log', icon: 'inbox', count: counts.failed },
  ];
  return (
    <AppShell user={user} switcher={<span className="hidden rounded-md bg-band px-2 py-1 text-[13px] font-medium text-ink sm:inline">Admin</span>}>
      <div className="flex flex-1">
        <AppNav label="Admin" items={items} />
        <AppMain wide>{children}</AppMain>
      </div>
    </AppShell>
  );
}
