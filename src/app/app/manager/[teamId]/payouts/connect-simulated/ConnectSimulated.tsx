'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { connectSimulated } from '@/lib/app/team-settings-actions';

export function ConnectSimulated({ teamId, from, back, connected }: { teamId: string; from: string; back: string; connected: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3">
      {error && <Banner tone="error">{error}</Banner>}
      {connected ? (
        <Banner tone="success">A demo account is already connected.</Banner>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        {!connected && (
          <Button
            loading={pending}
            loadingLabel="Connecting"
            onClick={() =>
              start(async () => {
                const r = await connectSimulated(teamId, from);
                if (!r.ok) setError(r.error);
                else router.push(r.redirect ?? back);
              })
            }
          >
            Connect demo account
          </Button>
        )}
        <ButtonLink href={back} variant="secondary">
          {connected ? 'Back' : 'Cancel'}
        </ButtonLink>
      </div>
    </div>
  );
}
