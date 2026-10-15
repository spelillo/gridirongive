import Link from 'next/link';
import { mode } from '@/lib/env';

/** A thin line on every page in demo mode so nobody mistakes it for the real thing. */
export function DemoBanner() {
  if (!mode.demo && mode.payments === 'stripe') return null;
  const text = mode.demo ? 'Demo mode: sample data, no real payments, emails go to the on-site outbox.' : 'Test mode: payments are simulated.';
  return (
    <div className="no-print bg-navy px-4 py-1.5 text-center text-[13px] leading-5 text-white">
      {text}{' '}
      {mode.demo && (
        <Link href="/demo" className="font-medium text-white underline hover:text-white">
          Demo guide
        </Link>
      )}
    </div>
  );
}
