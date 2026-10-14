'use client';
import { useId, useImperativeHandle, useState, type Ref } from 'react';
import { CreditCard } from 'lucide-react';

export interface PayHandle {
  /** Checks the payment fields before the gift is created. */
  validate(): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Takes the payment for a created gift. */
  confirm(p: { donationId: string; clientSecret: string | null; totalCents: number }): Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * Card form used when Stripe keys aren't configured (demo mode). Nothing is
 * charged. Test numbers behave like Stripe's: 4242... succeeds,
 * 4000 0000 0000 0002 is declined, 4000 0000 0000 9995 has insufficient funds.
 */
export function SimulatedPay({ ref }: { ref: Ref<PayHandle | null> }) {
  const id = useId();
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [exp, setExp] = useState('12 / 30');
  const [cvc, setCvc] = useState('123');

  useImperativeHandle(ref, () => ({
    async validate() {
      const digits = card.replace(/\D/g, '');
      if (digits.length < 15) return { ok: false, error: "The card number isn't complete." };
      if (!/^\d{2}\s*\/\s*\d{2}$/.test(exp)) return { ok: false, error: 'Enter the expiration date as MM / YY.' };
      if (!/^\d{3,4}$/.test(cvc)) return { ok: false, error: 'Enter the 3 or 4 digit security code.' };
      return { ok: true };
    },
    async confirm({ donationId }) {
      const res = await fetch('/api/give/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donationId, cardNumber: card.replace(/\D/g, '') }),
      });
      const data = await res.json();
      return data.ok ? { ok: true } : { ok: false, error: data.error };
    },
  }));

  const input = 'h-11 w-full rounded-md border border-hairline px-3 text-[16px] tabular text-ink';
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4">
      <legend className="flex items-center gap-2 px-1 t-label">
        <CreditCard size={18} aria-hidden /> Card
      </legend>
      <p className="t-caption -mt-1">Demo mode: nothing is charged. 4000 0000 0000 0002 shows a declined card.</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-n`} className="t-label">
          Card number
        </label>
        <input id={`${id}-n`} className={input} inputMode="numeric" autoComplete="cc-number" value={card} onChange={(e) => setCard(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-e`} className="t-label">
            Expires
          </label>
          <input id={`${id}-e`} className={input} inputMode="numeric" autoComplete="cc-exp" value={exp} onChange={(e) => setExp(e.target.value.slice(0, 7))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-c`} className="t-label">
            Security code
          </label>
          <input id={`${id}-c`} className={input} inputMode="numeric" autoComplete="cc-csc" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </div>
      </div>
    </fieldset>
  );
}
