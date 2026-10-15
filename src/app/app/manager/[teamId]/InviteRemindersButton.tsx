'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { remindPendingInvites } from '@/lib/app/team-actions';

/** Overview action: one click resends every invite that hasn't been accepted. */
export function InviteRemindersButton({ teamId }: { teamId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <span role="status" aria-live="polite" className="t-caption">
        {msg}
      </span>
      {!msg && (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await remindPendingInvites(teamId);
              setMsg(r.ok ? (r.message ?? 'Sent') : r.error);
              router.refresh();
            })
          }
        >
          Send reminders
        </Button>
      )}
    </span>
  );
}
