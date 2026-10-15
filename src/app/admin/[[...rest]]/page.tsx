import { redirect } from 'next/navigation';

/** The spec's /admin URLs live under /app/admin. Keeps old links working. */
export default async function AdminRedirect({ params }: { params: Promise<{ rest?: string[] }> }) {
  const { rest } = await params;
  const allowed = ['verification', 'teams', 'donations', 'moderation', 'catalog', 'outbox'];
  redirect(rest?.[0] && allowed.includes(rest[0]) ? `/app/admin/${rest[0]}` : '/app/admin');
}
