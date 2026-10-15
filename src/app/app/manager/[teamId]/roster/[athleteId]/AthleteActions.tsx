'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { inviteAthletes, removeAthletes, setAthletesHidden } from '@/lib/app/team-actions';
import { money } from '@/lib/domain/money';

/** Header actions on the athlete detail page (ui-ux-spec 8.5). */
export function AthleteActions({
  teamId,
  athleteId,
  canEdit,
  previewHref,
  status,
  hiddenReason,
  inviteStatus,
  heldCents,
  name,
}: {
  teamId: string;
  athleteId: string;
  canEdit: boolean;
  previewHref: string;
  status: string;
  hiddenReason: string | null;
  inviteStatus: string;
  heldCents: number;
  name: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (r.message ?? 'Done') : (r.error ?? 'Something went wrong.'));
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  const previewable = ['live', 'hidden', 'awaiting_coach', 'changes_requested', 'draft'].includes(status);

  return (
    <>
      {previewable && (
        <ButtonLink href={previewHref} variant="secondary" target="_blank">
          Preview page <ExternalLink size={16} aria-hidden />
        </ButtonLink>
      )}
      {canEdit && inviteStatus !== 'accepted' && (
        <Button variant="secondary" loading={pending} onClick={() => run(() => inviteAthletes(teamId, [athleteId]))}>
          {inviteStatus === 'not_sent' ? 'Send invite' : 'Resend invite'}
        </Button>
      )}
      {canEdit && status !== 'hidden' && status !== 'needs_consent' && (
        <Button variant="secondary" disabled={pending} onClick={() => run(() => setAthletesHidden(teamId, [athleteId], true))}>
          Hide page
        </Button>
      )}
      {canEdit && status === 'hidden' && hiddenReason === 'manager' && (
        <Button variant="secondary" disabled={pending} onClick={() => run(() => setAthletesHidden(teamId, [athleteId], false))}>
          Show page
        </Button>
      )}
      {canEdit && (
        <Button variant="tertiary" onClick={() => setConfirm(true)}>
          Remove from team
        </Button>
      )}
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Remove ${name} from the team?`}
        footer={
          <div className="flex flex-wrap gap-3">
            {heldCents === 0 && (
              <Button variant="destructive" loading={pending} onClick={() => run(() => removeAthletes(teamId, [athleteId]), () => router.push(`/app/manager/${teamId}/roster`))}>
                Remove
              </Button>
            )}
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {heldCents === 0 ? 'Cancel' : 'Close'}
            </Button>
          </div>
        }
      >
        {heldCents > 0 ? (
          <p className="t-body">
            Supporters gave {money(heldCents)} toward gear for {name} that hasn&apos;t been delivered. Deliver that gear, or move the funds from the Purchases page, before removing them. You can hide the page in the meantime.
          </p>
        ) : (
          <p className="t-body">Their page comes down, open invites stop working, and items with no gifts are removed. Past donations stay in your records.</p>
        )}
      </Sheet>
    </>
  );
}
