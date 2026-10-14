import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearTeamUnlock } from '@/lib/access';

export async function POST(req: Request) {
  const parsed = z.object({ teamId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (parsed.success) await clearTeamUnlock(parsed.data.teamId);
  return NextResponse.json({ ok: true });
}
