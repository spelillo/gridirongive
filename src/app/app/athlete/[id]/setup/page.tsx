import { redirect } from 'next/navigation';
import { loadAthleteCtx } from '@/lib/app/athlete';
import { athleteNeeds, catalogFor } from '@/lib/app/athlete-data';
import { Stepper } from '@/components/ui/Stepper';
import { Banner } from '@/components/ui/Banner';
import { gradeLabel, possessive } from '@/lib/domain/names';
import { SetupSteps } from './SetupSteps';

export const metadata = { title: 'Set up your page' };

const STEPS = ['Basics', 'Photo', 'Gear list', 'About'];

/** Profile setup (ui-ux-spec 7.3): four steps, saved as you go. */
export default async function SetupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  const { step: stepParam } = await searchParams;
  const ctx = await loadAthleteCtx(id);
  const { athlete: a, team } = ctx;
  if (!a.consentAt) {
    if (ctx.role === 'guardian') redirect(`/app/athlete/${id}/consent`);
    return (
      <div className="flex max-w-[640px] flex-col gap-4">
        <h1 className="t-hero">Almost ready</h1>
        <Banner tone="info">A parent or guardian needs to give consent before you can set up your page. We emailed them an invite.</Banner>
      </div>
    );
  }
  const step = Math.max(0, Math.min(3, Number(stepParam ?? Math.min(a.setupStep, 3)) || 0));
  const [needs, catalog] = await Promise.all([athleteNeeds(ctx.user.id, id), catalogFor(ctx.user.id, team.sport)]);
  const forSelf = ctx.role === 'athlete';
  const photoSrc = a.photoPath ? `/media/athlete/${a.id}?draft=1&v=${encodeURIComponent(a.photoPath.slice(-12))}` : null;

  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="t-caption">{team.name}</p>
        <h1 className="t-hero">{forSelf ? 'Set up your page' : `Set up ${possessive(a.first)} page`}</h1>
      </header>
      <Stepper steps={STEPS.map((label, i) => ({ label, done: i < a.setupStep }))} current={step} hrefFor={(i) => (i <= a.setupStep ? `/app/athlete/${id}/setup?step=${i}` : undefined)} />
      {!ctx.canEdit && <Banner tone="info">Your parent or guardian manages this profile. You can look, but not change it.</Banner>}
      {a.status === 'changes_requested' && a.reviewNote && (
        <Banner tone="warn">
          <span className="font-medium">{team.coach} asked for changes:</span> {a.reviewNote}
        </Banner>
      )}
      <SetupSteps
        step={step}
        canEdit={ctx.canEdit}
        forSelf={forSelf}
        coach={team.coach}
        requireApproval={team.requireProfileApproval}
        live={a.status === 'live'}
        athlete={{
          id: a.id,
          first: a.first,
          firstName: a.firstName,
          lastInitial: a.lastName.charAt(0).toUpperCase(),
          displayName: a.displayName,
          preferredName: a.preferredName ?? '',
          jersey: a.jersey,
          position: a.position,
          grade: gradeLabel(a.grade),
          bio: a.bio,
          photoSrc,
          photoAlt: a.photoAlt ?? '',
        }}
        teamName={team.name}
        needs={needs}
        catalog={catalog}
      />
    </div>
  );
}
