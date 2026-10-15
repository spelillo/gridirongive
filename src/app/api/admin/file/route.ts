import { sys } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { getObject } from '@/lib/storage';

/** Admin only: streams a team's verification document from the private 'verification' bucket. */
export async function GET(req: Request) {
  await requireAdmin();
  const teamId = new URL(req.url).searchParams.get('team') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(teamId)) return notFound();
  const t = await sys.one<{ verification_doc_path: string | null; slug: string }>(`select verification_doc_path, slug from teams where id = $1`, [teamId]);
  if (!t?.verification_doc_path) return notFound();
  const obj = await getObject('verification', t.verification_doc_path);
  if (!obj) return notFound();
  const ext = obj.contentType === 'application/pdf' ? 'pdf' : (obj.contentType.split('/')[1] ?? 'bin');
  return new Response(new Uint8Array(obj.bytes), {
    headers: {
      'Content-Type': obj.contentType,
      'Content-Disposition': `inline; filename="verification-${t.slug}.${ext}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      // Chrome's PDF viewer does not run under a sandbox policy; images keep it.
      ...(ext === 'pdf' ? {} : { 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
