import { NextResponse } from 'next/server';
import { asUser } from '@/lib/db';
import { getUser } from '@/lib/auth/session';
import { env } from '@/lib/env';

/**
 * Opening a notification: marks it read, then follows its link. Only links
 * back into this site are followed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const here = new URL(req.url);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent('/app/notifications')}`, here), 303);
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(new URL('/app/notifications', here), 303);
  const row = await asUser(user.id, (tx) =>
    tx.one<{ link: string | null }>(`update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning link`, [id, user.id]),
  ).catch(() => null);
  return NextResponse.redirect(new URL(localPath(row?.link, here.host) ?? '/app/notifications', here), 303);
}

function localPath(link: string | null | undefined, requestHost: string): string | null {
  if (!link) return null;
  if (link.startsWith('/') && !link.startsWith('//') && !link.startsWith('/\\')) return link;
  try {
    const u = new URL(link);
    const app = new URL(env.appUrl);
    return u.host === app.host || u.host === requestHost ? `${u.pathname}${u.search}${u.hash}` : null;
  } catch {
    return null;
  }
}
