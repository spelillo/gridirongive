'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Switch, Field, Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { setHidden, setPrivacy, removePhoto, withdrawConsent, deleteProfile } from '@/lib/app/athlete-actions';
import { money } from '@/lib/domain/money';

export function GuardianControls(p: {
  athleteId: string;
  first: string;
  status: string;
  hiddenReason: string | null;
  showFullLastName: boolean;
  athleteCanEdit: boolean;
  under13: boolean;
  hasPhoto: boolean;
  heldCents: number;
  consentLine: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | 'withdraw' | 'delete'>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? ok : (r.error ?? 'That did not work.'));
      router.refresh();
    });
  const hidden = p.status === 'hidden';
  const canHide = p.status !== 'needs_consent';

  return (
    <>
      <section aria-labelledby="priv-h" className="flex flex-col gap-4">
        <h2 id="priv-h" className="t-subhead">
          Privacy controls
        </h2>
        {canHide && (
          <div className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[16px] font-medium text-ink">{hidden ? 'The page is hidden' : 'Hide the page now'}</p>
              <p className="t-caption">
                {hidden
                  ? p.hiddenReason === 'manager'
                    ? 'The coach hid it. Ask them to show it again.'
                    : 'Only you, the player and the team can see it.'
                  : 'Nobody outside the team sees it until you show it again. Gifts already made stay with the gear.'}
              </p>
            </div>
            {!(hidden && p.hiddenReason === 'manager') && (
              <Button variant={hidden ? 'primary' : 'secondary'} loading={pending} onClick={() => run(() => setHidden(p.athleteId, !hidden), hidden ? 'Page visible again' : 'Page hidden')}>
                {hidden ? 'Show the page' : 'Hide now'}
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft px-4">
          <Switch
            id="full-last"
            label="Show full last name"
            hint={`Off: ${p.first} and a last initial.`}
            defaultChecked={p.showFullLastName}
            disabled={pending}
            onChange={(e) => run(() => setPrivacy(p.athleteId, { showFullLastName: e.target.checked }), 'Saved')}
          />
          <Switch
            id="athlete-edit"
            label={`Let ${p.first} edit the profile`}
            hint={p.under13 ? 'Not available for players under 13.' : 'Photo, bio and gear. Privacy controls stay with you.'}
            defaultChecked={p.athleteCanEdit && !p.under13}
            disabled={pending || p.under13}
            onChange={(e) => run(() => setPrivacy(p.athleteId, { athleteCanEdit: e.target.checked }), 'Saved')}
          />
        </div>
        {p.hasPhoto && (
          <div>
            <Button variant="secondary" loading={pending} onClick={() => run(() => removePhoto(p.athleteId), 'Photo deleted')}>
              Delete the photo
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="consent-h" className="flex flex-col gap-3 border-t border-hairline-soft pt-6">
        <h2 id="consent-h" className="t-subhead">
          Consent
        </h2>
        <p className="t-body">{p.consentLine ?? 'Consent has not been given.'}</p>
        {p.consentLine && (
          <div>
            <Button variant="secondary" onClick={() => setConfirm('withdraw')}>
              Withdraw consent
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="danger-h" className="flex flex-col gap-3 border-t border-hairline-soft pt-6">
        <h2 id="danger-h" className="t-subhead text-error">
          Delete profile
        </h2>
        {p.heldCents > 0 ? (
          <p className="t-body">
            Supporters gave {money(p.heldCents)} toward gear that hasn&apos;t been delivered yet, so the profile can&apos;t be deleted until the coach delivers that gear or moves the funds to
            the team fund. You can hide the page right now instead.
          </p>
        ) : (
          <>
            <p className="t-body">Removes the photo, bio and contact details, and takes {p.first} off the roster. This can&apos;t be undone.</p>
            <div>
              <Button variant="destructive" onClick={() => setConfirm('delete')}>
                Delete profile
              </Button>
            </div>
          </>
        )}
      </section>

      <Sheet open={confirm !== null} onClose={() => (setConfirm(null), setTyped(''), setError(null))} title={confirm === 'delete' ? 'Delete profile?' : 'Withdraw consent?'} size="md">
        <div className="flex flex-col gap-4">
          {error && <Banner tone="error">{error}</Banner>}
          {confirm === 'withdraw' ? (
            <p className="t-body">The page is hidden right away and the coach is told. Gifts already made stay earmarked for {p.first}&apos;s gear. You can give consent again later.</p>
          ) : (
            <Field id="confirm-name" label={`Type ${p.first} to confirm`} required>
              <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </Field>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              disabled={confirm === 'delete' && typed.trim().toLowerCase() !== p.first.toLowerCase()}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = confirm === 'delete' ? await deleteProfile(p.athleteId, typed) : await withdrawConsent(p.athleteId);
                  if (!r.ok) return setError(r.error);
                  setConfirm(null);
                  if (confirm === 'delete') router.push('/app');
                  else {
                    toast('Consent withdrawn. The page is hidden.');
                    router.refresh();
                  }
                })
              }
            >
              {confirm === 'delete' ? 'Delete profile' : 'Withdraw consent'}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
