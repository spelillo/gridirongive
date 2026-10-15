import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { asUser, sys } from '@/lib/db';
import { env, mode } from '@/lib/env';
import { stripe } from '@/lib/payments/stripe';

/**
 * Stripe Connect onboarding (ui-ux-spec 8.1 step 4, 8.10). Coach only. Creates
 * the team's Express account the first time, then sends the coach to a
 * Stripe-hosted onboarding link. Stripe calls the refresh URL (a GET) when a
 * link expires, so GET does the same thing. In simulated payments mode it
 * goes to the demo onboarding page instead.
 */
async function handle(req: Request, teamId: string) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from') === 'wizard' ? 'wizard' : 'payouts';
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(`/app/manager/${teamId}/payouts`)}`, env.appUrl), 303);
  if (!/^[0-9a-f-]{36}$/.test(teamId)) return new NextResponse('Not found', { status: 404 });
  const team = await asUser(user.id, (tx) =>
    tx.one<{ id: string; name: string; org_name: string; coach: boolean; stripe_account_id: string | null; tax_exempt: boolean }>(
      `select t.id, t.name, o.name as org_name, is_team_coach(t.id) as coach, t.stripe_account_id, o.tax_exempt
       from teams t join organizations o on o.id = t.org_id where t.id = $1`,
      [teamId],
    ),
  ).catch(() => null);
  if (!team?.coach) return new NextResponse('Not found', { status: 404 });

  const back = from === 'wizard' ? `/app/manager/new?team=${teamId}&step=4` : `/app/manager/${teamId}/payouts`;
  if (mode.payments !== 'stripe') {
    return NextResponse.redirect(new URL(`/app/manager/${teamId}/payouts/connect-simulated${from === 'wizard' ? '?from=wizard' : ''}`, env.appUrl), 303);
  }
  try {
    let accountId = team.stripe_account_id;
    if (!accountId) {
      const acct = await stripe().accounts.create({
        type: 'express',
        country: 'US',
        // Destination charges made on behalf of the team need both.
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_type: team.tax_exempt ? 'non_profit' : 'company',
        email: user.email,
        business_profile: { name: team.org_name, product_description: `Equipment fundraising for ${team.name}` },
        metadata: { team_id: team.id },
      });
      accountId = acct.id;
      await sys.query(`update teams set stripe_account_id = $2, payouts_status = 'pending' where id = $1 and stripe_account_id is null`, [team.id, accountId]);
      await sys.query(`insert into activity_log (team_id, actor_id, action, detail) values ($1, $2, 'stripe_account_created', '{}')`, [team.id, user.id]);
    }
    const sep = back.includes('?') ? '&' : '?';
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: `${env.appUrl}${back}${sep}stripe=return`,
      refresh_url: `${env.appUrl}/api/teams/${team.id}/stripe/connect${from === 'wizard' ? '?from=wizard' : ''}`,
    });
    return NextResponse.redirect(link.url, 303);
  } catch (err) {
    console.error('stripe connect failed', err);
    const sep = back.includes('?') ? '&' : '?';
    return NextResponse.redirect(new URL(`${back}${sep}stripe=error`, env.appUrl), 303);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  return handle(req, (await params).teamId);
}

export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  return handle(req, (await params).teamId);
}
