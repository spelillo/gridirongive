import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { acceptInvite } from '@/lib/invites';
import { sys } from '@/lib/db';

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get('token') ?? '');
  const as = form.get('as') === 'athlete' ? 'athlete' : 'guardian';
  const back = (q: string) => NextResponse.redirect(new URL(`/invite/${encodeURIComponent(token)}?${q}`, request.url), 303);
  const user = await getUser();
  if (!user) return back(`as=${as}`);
  const result = await acceptInvite(token, user.id, as);
  if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  const a = await sys.one<{ status: string }>(`select status from athletes where id = $1`, [result.athleteId]);
  const dest = as === 'guardian' && a?.status === 'needs_consent' ? `/app/athlete/${result.athleteId}/consent` : `/app/athlete/${result.athleteId}`;
  return NextResponse.redirect(new URL(dest, request.url), 303);
}
