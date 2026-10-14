import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { consumeDemoToken, ensureProfile, safeNext } from '@/lib/auth/session';
import { mode } from '@/lib/env';

/**
 * Where sign-in links land. Demo links carry demo_token; Supabase links carry
 * either a PKCE `code` or a `token_hash` (when the email template is set up
 * as described in docs/SETUP.md).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = () => NextResponse.redirect(new URL('/sign-in?error=link', url));
  if (mode.demo) {
    const token = url.searchParams.get('demo_token');
    const next = token ? await consumeDemoToken(token) : null;
    return next ? NextResponse.redirect(new URL(safeNext(next), url)) : fail();
  }
  const next = safeNext(url.searchParams.get('next'));
  const { supabaseServer } = await import('@/lib/auth/supabase');
  const supabase = await supabaseServer();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = (url.searchParams.get('type') ?? 'email') as EmailOtpType;
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: null, error: new Error('missing') };
  if (error || !data?.user?.email) return fail();
  await ensureProfile(data.user.id, data.user.email);
  return NextResponse.redirect(new URL(next, url));
}
