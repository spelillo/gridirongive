import { sys } from '@/lib/db';
import { getObject, type Bucket } from '@/lib/storage';
import { canViewAthlete, memberAccess } from '@/lib/access';
import { getUser } from '@/lib/auth/session';
import { safeEqual } from '@/lib/crypto';
import { thanksSig } from '@/lib/thanks';
import { deliverySig } from '@/lib/media-links';

/**
 * Serves stored files after checking who is asking. Nothing in storage is
 * public: athlete photos need the code, the athlete's link, or a role on the
 * team; receipts and verification documents need a staff role.
 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const draft = new URL(req.url).searchParams.get('draft') === '1';
  let bucket: Bucket = 'photos';
  let key: string | null = null;

  if (kind === 'team') {
    const t = await sys.one<any>(`select id, status, photo_path from teams where id = $1`, [id]);
    if (!t?.photo_path) return notFound();
    if (t.status !== 'live' && t.status !== 'season_closed' && !(await memberAccess(t.id)).staff) return notFound();
    bucket = 'team';
    key = t.photo_path;
  } else if (kind === 'athlete') {
    const a = await sys.one<any>(
      `select a.id, a.team_id, a.share_token, a.status, a.photo_path, a.pub_photo_path, t.code_version
       from athletes a join teams t on t.id = a.team_id where a.id = $1`,
      [id],
    );
    if (!a) return notFound();
    const m = await memberAccess(a.team_id);
    const family = draft ? await isFamily(a.id) : false;
    if (draft) {
      if (!m.staff && !family) return notFound();
      key = a.photo_path;
    } else {
      if (a.status !== 'live' && !m.staff && !(await isFamily(a.id))) return notFound();
      if (!(await canViewAthlete({ id: a.team_id, code_version: a.code_version }, a))) return notFound();
      key = a.pub_photo_path;
    }
  } else if (kind === 'receipt') {
    const p = await sys.one<any>(`select team_id, receipt_path from purchases where id = $1`, [id]);
    if (!p || !(await memberAccess(p.team_id)).staff) return notFound();
    bucket = 'receipts';
    key = p.receipt_path;
  } else if (kind === 'verification') {
    const t = await sys.one<any>(`select id, verification_doc_path from teams where id = $1`, [id]);
    if (!t || !(await memberAccess(t.id)).staff) return notFound();
    bucket = 'verification';
    key = t.verification_doc_path;
  } else if (kind === 'thanks') {
    const ty = await sys.one<any>(`select team_id, athlete_id, photo_path from thank_yous where id = $1`, [id]);
    const sig = new URL(req.url).searchParams.get('sig');
    const signed = Boolean(sig && safeEqual(sig, thanksSig(id)));
    if (!ty || !(signed || (await memberAccess(ty.team_id)).staff || (await isFamily(ty.athlete_id)))) return notFound();
    key = ty.photo_path;
  } else if (kind === 'delivery') {
    const n = await sys.one<any>(`select team_id, athlete_id, delivery_photo_path from needs where id = $1`, [id]);
    // Donors open it from their email or giving history through a signed link.
    const sig = new URL(req.url).searchParams.get('sig');
    const signed = Boolean(sig && safeEqual(sig, deliverySig(id)));
    if (!n || !(signed || (await memberAccess(n.team_id)).staff || (n.athlete_id && (await isFamily(n.athlete_id))))) return notFound();
    key = n.delivery_photo_path;
  } else {
    return notFound();
  }

  if (!key) return notFound();
  const obj = await getObject(bucket, key);
  if (!obj) return notFound();
  return new Response(new Uint8Array(obj.bytes), {
    headers: {
      'Content-Type': obj.contentType,
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

async function isFamily(athleteId: string) {
  const user = await getUser();
  if (!user) return false;
  const row = await sys.one(`select 1 from athlete_access where athlete_id = $1 and user_id = $2`, [athleteId, user.id]);
  return Boolean(row);
}

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
