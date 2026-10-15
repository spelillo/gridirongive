'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/app/account-actions';

export function MarkAllRead() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      loadingLabel="Marking"
      onClick={() =>
        start(async () => {
          const r = await markAllNotificationsRead();
          toast(r.ok ? 'All marked as read' : r.error);
          router.refresh();
        })
      }
    >
      <CheckCheck size={18} aria-hidden /> Mark all read
    </Button>
  );
}

export function MarkRead({ id, subject }: { id: string; subject: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="tertiary"
      className="min-w-11 shrink-0 justify-center"
      loading={pending}
      aria-label={`Mark read: ${subject}`}
      onClick={() =>
        start(async () => {
          const r = await markNotificationRead(id);
          if (!r.ok) toast(r.error);
          router.refresh();
        })
      }
    >
      <Check size={18} aria-hidden />
      <span className="hidden sm:inline">Mark read</span>
    </Button>
  );
}
