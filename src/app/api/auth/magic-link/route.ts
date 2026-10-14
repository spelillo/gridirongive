import { NextResponse } from 'next/server';
import { sendMagicLink } from '@/lib/auth/session';
import { authKeys, countRecent, record } from '@/lib/auth/limits';

/** Sends a sign-in email with a link and a 6-digit code. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const keys = await authKeys('magic', email);
  if ((await countRecent(keys, 10)) >= 10) {
    return NextResponse.json({ ok: false, error: 'Too many sign-in emails. Wait a few minutes and try again.' }, { status: 429 });
  }
  const result = await sendMagicLink(email, String(body.next ?? '/app'));
  if (result.ok) await record(keys, true);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
