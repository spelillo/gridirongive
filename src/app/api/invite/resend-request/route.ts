import { NextResponse } from 'next/server';
import { requestResend } from '@/lib/invites';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ok = await requestResend(String(body.token ?? ''));
  return NextResponse.json({ ok });
}
