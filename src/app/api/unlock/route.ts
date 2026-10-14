import { NextResponse } from 'next/server';
import { z } from 'zod';
import { attemptUnlock } from '@/lib/access';
import { parseCodeEntry } from '@/lib/domain/codes';
import { ipKey } from '@/lib/request';
import { sys } from '@/lib/db';

const Body = z.object({ input: z.string().max(300), teamId: z.uuid().optional() });

/** Team code entry. Rate limited per IP (5 failures in 10 minutes). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'wrong' }, { status: 400 });
  const entry = parseCodeEntry(parsed.data.input);
  if (entry.kind === 'share') return NextResponse.json({ ok: true, href: `/s/${entry.token}` });
  const key = await ipKey('unlock');
  if (entry.kind === 'invalid') {
    // Still counts toward the limit so the field can't be used to probe.
    const result = await attemptUnlock('------', key, parsed.data.teamId);
    if (!result.ok && result.reason === 'locked') return NextResponse.json(result);
    return NextResponse.json({ ok: false, reason: 'wrong', message: "That code doesn't match. Codes are 6 letters and numbers." });
  }
  let expect = parsed.data.teamId;
  if (entry.kind === 'team-link') {
    const t = await sys.one<{ id: string }>(`select id from teams where slug = $1`, [entry.teamSlug]);
    expect = t?.id ?? expect;
  }
  const result = await attemptUnlock(entry.code, key, expect);
  if (result.ok) return NextResponse.json({ ok: true, href: `/t/${result.slug}` });
  return NextResponse.json(result);
}
