'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea, describedBy } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { REPORT_REASONS } from '@/lib/report-reasons';

type Errors = Partial<Record<'reason' | 'details' | 'email' | 'page' | 'form', string>>;

const LABELS: Record<string, string> = { reason: "What's wrong", details: 'Details', email: 'Your email', page: 'Page link' };

function validate(f: { reason: string; details: string; email: string }): Errors {
  const e: Errors = {};
  if (!f.reason) e.reason = 'Choose what is wrong.';
  if (f.reason === 'other' && f.details.trim().length < 10) e.details = 'Tell us what is wrong in a sentence or two.';
  if (f.details.length > 2000) e.details = 'Keep the details under 2,000 characters.';
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email address, or leave it blank.';
  return e;
}

export function ReportForm({ team, athlete, about, backHref }: { team: string; athlete: string; about: string | null; backHref: string | null }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [page, setPage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const blur = (k: 'reason' | 'details' | 'email') => {
    const e = validate({ reason, details, email });
    setErrors((prev) => ({ ...prev, [k]: k === 'reason' && !reason ? prev.reason : e[k] }));
  };

  const submit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const website = String(new FormData(ev.currentTarget).get('website') ?? '');
    const e = validate({ reason, details, email });
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, details, email, page, team, athlete, website }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setDone(true);
        requestAnimationFrame(() => doneRef.current?.focus());
        return;
      }
      setErrors({ ...(data?.fields ?? {}), form: data?.error ?? 'We could not send the report. Try again.' });
      requestAnimationFrame(() => summaryRef.current?.focus());
    } catch {
      setErrors({ form: "We couldn't send the report. Check your connection and try again." });
      requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="flex flex-col gap-3 rounded-md bg-funded-bg p-5 outline-none">
        <p className="flex items-center gap-2 text-[16px] font-medium text-ink">
          <CheckCircle2 aria-hidden size={20} className="text-funded" /> Thanks. We got your report.
        </p>
        <p className="t-body">
          An admin will review it. {email ? "We'll email you if we need more details." : 'Leave your email next time if you want us to follow up.'} If a child is in
          immediate danger, call 911.
        </p>
        {backHref && (
          <p>
            <Link href={backHref}>Back to the page</Link>
          </p>
        )}
      </div>
    );
  }

  const fieldErrors = (Object.keys(errors) as (keyof Errors)[]).filter((k) => k !== 'form' && errors[k]);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {(fieldErrors.length > 0 || errors.form) && (
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          <Banner tone="error">
            {errors.form ?? 'Fix the following:'}
            {fieldErrors.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {fieldErrors.map((k) => (
                  <li key={k}>
                    <a href={`#report-${k}`}>
                      {LABELS[k]}: {errors[k]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Banner>
        </div>
      )}

      {about ? (
        <p className="t-body">
          About: <span className="font-medium text-ink">{about}</span>
        </p>
      ) : (
        <Field id="report-page" label="Page link" optional helper="Paste the link to the team or player page, if you have it.">
          <Input id="report-page" type="url" inputMode="url" value={page} onChange={(e) => setPage(e.target.value)} maxLength={300} aria-describedby="report-page-help" />
        </Field>
      )}

      <Field id="report-reason" label="What's wrong" required error={errors.reason}>
        <Select
          id="report-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (errors.reason) setErrors((p) => ({ ...p, reason: undefined }));
          }}
          onBlur={() => blur('reason')}
          aria-invalid={Boolean(errors.reason) || undefined}
          aria-describedby={describedBy('report-reason', errors.reason)}
          required
        >
          <option value="">Choose one</option>
          {REPORT_REASONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="report-details" label="Details" optional={reason !== 'other'} required={reason === 'other'} error={errors.details} helper="What did you see, and where on the page? Don't include anyone's contact details.">
        <Textarea
          id="report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          onBlur={() => blur('details')}
          maxLength={2000}
          rows={5}
          aria-invalid={Boolean(errors.details) || undefined}
          aria-describedby={describedBy('report-details', errors.details, true)}
        />
      </Field>

      <Field id="report-email" label="Your email" optional error={errors.email} helper="Only if you want us to follow up. We won't share it with the team.">
        <Input
          id="report-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
          onBlur={() => blur('email')}
          aria-invalid={Boolean(errors.email) || undefined}
          aria-describedby={describedBy('report-email', errors.email, true)}
        />
      </Field>

      {/* Honeypot for bots. Hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="report-website">Website</label>
        <input id="report-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <Button type="submit" loading={busy} loadingLabel="Sending" fullMobile>
          Send report
        </Button>
      </div>
    </form>
  );
}
