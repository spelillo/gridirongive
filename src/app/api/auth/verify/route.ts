import { NextResponse } from 'next/server';
import { safeNext, verifyEmailCode } from '@/lib/auth/session';
import { authKeys, countRecent, record } from '@/lib/auth/limits';

/** Signs in with the 6-digit code from the email. Five wrong codes lock the address for 10 minutes. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? '');
  const keys = await authKeys('verify', email);
  if ((await countRecent(keys.slice(1), 10, true)) >= 5) {
    return NextResponse.json({ ok: false, error: 'Too many wrong codes. Wait 10 minutes or use the link in the email.' }, { status: 429 });
  }
  const result = await verifyEmailCode(email, String(body.code ?? ''));
  if (!result.ok) {
    await record(keys, false);
    return NextResponse.json(result, { status: 400 });
  }
  const next = body.next ? safeNext(String(body.next), result.next) : result.next;
  return NextResponse.json({ ok: true, next });
}
