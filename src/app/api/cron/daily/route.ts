import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env, mode } from '@/lib/env';
import { runDaily } from '@/lib/jobs/daily';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = env.cronSecret;
  // Without a secret the job only runs in demo mode, so a live deploy is never open.
  if (!secret) return mode.demo;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Daily job, called by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runDaily();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
