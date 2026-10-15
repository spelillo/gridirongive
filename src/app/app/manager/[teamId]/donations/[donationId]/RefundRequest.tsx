'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Textarea, describedBy } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { requestRefund } from '@/lib/app/team-money-actions';

/** Managers can't refund in v1; this sends the request to an admin (ui-ux-spec 8.8). */
export function RefundRequest({ teamId, donationId }: { teamId: string; donationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const submit = () =>
    start(async () => {
      const r = await requestRefund(teamId, donationId, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setReason('');
      toast(r.message ?? 'Request sent');
      router.refresh();
    });
  return (
    <>
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Request a refund
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Request a refund"
        initialFocusSelector="#refund-reason"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} loadingLabel="Sending">
              Send request
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="t-body">A Gridiron Give admin reviews the request. If it&apos;s approved, the money comes off the items it funded and the donor is refunded to their card.</p>
          <Field id="refund-reason" label="Reason" required error={error} helper="For example: the donor asked within 30 days, or the gift was a duplicate.">
            <Textarea
              id="refund-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={describedBy('refund-reason', error, true)}
              required
            />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
