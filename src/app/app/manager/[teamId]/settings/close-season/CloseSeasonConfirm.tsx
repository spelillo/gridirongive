'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Field, Input, describedBy } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { closeSeason } from '@/lib/app/team-settings-actions';

export function CloseSeasonConfirm({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const match = typed.trim().toLowerCase() === teamName.trim().toLowerCase();
  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-error p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await closeSeason(teamId, typed);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          toast(r.message ?? 'Season closed');
          router.push(r.redirect ?? `/app/manager/${teamId}/settings`);
        });
      }}
    >
      {error && <Banner tone="error" rounded>{error}</Banner>}
      <Field id="confirm-name" label={`Type ${teamName} to confirm`} required>
        <Input id="confirm-name" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} aria-describedby={describedBy('confirm-name', null, null)} />
      </Field>
      <div>
        <Button type="submit" variant="destructive" disabled={!match} loading={pending} loadingLabel="Closing">
          Close season and email donors
        </Button>
      </div>
    </form>
  );
}
