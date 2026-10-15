'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

export function SignInForm({ next, initialEmail, demo }: { next: string; initialEmail: string; demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/magic-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, next }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!data?.ok) {
      setError(data?.error ?? 'We could not send the email. Try again.');
      return;
    }
    setStep('code');
    setCooldown(30);
    requestAnimationFrame(() => codeRef.current?.focus());
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, next }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!data?.ok) {
      setBusy(false);
      setError(data?.error ?? 'That code did not work. Try again.');
      return;
    }
    router.push(data.next);
    router.refresh();
  };

  if (step === 'email') {
    return (
      <form onSubmit={send} className="flex flex-col gap-4" noValidate>
        <Field id="signin-email" label="Email" error={error}>
          <Input
            id="signin-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? 'signin-email-error' : undefined}
          />
        </Field>
        <Button type="submit" loading={busy} loadingLabel="Sending" full>
          Email me a sign-in link
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="status" className="flex items-start gap-3 rounded-md bg-band p-4">
        <MailCheck aria-hidden size={22} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[15px] leading-[22px] text-ink-body">
          We sent a link and a 6-digit code to <span className="font-medium text-ink">{email}</span>. Open the link on this device, or enter the code below.
          {demo && (
            <>
              {' '}
              In demo mode it&apos;s in the <Link href="/dev/outbox" target="_blank">outbox</Link>.
            </>
          )}
        </p>
      </div>
      <form onSubmit={verify} className="flex flex-col gap-4">
        <Field id="signin-code" label="Code" error={error}>
          <Input
            ref={codeRef}
            id="signin-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            className="max-w-48 text-[20px] tracking-[0.2em] tabular"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? 'signin-code-error' : undefined}
          />
        </Field>
        <Button type="submit" loading={busy} loadingLabel="Checking" disabled={code.length !== 6} full>
          Sign in
        </Button>
      </form>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <button type="button" className="min-h-11 text-[15px] text-primary hover:underline disabled:text-ink-meta disabled:no-underline" disabled={cooldown > 0 || busy} onClick={() => send()}>
          {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send again'}
        </button>
        <button
          type="button"
          className="min-h-11 text-[15px] text-primary hover:underline"
          onClick={() => {
            setStep('email');
            setCode('');
            setError(null);
          }}
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}
