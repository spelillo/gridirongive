import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { asUser, dbErrorMessage } from '@/lib/db';
import { putObject, sniffType, UPLOAD_LIMITS } from '@/lib/storage';
import { randomToken } from '@/lib/crypto';
import { revalidatePath } from 'next/cache';

/**
 * Athlete photo upload. The browser crops to 3:4 and re-encodes (which drops
 * EXIF, including location) before sending. Saved to the working copy; the
 * public page changes on approval, or right away if the team has approval off.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in again.' }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('photo');
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, error: 'Choose a photo.' }, { status: 400 });
  const limit = UPLOAD_LIMITS.photos;
  if (file.size > limit.maxBytes) return NextResponse.json({ ok: false, error: 'That photo is too large. Try a smaller one.' }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || !limit.types.includes(type)) return NextResponse.json({ ok: false, error: 'Use a JPG, PNG or WebP photo.' }, { status: 415 });

  try {
    const result = await asUser(user.id, async (tx) => {
      const a = await tx.one<{ id: string; team_id: string; status: string; require_profile_approval: boolean; editor: boolean }>(
        `select a.id, a.team_id, a.status, t.require_profile_approval, can_edit_team(a.team_id) as editor
         from athletes a join teams t on t.id = a.team_id where a.id = $1 and a.archived_at is null`,
        [id],
      );
      if (!a) return null;
      const key = `${a.team_id}/${a.id}/${randomToken(12)}.${type.split('/')[1]}`;
      await putObject('photos', key, bytes, type);
      await tx.query(`update athletes set photo_path = $2 where id = $1`, [a.id, key]);
      // Staff uploads and teams without approval publish straight away.
      if (a.status === 'live' && (a.editor || !a.require_profile_approval)) {
        await tx.query(`update athletes set pub_photo_path = photo_path, published_at = now() where id = $1`, [a.id]);
      }
      return key;
    });
    if (!result) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    revalidatePath(`/app/athlete/${id}`, 'layout');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: dbErrorMessage(err) }, { status: 403 });
  }
}
