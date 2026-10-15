'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input, describedBy } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { saveProfile, saveEmailPref, deleteAccount } from '@/lib/app/account-actions';

export function ProfileForm({ email, fullName, phone }: { email: string; fullName: string; phone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(fullName);
  const [tel, setTel] = useState(phone);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = name !== fullName || tel !== phone;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveProfile({ fullName: name, phone: tel });
      if (!r.ok) return setError(r.error);
      toast('Saved');
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && <Banner tone="error">{error}</Banner>}
      <Field id="acct-name" label="Full name" helper="Shown to your team's coaches and staff.">
        <Input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} aria-describedby={describedBy('acct-name', null, true)} />
      </Field>
      <Field id="acct-phone" label="Phone" optional helper="Only coaches on your team can see it.">
        <Input id="acct-phone" type="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" inputMode="tel" maxLength={30} aria-describedby={describedBy('acct-phone', null, true)} />
      </Field>
      <Field id="acct-email" label="Email" helper="This is the address you sign in with. It can't be changed here.">
        <Input id="acct-email" value={email} readOnly aria-describedby={describedBy('acct-email', null, true)} />
      </Field>
      <div>
        <Button type="submit" loading={pending} loadingLabel="Saving" disabled={!dirty}>
          Save details
        </Button>
      </div>
    </form>
  );
}

type Pref = 'instant' | 'digest' | 'off';
type Category = 'donations' | 'approvals' | 'updates';

const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: 'donations', label: 'Gifts', hint: 'New gifts and fully funded items.' },
  { id: 'approvals', label: 'Approvals', hint: 'Profiles, items, messages and thank-yous waiting for you.' },
  { id: 'updates', label: 'Updates', hint: 'Purchases, deliveries, thank-yous and team news.' },
];

const OPTIONS: { id: Pref; label: string }[] = [
  { id: 'instant', label: 'Right away' },
  { id: 'digest', label: 'Daily summary' },
  { id: 'off', label: 'Off' },
];

export function EmailPrefs({ initial }: { initial: Record<Category, Pref> }) {
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<string>('');
  const [, start] = useTransition();
  const change = (c: Category, v: Pref) => {
    const before = prefs[c];
    setPrefs((p) => ({ ...p, [c]: v }));
    setStatus('Saving');
    start(async () => {
      const r = await saveEmailPref(c, v);
      if (!r.ok) {
        setPrefs((p) => ({ ...p, [c]: before }));
        setStatus(r.error);
      } else setStatus('Saved');
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
        {CATEGORIES.map((c) => (
          <div key={c.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col">
              <span id={`pref-${c.id}-l`} className="text-[16px] font-medium text-ink">
                {c.label}
              </span>
              <span id={`pref-${c.id}-h`} className="t-caption">
                {c.hint}
              </span>
            </div>
            <div role="radiogroup" aria-labelledby={`pref-${c.id}-l`} aria-describedby={`pref-${c.id}-h`} className="grid shrink-0 grid-cols-3 gap-1 rounded-md bg-chrome p-1 md:w-[360px]">
              {OPTIONS.map((o) => {
                const on = prefs[c.id] === o.id;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center justify-center rounded-[6px] px-2 text-center text-[14px] leading-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary',
                      on ? 'bg-canvas font-medium text-primary-deep shadow-[0_1px_2px_rgba(0,0,0,.15)]' : 'text-ink-list hover:text-ink',
                    )}
                  >
                    <input type="radio" name={`pref-${c.id}`} value={o.id} checked={on} onChange={() => change(c.id, o.id)} className="sr-only" />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p aria-live="polite" className="t-caption">
        {status}
      </p>
    </div>
  );
}

export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => {
    setOpen(false);
    setTyped('');
    setError(null);
  };
  const confirm = () =>
    start(async () => {
      // On success the action signs out and redirects.
      const r = await deleteAccount(typed);
      if (r && !r.ok) setError(r.error);
    });
  return (
    <>
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>
      <Sheet open={open} onClose={close} locked={pending} title="Delete your account?" size="md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          {error && <Banner tone="error">{error}</Banner>}
          <p className="t-body">You will be signed out and your login will stop working. This can&apos;t be undone.</p>
          <Field id="del-email" label={`Type ${email} to confirm`} required>
            <Input id="del-email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          </Field>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={pending} loadingLabel="Deleting" disabled={typed.trim().toLowerCase() !== email.toLowerCase()}>
              Delete account
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
