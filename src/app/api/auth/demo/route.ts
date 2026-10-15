import { NextResponse } from 'next/server';
import { demoSignInAs, safeNext } from '@/lib/auth/session';
import { DEMO } from '@/lib/db/demo-seed';
import { mode } from '@/lib/env';

/** Demo mode only: one-tap sign in as a seeded account. */
export async function POST(request: Request) {
  if (!mode.demo) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  const form = await request.formData();
  const email = String(form.get('email') ?? '');
  if (!DEMO.accounts.some((a) => a.email === email)) return NextResponse.json({ error: 'Unknown demo account' }, { status: 400 });
  await demoSignInAs(email);
  return NextResponse.redirect(new URL(safeNext(String(form.get('next') ?? ''), '/app'), request.url), 303);
}
