import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { asUser } from '@/lib/db';
import { env, mode } from '@/lib/env';
import { stripe } from '@/lib/payments/stripe';

/** "Manage in Stripe" (ui-ux-spec 8.10): a one-time Express dashboard login link. Coach only. */
export async function POST(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL('/sign-in', env.appUrl), 303);
  if (!/^[0-9a-f-]{36}$/.test(teamId)) return new NextResponse('Not found', { status: 404 });
  const team = await asUser(user.id, (tx) =>
    tx.one<{ coach: boolean; stripe_account_id: string | null }>(`select is_team_coach(id) as coach, stripe_account_id from teams where id = $1`, [teamId]),
  ).catch(() => null);
  if (!team?.coach) return new NextResponse('Not found', { status: 404 });
  const back = `/app/manager/${teamId}/payouts`;
  if (mode.payments !== 'stripe' || !team.stripe_account_id) return NextResponse.redirect(new URL(back, env.appUrl), 303);
  try {
    const link = await stripe().accounts.createLoginLink(team.stripe_account_id);
    return NextResponse.redirect(link.url, 303);
  } catch (err) {
    console.error('stripe login link failed', err);
    return NextResponse.redirect(new URL(`${back}?stripe=error`, env.appUrl), 303);
  }
}
