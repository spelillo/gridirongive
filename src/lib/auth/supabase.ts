import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/** Supabase client bound to the request's auth cookies (live mode only). */
export async function supabaseServer() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error('Supabase is not configured');
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session on the next request.
        }
      },
    },
  });
}

/** Service-role client for Storage and Realtime broadcast. Never sent to the browser. */
export function supabaseService() {
  if (!env.supabaseUrl || !env.supabaseServiceKey) throw new Error('Supabase service key is not configured');
  return createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
