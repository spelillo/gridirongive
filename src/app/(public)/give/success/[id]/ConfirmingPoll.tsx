'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Totals only move when Stripe's webhook arrives (ui-ux-spec 5.5). Until
 * then the page re-checks for up to 10 seconds.
 */
export function ConfirmingPoll() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const done = tries >= 7;
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, 1500);
    return () => clearTimeout(t);
  }, [tries, done, router]);
  return (
    <div role="status" className="flex flex-col gap-3">
      {!done ? (
        <>
          <div className="flex items-center gap-3">
            <Spinner />
            <h1 className="t-section">Confirming…</h1>
          </div>
          <p className="t-body">Your bank is confirming the payment. This usually takes a few seconds.</p>
        </>
      ) : (
        <>
          <h1 className="t-section">Still confirming</h1>
          <p className="t-body">The payment is taking longer than usual. You&apos;ll get a receipt by email as soon as it&apos;s confirmed, and you can refresh this page any time.</p>
        </>
      )}
    </div>
  );
}
