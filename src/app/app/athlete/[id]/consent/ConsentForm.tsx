'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Switch } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { giveConsent, type ConsentState } from '../consent-actions';

export function ConsentForm({ athleteId, first, under13, defaults, already, nameDefault }: { athleteId: string; first: string; under13: boolean; defaults: { showFullLastName: boolean; athleteCanEdit: boolean }; already: boolean; nameDefault: string }) {
  const [state, action, pending] = useActionState<ConsentState, FormData>(giveConsent.bind(null, athleteId), {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-5 border-t border-hairline-soft pt-6" noValidate>
      <h2 className="t-subhead">Your choices</h2>
      {state.error && !Object.keys(f).length && <Banner tone="error">{state.error}</Banner>}
      <div className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft px-4">
        <Switch id="show_full_last_name" name="show_full_last_name" defaultChecked={defaults.showFullLastName} label="Show full last name" hint={`Off: shown as ${first} and a last initial.`} />
        <Switch
          id="athlete_can_edit"
          name="athlete_can_edit"
          defaultChecked={!under13 && defaults.athleteCanEdit}
          disabled={under13}
          label={`Let ${first} edit the profile`}
          hint={under13 ? 'Not available for players under 13.' : `${first} can update the photo, bio and gear. You keep the privacy controls.`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Checkbox id="attest" name="attest" label={`I am ${first}'s parent or legal guardian`} aria-invalid={Boolean(f.attest) || undefined} aria-describedby={f.attest ? 'attest-error' : undefined} />
        {f.attest && (
          <p id="attest-error" className="t-caption text-error">
            {f.attest}
          </p>
        )}
      </div>
      <Field id="signed_name" label="Type your full name to sign" required error={f.signed_name}>
        <Input
          id="signed_name"
          name="signed_name"
          autoComplete="name"
          defaultValue={nameDefault}
          aria-invalid={Boolean(f.signed_name) || undefined}
          aria-describedby={f.signed_name ? 'signed_name-error' : undefined}
        />
      </Field>
      <p className="t-caption">We save your name, the time and your network address with this consent. You can withdraw it at any time.</p>
      <div>
        <Button type="submit" loading={pending} loadingLabel="Saving">
          {already ? 'Update consent' : 'Give consent'}
        </Button>
      </div>
    </form>
  );
}
