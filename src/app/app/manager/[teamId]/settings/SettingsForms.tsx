'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, Trash2, UserPlus } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { DEFAULT_TEAM_COLOR, TEAM_COLORS } from '@/config/team-colors';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch, Textarea, describedBy } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { money } from '@/lib/domain/money';
import { uploadTeamFile } from '@/lib/app/upload-client';
import {
  saveTeamProfile, setTeamPrivacy, inviteStaff, removeStaff, startNextSeason, deleteTeam, removeTeamPhoto,
} from '@/lib/app/team-settings-actions';

type R = { ok: true; message?: string; redirect?: string } | { ok: false; error: string; field?: string };

function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<R>, onError?: (r: Extract<R, { ok: false }>) => void, onOk?: (r: Extract<R, { ok: true }>) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        if (onError) onError(r);
        else toast(r.error);
        return;
      }
      if (r.message) toast(r.message);
      onOk?.(r);
      if (r.redirect) router.push(r.redirect);
      else router.refresh();
    });
  return { pending, run };
}

export function TeamPhoto({ teamId, hasPhoto, canEdit }: { teamId: string; hasPhoto: boolean; canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex aspect-[16/9] w-full max-w-[240px] items-center justify-center overflow-hidden rounded-md border border-hairline-soft bg-chrome">
        {hasPhoto ? <img src={`/media/team/${teamId}?v=${v}`} alt="Team photo" className="size-full object-cover" /> : <span className="t-caption">No team photo</span>}
      </div>
      {canEdit && (
        <div className="flex flex-col gap-2">
          <label htmlFor="team-photo" className="sr-only">
            Team photo
          </label>
          <input
            ref={ref}
            id="team-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setError(null);
              const r = await uploadTeamFile(teamId, 'team', f);
              setBusy(false);
              if (!r.ok) setError(r.error);
              else {
                setV((x) => x + 1);
                router.refresh();
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => ref.current?.click()} disabled={busy}>
              {busy ? <Spinner /> : <Camera size={18} aria-hidden />} {hasPhoto ? 'Replace photo' : 'Add a photo'}
            </Button>
            {hasPhoto && (
              <Button variant="tertiary" loading={pending} onClick={() => run(() => removeTeamPhoto(teamId))}>
                Remove
              </Button>
            )}
          </div>
          <p className="t-caption" aria-live="polite">
            {error ?? 'JPG, PNG or WebP, up to 4 MB. A wide group photo works best.'}
          </p>
        </div>
      )}
    </div>
  );
}

export function ProfileForm({
  teamId,
  name,
  about,
  seasonLabel,
  color,
  canEdit,
}: {
  teamId: string;
  name: string;
  about: string;
  seasonLabel: string;
  color: string | null;
  canEdit: boolean;
}) {
  const [v, setV] = useState({ name, about, seasonLabel, color });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const dirty = v.name !== name || v.about !== about || v.seasonLabel !== seasonLabel || v.color !== color;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        run(() => saveTeamProfile(teamId, v), (r) => setErrors({ [r.field ?? 'team-name']: r.error }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field id="team-name" label="Team name" required error={errors['team-name']}>
          <Input id="team-name" value={v.name} maxLength={80} disabled={!canEdit} onChange={(e) => setV({ ...v, name: e.target.value })} aria-invalid={Boolean(errors['team-name']) || undefined} aria-describedby={describedBy('team-name', errors['team-name'])} />
        </Field>
        <Field id="season-label" label="Season" required error={errors['season-label']}>
          <Input id="season-label" value={v.seasonLabel} maxLength={40} disabled={!canEdit} onChange={(e) => setV({ ...v, seasonLabel: e.target.value })} aria-invalid={Boolean(errors['season-label']) || undefined} aria-describedby={describedBy('season-label', errors['season-label'])} />
        </Field>
      </div>
      <Field id="about" label="About" optional helper={`${v.about.length} of 1,000 characters. Shown on the public team page.`} error={errors.about}>
        <Textarea id="about" value={v.about} maxLength={1000} rows={5} disabled={!canEdit} onChange={(e) => setV({ ...v, about: e.target.value })} aria-describedby={describedBy('about', errors.about, true)} />
      </Field>
      <fieldset className="flex flex-col gap-2" aria-describedby="team-color-h">
        <legend className="t-label mb-2 text-ink">Team color</legend>
        <p id="team-color-h" className="t-caption -mt-1">
          Used on your team page, player pages and the give form.
        </p>
        <div className="flex flex-wrap gap-2">
          {[{ name: 'Default', hex: null }, ...TEAM_COLORS].map((c) => {
            const on = (v.color ?? null) === c.hex;
            return (
              <label
                key={c.name}
                title={c.name}
                className={cn(
                  'relative flex size-11 cursor-pointer items-center justify-center rounded-full ring-offset-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                  on && 'ring-2 ring-ink',
                  !canEdit && 'cursor-not-allowed opacity-60',
                )}
                style={{ background: c.hex ?? DEFAULT_TEAM_COLOR }}
              >
                <input type="radio" name="team-color" className="sr-only" checked={on} disabled={!canEdit} onChange={() => setV({ ...v, color: c.hex })} />
                <span className="sr-only">{c.name}</span>
                {on && <Check size={18} strokeWidth={3} className="text-white" aria-hidden />}
              </label>
            );
          })}
        </div>
        {errors['team-color'] && (
          <p className="t-caption text-error" role="alert">
            {errors['team-color']}
          </p>
        )}
      </fieldset>
      {canEdit && (
        <div>
          <Button type="submit" loading={pending} loadingLabel="Saving" disabled={!dirty}>
            Save profile
          </Button>
        </div>
      )}
    </form>
  );
}

const PRIVACY_ROWS = [
  { key: 'require_profile_approval', label: 'Approve player profiles', hint: 'New photos and bios wait for a coach before they show.' },
  { key: 'require_thankyou_approval', label: 'Approve thank-you notes', hint: 'Notes from players wait for a coach before donors get them.' },
  { key: 'require_message_approval', label: 'Approve donor messages', hint: 'Messages from donors wait for a coach before they show.' },
  { key: 'show_amounts_to_athletes', label: 'Show gift amounts to players', hint: 'Off: players see names and messages only.' },
] as const;

export function PrivacyToggles({ teamId, values, canEdit }: { teamId: string; values: Record<(typeof PRIVACY_ROWS)[number]['key'], boolean>; canEdit: boolean }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft px-4">
      {PRIVACY_ROWS.map((row) => (
        <Switch
          key={row.key}
          id={`p-${row.key}`}
          label={row.label}
          hint={row.hint}
          defaultChecked={values[row.key]}
          disabled={!canEdit || pending}
          onChange={(e) => run(() => setTeamPrivacy(teamId, row.key, e.target.checked))}
        />
      ))}
    </div>
  );
}

