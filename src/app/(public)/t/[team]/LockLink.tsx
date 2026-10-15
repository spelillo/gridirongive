'use client';
import { useRouter } from 'next/navigation';

export function LockLink({ teamId }: { teamId: string }) {
  const router = useRouter();
  return (
    <p className="t-caption">
      Unlocked on this device ·{' '}
      <button
        type="button"
        className="min-h-9 text-primary hover:underline"
        onClick={async () => {
          await fetch('/api/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId }) });
          router.refresh();
        }}
      >
        Lock
      </button>
    </p>
  );
}
