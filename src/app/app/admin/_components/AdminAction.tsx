'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';

type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * One admin action button. With `confirm` it opens a sheet first, and with
 * `reason` that sheet asks for a written reason (required unless optional).
 */
export function AdminAction({
  action,
  label,
  variant = 'secondary',
  size,
  confirm,
  reason,
  confirmLabel,
  srLabel,
}: {
  action: (text: string) => Promise<Result>;
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  confirm?: { title: string; body?: string };
  reason?: { label: string; helper?: string; optional?: boolean };
  confirmLabel?: string;
  /** Fuller accessible name when the visible label is short, like "Approve Central High". */
  srLabel?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(null);
      const r = await action(text);
      if (!r.ok) {
        if (open) setError(r.error);
        else toast(r.error);
        return;
      }
      toast(r.message ?? 'Done');
      setOpen(false);
      setText('');
      router.refresh();
    });
  const needsSheet = Boolean(confirm || reason);
  const tooShort = Boolean(reason && !reason.optional && text.trim().length < 5);
  const fieldId = `reason-${useId().replace(/:/g, '')}`;
  return (
    <>
      <Button variant={variant} size={size} loading={pending && !open} aria-label={srLabel} onClick={() => (needsSheet ? setOpen(true) : go())}>
        {label}
      </Button>
      {needsSheet && (
        <Sheet open={open} onClose={() => (setOpen(false), setError(null))} locked={pending} title={confirm?.title ?? label} size="md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            {error && <Banner tone="error">{error}</Banner>}
            {confirm?.body && <p className="t-body">{confirm.body}</p>}
            {reason && (
              <Field id={fieldId} label={reason.label} required={!reason.optional} optional={reason.optional} helper={reason.helper ?? (reason.optional ? undefined : 'At least 5 characters.')}>
                <Textarea id={fieldId} value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={4} aria-describedby={`${fieldId}-help`} />
              </Field>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant={variant === 'destructive' ? 'destructive' : 'primary'} loading={pending} disabled={tooShort}>
                {confirmLabel ?? label}
              </Button>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}
