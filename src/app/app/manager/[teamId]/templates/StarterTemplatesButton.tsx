'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { copyStarterTemplates } from '@/lib/app/team-actions';

export function StarterTemplatesButton({ teamId }: { teamId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await copyStarterTemplates(teamId);
          toast(r.ok ? (r.message ?? 'Added') : r.error);
          router.refresh();
        })
      }
    >
      Add starter templates
    </Button>
  );
}
