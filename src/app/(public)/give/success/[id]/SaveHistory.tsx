'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

/** Optional: turn a guest gift into a donor account with one sign-in link. */
export function SaveHistory({ email: initial }: { email: string }) {
  const [email, setEmail] = useState(initial);
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    const res = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, next: '/app/donor' }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (data?.ok) setState('sent');
    else {
      setState('error');
      setError(data?.error ?? 'Could not send the link. Try again.');
    }
  };
  return (
    <section aria-labelledby="save-h" className="flex flex-col gap-3 border-t border-hairline-soft pt-6">
      <h2 id="save-h" className="t-subhead">
        Save your giving history
      </h2>
      {state === 'sent' ? (
        <p className="t-body" role="status">
          Check {email} for a sign-in link.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field id="save-email" label="Email" error={state === 'error' ? error : undefined} className="flex-1">
            <Input id="save-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={state === 'error' || undefined} aria-describedby={state === 'error' ? 'save-email-error' : undefined} />
          </Field>
          <Button type="submit" variant="secondary" loading={state === 'busy'}>
            Send sign-in link
          </Button>
        </form>
      )}
    </section>
  );
}