export function StaffInvite({ teamId }: { teamId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        run(
          () => inviteStaff(teamId, { email, role, title }),
          (r) => setErrors({ [r.field ?? 'staff-email']: r.error }),
          () => {
            setEmail('');
            setTitle('');
          },
        );
      }}
    >
      <h3 className="t-label">Invite someone</h3>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1.4fr]">
        <Field id="staff-email" label="Email" required error={errors['staff-email']}>
          <Input id="staff-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors['staff-email']) || undefined} aria-describedby={describedBy('staff-email', errors['staff-email'])} />
        </Field>
        <Field id="staff-role" label="Role" required error={errors['staff-role']}>
          <Select id="staff-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="staff">Staff</option>
            <option value="viewer">Viewer</option>
          </Select>
        </Field>
        <Field id="staff-title" label="Title" optional>
          <Input id="staff-title" value={title} maxLength={60} placeholder="Assistant coach" onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" loading={pending} loadingLabel="Sending">
          <UserPlus size={18} aria-hidden /> Send invite
        </Button>
        <p className="t-caption">They get access when they sign in with this email.</p>
      </div>
    </form>
  );
}

export function RemoveStaff({ teamId, memberId, label }: { teamId: string; memberId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <>
      <Button variant="tertiary" onClick={() => setOpen(true)} aria-label={`Remove ${label}`}>
        Remove
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove ${label}?`}
        locked={pending}
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={pending} onClick={() => run(() => removeStaff(teamId, memberId), undefined, () => setOpen(false))}>
              Remove access
            </Button>
          </div>
        }
      >
        <p className="t-body">They lose access to this team right away. You can invite them again later.</p>
      </Sheet>
    </>
  );
}

export function NextSeason({ teamId }: { teamId: string }) {
  const year = new Date().getFullYear();
  const [label, setLabel] = useState(`Fall ${year + 1}`);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        run(() => startNextSeason(teamId, { label, startsOn, endsOn }), (r) => setError(r.error));
      }}
    >
      <h3 className="t-label">Start next season</h3>
      <p className="t-caption">Copies the roster without graduating seniors, moves everyone up a grade, and resets each player&apos;s gear from your templates. The unspent team fund carries over.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="next-label" label="Season label" required error={error}>
          <Input id="next-label" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy('next-label', error)} />
        </Field>
        <Field id="next-start" label="Starts" optional>
          <Input id="next-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </Field>
        <Field id="next-end" label="Ends" optional>
          <Input id="next-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="submit" loading={pending} loadingLabel="Starting">
          Start next season
        </Button>
      </div>
    </form>
  );
}

export function DeleteTeam({ teamId, teamName, heldCents }: { teamId: string; teamName: string; heldCents: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  const blocked = heldCents > 0;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-error p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-ink">Delete this team</p>
        <p className="t-caption">
          {blocked
            ? `Not available while the team holds ${money(heldCents)}. Buy the gear or close the season first.`
            : 'Everyone loses access. Gift and purchase records stay on file for your organization.'}
        </p>
      </div>
      <Button variant="destructive" disabled={blocked} onClick={() => setOpen(true)}>
        <Trash2 size={18} aria-hidden /> Delete team
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this team?"
        locked={pending}
        initialFocusSelector="#delete-name"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              disabled={typed.trim().toLowerCase() !== teamName.trim().toLowerCase()}
              onClick={() => run(() => deleteTeam(teamId, typed), (r) => setError(r.error))}
            >
              Delete team
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="t-body">This can&apos;t be undone. The team page, roster and player pages go away for everyone.</p>
          <Field id="delete-name" label={`Type ${teamName} to confirm`} required error={error}>
            <Input id="delete-name" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy('delete-name', error)} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
