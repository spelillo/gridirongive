'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { changeTeamCode } from '@/lib/app/team-settings-actions';

/** "Change code" with a confirm, since every old team link and unlocked device stops working (ui-ux-spec 8.11). */
export function ChangeCode({ teamId, variant = 'secondary' }: { teamId: string; variant?: 'secondary' | 'destructive' }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <RefreshCw size={18} aria-hidden /> Change code
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        locked={pending}
        title="Change the team code?"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Keep the current code
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              loadingLabel="Changing"
              onClick={() =>
                start(async () => {
                  const r = await changeTeamCode(teamId);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setOpen(false);
                  toast(r.message ?? 'Code changed');
                  router.refresh();
                })
              }
            >
              Change code
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <Banner tone="error" rounded>{error}</Banner>}
          <p className="t-body">The old code and the old team link stop working right away. Anyone who unlocked the roster with them will need the new code.</p>
          <p className="t-body">Players&apos; personal links keep working. Reprint any posters with the old QR code.</p>
        </div>
      </Sheet>
    </>
  );
}
