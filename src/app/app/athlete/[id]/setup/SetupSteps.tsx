'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { Meter } from '@/components/ui/Meter';
import { useToast } from '@/components/ui/Toast';
import { PhotoCropper } from '@/components/athlete/PhotoCropper';
import { GearEditor } from '@/components/athlete/GearEditor';
import { saveBasics, setStep, savePhotoAlt, removePhoto, saveBio, submitProfile } from '@/lib/app/athlete-actions';
import { moneyWhole } from '@/lib/domain/money';
import type { EditNeed } from '@/lib/app/athlete-data';

type A = {
  id: string;
  first: string;
  firstName: string;
  lastInitial: string;
  displayName: string;
  preferredName: string;
  jersey: string | null;
  position: string | null;
  grade: string;
  bio: string;
  photoSrc: string | null;
  photoAlt: string;
};

export function SetupSteps(props: {
  step: number;
  canEdit: boolean;
  forSelf: boolean;
  coach: string;
  requireApproval: boolean;
  live: boolean;
  athlete: A;
  teamName: string;
  needs: EditNeed[];
  catalog: { id: string; name: string; category: string; sizes: string[]; default_price_cents: number }[];
}) {
  const { step, athlete: a, canEdit } = props;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const go = (next: number) => router.push(`/app/athlete/${a.id}/setup?step=${next}`);
  const advance = (next: number, before?: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      if (before && canEdit) {
        const r = await before();
        if (!r.ok) return toast(r.error ?? 'Could not save.');
      }
      if (canEdit) await setStep(a.id, next);
      go(next);
    });

  const nav = (next: () => void, label = 'Save and continue', back = true) => (
    <div className="flex flex-col-reverse gap-3 border-t border-hairline-soft pt-6 sm:flex-row sm:justify-between">
      {back && step > 0 ? (
        <Button variant="tertiary" onClick={() => go(step - 1)}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={next} loading={pending} loadingLabel="Saving">
        {label}
      </Button>
    </div>
  );

  if (step === 0) return <Basics {...props} nav={nav} advance={advance} />;
  if (step === 1) return <PhotoStep {...props} nav={nav} advance={advance} />;
  if (step === 2) {
    return (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="t-section">Gear list</h2>
          <p className="t-body">
            {props.coach === 'your coach' ? 'Your coach' : props.coach} picked these items. Turn off anything {props.forSelf ? 'you' : a.first} already {props.forSelf ? 'have' : 'has'}, so supporters only fund what&apos;s needed. Prices are set by the coach.
          </p>
        </div>
        <GearEditor athleteId={a.id} needs={props.needs} catalog={props.catalog} photoSrc={a.photoSrc} canEdit={canEdit} first={props.forSelf ? 'you' : a.first} />
        {nav(() => advance(3))}
      </section>
    );
  }
  return <About {...props} pending={pending} start={start} />;
}

function Locked({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="t-label">{label}</span>
      <div className="flex min-h-11 items-center gap-2 rounded-md bg-chrome px-3 text-[16px] text-ink-body">
        <Lock size={16} aria-hidden className="text-ink-meta" />
        {value || <span className="text-ink-meta">Not set</span>}
      </div>
    </div>
  );
}

function Basics({ athlete: a, canEdit, nav, advance }: Parameters<typeof SetupSteps>[0] & { nav: (n: () => void) => React.ReactNode; advance: (n: number, b?: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  const [preferred, setPreferred] = useState(a.preferredName);
  return (
    <section className="flex flex-col gap-5">
      <h2 className="t-section">Basics</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Locked label="First name" value={a.firstName} />
        <Locked label="Last name" value={`${a.lastInitial}. (only the initial is shown)`} />
        <Locked label="Number" value={a.jersey ? `#${a.jersey}` : null} />
        <Locked label="Position" value={a.position} />
        <Locked label="Grade" value={a.grade} />
      </div>
      <p className="t-caption">Your coach set these. Ask them to change anything that&apos;s wrong.</p>
      <Field id="preferred" label="Preferred first name" optional helper={`Shown instead of ${a.firstName}, for example a nickname you go by.`}>
        <Input id="preferred" value={preferred} onChange={(e) => setPreferred(e.target.value)} maxLength={30} disabled={!canEdit} aria-describedby="preferred-help" />
      </Field>
      {nav(() => advance(1, () => saveBasics(a.id, { preferredName: preferred })))}
    </section>
  );
}

function PhotoStep({ athlete: a, canEdit, requireApproval, live, nav, advance }: Parameters<typeof SetupSteps>[0] & { nav: (n: () => void, label?: string) => React.ReactNode; advance: (n: number, b?: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [replacing, setReplacing] = useState(!a.photoSrc);
  const [alt, setAlt] = useState(a.photoAlt);
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="t-section">Photo</h2>
        <p className="t-body">A clear photo, standing, ideally in uniform. Face visible.</p>
        <p className="t-caption">
          {requireApproval ? 'Photos stay private until your coach approves them.' : live ? 'New photos show on your page right away.' : 'Your photo shows once your page is published.'} Location data is removed from the file.
        </p>
      </div>
      {!canEdit ? (
        a.photoSrc ? <img src={a.photoSrc} alt={a.photoAlt || `Photo of ${a.first}`} className="aspect-[3/4] w-full max-w-[300px] rounded-lg object-cover" /> : <p className="t-body">No photo yet.</p>
      ) : replacing ? (
        <PhotoCropper
          uploadUrl={`/api/athletes/${a.id}/photo`}
          onDone={() => {
            setReplacing(false);
            toast('Photo saved');
            router.refresh();
          }}
          onCancel={a.photoSrc ? () => setReplacing(false) : undefined}
        />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <img src={a.photoSrc!} alt={a.photoAlt || `Photo of ${a.first}`} className="aspect-[3/4] w-full max-w-[240px] rounded-lg bg-band object-cover" />
          <div className="flex flex-col gap-3">
            <Button variant="secondary" onClick={() => setReplacing(true)}>
              Replace photo
            </Button>
            <Button
              variant="tertiary"
              onClick={async () => {
                const r = await removePhoto(a.id);
                if (!r.ok) toast(r.error);
                router.refresh();
                setReplacing(true);
              }}
            >
              Remove photo
            </Button>
          </div>
        </div>
      )}
      {canEdit && a.photoSrc && !replacing && (
        <Field id="alt" label="Describe the photo" optional helper="Read aloud by screen readers. For example: Jayden in a blue home jersey holding a helmet.">
          <Input id="alt" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={140} aria-describedby="alt-help" />
        </Field>
      )}
      {nav(() => advance(2, () => (canEdit && a.photoSrc ? savePhotoAlt(a.id, alt) : Promise.resolve({ ok: true }))), a.photoSrc ? 'Save and continue' : 'Skip for now')}
    </section>
  );
}

function About({
  athlete: a,
  canEdit,
  forSelf,
  coach,
  requireApproval,
  live,
  needs,
  teamName,
  pending,
  start,
}: Parameters<typeof SetupSteps>[0] & { pending: boolean; start: (fn: () => Promise<void>) => void }) {
  const router = useRouter();
  const [bio, setBio] = useState(a.bio);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'submitted' | 'published'>(null);
  const items = needs.filter((n) => n.status !== 'removed' && n.requestStatus === 'approved');
  const goal = items.reduce((s, n) => s + n.priceCents, 0);
  const raised = items.reduce((s, n) => s + Math.min(n.raisedCents, n.priceCents), 0);

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <Banner tone="success">
          {done === 'published' ? 'Your page is live.' : `Sent to ${coach === 'your coach' ? 'your coach' : coach}. You'll get an email when ${forSelf ? 'your' : `${a.first}'s`} page is live.`}
        </Banner>
        <div>
          <Button onClick={() => router.push(`/app/athlete/${a.id}`)}>Go to {forSelf ? 'my page' : `${a.first}'s page`}</Button>
        </div>
      </div>
    );
  }

  const submit = () =>
    start(async () => {
      setError(null);
      const saved = await saveBio(a.id, bio);
      if (!saved.ok) return setError(saved.error);
      const r = await submitProfile(a.id);
      if (!r.ok) return setError(r.error);
      setDone(r.message === 'published' ? 'published' : 'submitted');
      router.refresh();
    });

  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        <h2 className="t-section">About</h2>
        <Field id="bio" label="Bio" optional labelAside={<span className="t-caption tabular">{bio.length}/500</span>} helper="Keep it about sports. Don't include your school schedule, address or phone.">
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 500))}
            disabled={!canEdit}
            rows={7}
            placeholder="What position do you play? How long have you played? What would new gear change for you?"
            aria-describedby="bio-help"
          />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="flex flex-col-reverse gap-3 border-t border-hairline-soft pt-6 sm:flex-row sm:justify-between">
          <Button variant="tertiary" onClick={() => router.push(`/app/athlete/${a.id}/setup?step=2`)}>
            Back
          </Button>
          {canEdit && (
            <Button onClick={submit} loading={pending} loadingLabel={requireApproval ? 'Sending' : 'Publishing'}>
              {requireApproval ? (live ? 'Send changes for approval' : 'Submit for approval') : live ? 'Save changes' : 'Publish'}
            </Button>
          )}
        </div>
      </div>
      <aside aria-label="Preview" className="flex flex-col gap-2">
        <p className="t-label">Preview</p>
        <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[28px] border-[6px] border-ink bg-canvas shadow-pop">
          <div className="flex max-h-[560px] flex-col gap-3 overflow-y-auto p-4">
            <div>
              <p className="text-[22px] font-medium leading-7 text-ink">{a.displayName}</p>
              <p className="t-caption">{[a.jersey ? `#${a.jersey}` : null, a.position, a.grade].filter(Boolean).join(' · ')}</p>
              <p className="text-[14px] text-primary">{teamName}</p>
            </div>
            {a.photoSrc ? (
              <img src={a.photoSrc} alt="" className="aspect-[3/4] w-full rounded-md bg-band object-cover" />
            ) : (
              <div className="flex aspect-[3/4] w-full items-center justify-center rounded-md bg-band text-[32px] font-medium text-ink-list">{a.jersey ? `#${a.jersey}` : ''}</div>
            )}
            <p className="text-[16px] font-medium tabular text-ink">
              {moneyWhole(raised)} <span className="font-normal text-ink-meta">of {moneyWhole(goal)}</span>
            </p>
            <Meter raised={raised} goal={goal || 1} compact showText={false} label="Preview of funding" />
            <ul className="flex flex-col gap-1.5">
              {items.map((n, i) => (
                <li key={n.id} className="flex justify-between gap-2 text-[14px]">
                  <span className="text-ink-body">
                    {i + 1}. {n.name}
                  </span>
                  <span className="tabular text-ink-meta">{moneyWhole(Math.max(n.priceCents - n.raisedCents, 0))} left</span>
                </li>
              ))}
            </ul>
            {bio && (
              <div>
                <p className="text-[15px] font-medium text-ink">About {a.first}</p>
                <p className="whitespace-pre-line text-[14px] leading-5 text-ink-body">{bio}</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}
