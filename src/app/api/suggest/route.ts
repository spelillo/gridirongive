import { NextResponse } from 'next/server';
import { suggest } from '@/lib/queries/public';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const items = await suggest(q.slice(0, 80));
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, max-age=30' } });
}
