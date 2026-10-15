import { notFound, redirect } from 'next/navigation';
import { loadTeamCtx } from '@/lib/app/team';
import { mode } from '@/lib/env';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { ConnectSimulated } from './ConnectSimulated';

export const metadata = { title: 'Connect payouts (demo)' };

/** Stands in for Stripe-hosted onboarding when payments are simulated. Clearly labeled as a demo. */
export default async function ConnectSimulatedPage({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams: Promise<{ from?: string }> }) {
  const { teamId } = await params;
  const { from } = await searchParams;
  const ctx = await loadTeamCtx(teamId);
  if (!ctx.isCoach) notFound();
  if (mode.payments !== 'simulated') redirect(`/app/manager/${teamId}/payouts`);
  const back = from === 'wizard' ? `/app/manager/new?team=${teamId}&step=4` : `/app/manager/${teamId}/payouts`;
  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      <PageHeader title="Connect payouts" sub={ctx.team.name} />
      <Banner tone="warn">Demo only. Stripe isn&apos;t set up on this site, so this connects a pretend account. No bank details are collected and no money moves.</Banner>
      <div className="flex flex-col gap-3 rounded-md border border-hairline-soft p-5">
        <h2 className="t-subhead">What happens with real Stripe</h2>
        <ol className="t-body list-decimal pl-5">
          <li>You go to a Stripe page to enter the school, booster club or coach&apos;s details and a bank account.</li>
          <li>Stripe checks identity and tax details. Gridiron Give never sees bank numbers.</li>
          <li>You come back here with the status: Connected, Needs more info, or Restricted.</li>
        </ol>
      </div>
      <ConnectSimulated teamId={teamId} from={from === 'wizard' ? 'wizard' : 'payouts'} back={back} connected={ctx.team.payoutsStatus === 'connected'} />
    </div>
  );
}
