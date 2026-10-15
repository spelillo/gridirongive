'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function ResendRequest({ token, coach }: { token: string; coach: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  if (state === 'done') return <p role="status" className="t-body">We let {coach} know. Watch your email for a new invite.</p>;
  return (
    <div>
      <Button
        loading={state === 'busy'}
        onClick={async () => {
          setState('busy');
          await fetch('/api/invite/resend-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
          setState('done');
        }}
      >
        Ask {coach} to resend
      </Button>
    </div>
  );
}
