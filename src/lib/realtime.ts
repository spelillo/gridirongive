import 'server-only';
import { env, mode } from '@/lib/env';

/**
 * Tells open pages that a team's totals changed. Live mode sends a Supabase
 * Realtime broadcast on "team:<id>"; the browser listens and refreshes. The
 * message carries no data, so it reveals nothing to people without the code.
 * Demo mode has no broadcast; pages poll instead (see LiveRefresh).
 */
export async function broadcastTeam(teamId: string): Promise<void> {
  if (!mode.realtime) return;
  try {
    await fetch(`${env.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: env.supabaseServiceKey!, Authorization: `Bearer ${env.supabaseServiceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `team:${teamId}`, event: 'totals', payload: { at: Date.now() } }] }),
    });
  } catch (err) {
    console.error('realtime broadcast failed', err);
  }
}
