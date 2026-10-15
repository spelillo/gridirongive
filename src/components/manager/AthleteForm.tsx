'use client';
import { useState } from 'react';
import { Field, Input, Select, Checkbox } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { AthleteInput } from '@/lib/app/team-actions';

export interface AthleteFormValues {
  firstName: string;
  lastName: string;
  jersey: string;
  position: string;
  grade: string;
  guardianEmail: string;
  guardian2Email: string;
  guardianPhone: string;
  athleteEmail: string;
}

export const EMPTY_ATHLETE: AthleteFormValues = {
  firstName: '',
  lastName: '',
  jersey: '',
  position: '',
  grade: '',
  guardianEmail: '',
  guardian2Email: '',
  guardianPhone: '',
  athleteEmail: '',
};

const POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'DB', 'K', 'P', 'LS'];

export function toInput(v: AthleteFormValues): AthleteInput {
  return { ...v, grade: v.grade ? Number(v.grade) : null };
}

/**
 * Add or edit one athlete (ui-ux-spec 8.3). With `create`, it also offers
 * "Send invite now" and the gear template to start from.
 */
export function AthleteForm({
  initial = EMPTY_ATHLETE,
  create,
  templates = [],
  submitLabel,
  onSubmit,
  onCancel,
  sport,
}: {
  initial?: AthleteFormValues;
  create?: boolean;
  templates?: { id: string; name: string }[];
  submitLabel: string;
  sport?: string;
  onSubmit: (v: AthleteFormValues, opts: { sendInvite: boolean; templateId: string }) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [sendInvite, setSendInvite] = useState(true);
  const [templateId, setTemplateId] = useState('auto');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof AthleteFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const id = (k: string) => `af-${k}`;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.firstName.trim() || !v.lastName.trim()) {
          setError('Add a first and last name.');
          return;
        }
        setBusy(true);
        setError(null);
        const err = await onSubmit(v, { sendInvite: sendInvite && Boolean(v.guardianEmail), templateId });
        setBusy(false);
        if (err) setError(err);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('first')} label="First name" required>
          <Input id={id('first')} value={v.firstName} onChange={set('firstName')} maxLength={40} autoComplete="off" required />
        </Field>
        <Field id={id('last')} label="Last name" required helper="Donors see the first letter only, unless a guardian opts in.">
          <Input id={id('last')} value={v.lastName} onChange={set('lastName')} maxLength={40} autoComplete="off" required aria-describedby={`${id('last')}-help`} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field id={id('num')} label="Number" optional>
          <Input id={id('num')} value={v.jersey} onChange={set('jersey')} inputMode="numeric" pattern="\d*" maxLength={2} />
        </Field>
        <Field id={id('pos')} label="Position" optional>
          {sport === 'football' || !sport ? (
            <Select id={id('pos')} value={v.position} onChange={set('position')}>
              <option value="">None</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              {v.position && !POSITIONS.includes(v.position) && <option value={v.position}>{v.position}</option>}
            </Select>
          ) : (
            <Input id={id('pos')} value={v.position} onChange={set('position')} maxLength={4} />
          )}
        </Field>
        <Field id={id('grade')} label="Grade" optional>
          <Select id={id('grade')} value={v.grade} onChange={set('grade')}>
            <option value="">None</option>
            {Array.from({ length: 12 }, (_, i) => 12 - i).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={id('gemail')} label="Guardian email" helper="The invite goes here. A guardian gives consent before anything is public.">
        <Input id={id('gemail')} type="email" value={v.guardianEmail} onChange={set('guardianEmail')} autoComplete="off" aria-describedby={`${id('gemail')}-help`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('g2email')} label="Second guardian email" optional>
          <Input id={id('g2email')} type="email" value={v.guardian2Email} onChange={set('guardian2Email')} autoComplete="off" />
        </Field>
        <Field id={id('gphone')} label="Guardian phone" optional>
          <Input id={id('gphone')} type="tel" value={v.guardianPhone} onChange={set('guardianPhone')} autoComplete="off" />
        </Field>
      </div>
      <Field id={id('aemail')} label="Athlete email" optional helper="Athletes 13 and older can get their own sign-in after a guardian consents.">
        <Input id={id('aemail')} type="email" value={v.athleteEmail} onChange={set('athleteEmail')} autoComplete="off" aria-describedby={`${id('aemail')}-help`} />
      </Field>
      {create && (
        <>
          <Field id={id('tpl')} label="Gear list">
            <Select id={id('tpl')} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="auto">Match their position</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="none">Start empty</option>
            </Select>
          </Field>
          <Checkbox
            id={id('invite')}
            checked={sendInvite && Boolean(v.guardianEmail)}
            disabled={!v.guardianEmail}
            onChange={(e) => setSendInvite(e.target.checked)}
            label="Send invite now"
            hint={v.guardianEmail ? undefined : 'Add a guardian email to send an invite.'}
          />
        </>
      )}
      {error && (
        <p role="alert" className="text-[14px] text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
