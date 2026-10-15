'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps totals current while a page is open (ui-ux-spec 5.3, 10.5). With
 * Supabase configured it listens for the "team:<id>" broadcast the payment
 * processor sends and refreshes right away, with a slow poll as a safety net.
 * Without it (demo mode) it polls.
 */
export function LiveRefresh({ teamId, supabaseUrl, supabaseAnonKey, pollMs = 8000 }: { teamId: string; supabaseUrl?: string; supabaseAnonKey?: string; pollMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    let cleanup: (() => void) | undefined;
    const refresh = () => {
      if (!stopped && document.visibilityState === 'visible') router.refresh();
    };
    const interval = setInterval(refresh, supabaseUrl ? Math.max(pollMs, 30000) : pollMs);
    if (supabaseUrl && supabaseAnonKey) {
      import('@supabase/supabase-js').then(({ createClient }) => {
        if (stopped) return;
        const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
        const channel = client.channel(`team:${teamId}`).on('broadcast', { event: 'totals' }, refresh).subscribe();
        cleanup = () => {
          void client.removeChannel(channel);
        };
      });
    }
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      cleanup?.();
    };
  }, [teamId, supabaseUrl, supabaseAnonKey, pollMs, router]);
  return null;
}
