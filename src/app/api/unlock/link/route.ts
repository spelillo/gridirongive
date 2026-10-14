import { NextResponse } from 'next/server';
import { attemptUnlock } from '@/lib/access';
import { normalizeCode, isCodeShape } from '@/lib/domain/codes';
import { ipKey } from '@/lib/request';
import { sys } from '@/lib/db';

/** Team links with the code built in: /t/slug?code=ABC123 lands here, unlocks, and redirects clean. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') ?? '';
  const code = normalizeCode(url.searchParams.get('code') ?? '');
  const team = await sys.one<{ id: string; slug: string }>(`select id, slug from teams where slug = $1`, [slug]);
  if (!team) return NextResponse.redirect(new URL('/search', url));
  if (isCodeShape(code)) await attemptUnlock(code, await ipKey('unlock'), team.id);
  return NextResponse.redirect(new URL(`/t/${team.slug}`, url));
}
