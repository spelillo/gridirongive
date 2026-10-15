import { loadAthleteCtx } from '@/lib/app/athlete';
import { athleteNeeds, catalogFor } from '@/lib/app/athlete-data';
import { GearEditor } from '@/components/athlete/GearEditor';
import { possessive } from '@/lib/domain/names';

export const metadata = { title: 'Gear' };

/** Player gear list (ui-ux-spec 7.5). */
export default async function GearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAthleteCtx(id);
  const [needs, catalog] = await Promise.all([athleteNeeds(ctx.user.id, id), catalogFor(ctx.user.id, ctx.team.sport)]);
  const a = ctx.athlete;
  const photoSrc = a.photoPath ? `/media/athlete/${a.id}?draft=1&v=${encodeURIComponent(a.photoPath.slice(-12))}` : null;
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="t-hero">{ctx.role === 'athlete' ? 'My gear' : `${possessive(a.first)} gear`}</h1>
        <p className="t-body">Turn off items you already have. New items need coach approval. Removing an item with no gifts yet happens right away.</p>
      </header>
      <GearEditor athleteId={id} needs={needs} catalog={catalog} photoSrc={photoSrc} canEdit={ctx.canEdit} first={ctx.role === 'athlete' ? 'you' : a.first} />
    </div>
  );
}
