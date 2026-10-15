import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth/session';
import { asUser, dbErrorMessage } from '@/lib/db';
import { putObject, sniffType, UPLOAD_LIMITS, type Bucket } from '@/lib/storage';
import { randomToken } from '@/lib/crypto';

/**
 * Team file uploads for coach and staff: purchase receipts, delivery photos,
 * the team photo and verification documents. Files are checked by their
 * bytes, not their names. Receipts, delivery photos and documents return a
 * storage key that the matching action saves; the team photo is saved here.
 */
const KINDS: Record<string, { bucket: Bucket; label: string }> = {
  receipt: { bucket: 'receipts', label: 'Use a JPG, PNG, WebP or PDF receipt.' },
  delivery: { bucket: 'photos', label: 'Use a JPG, PNG or WebP photo.' },
  team: { bucket: 'team', label: 'Use a JPG, PNG or WebP photo.' },
  verification: { bucket: 'verification', label: 'Use a JPG, PNG, WebP or PDF file.' },
};

export async function POST(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in again.' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(teamId)) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const kind = String(form?.get('kind') ?? '');
  const spec = KINDS[kind];
  const file = form?.get('file');
  if (!spec) return NextResponse.json({ ok: false, error: 'Unknown upload.' }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ ok: false, error: 'Choose a file.' }, { status: 400 });
  const limit = UPLOAD_LIMITS[spec.bucket];
  if (file.size > limit.maxBytes) return NextResponse.json({ ok: false, error: 'That file is over 4 MB. Try a smaller one.' }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || !limit.types.includes(type)) return NextResponse.json({ ok: false, error: spec.label }, { status: 415 });

  try {
    const allowed = await asUser(user.id, (tx) => tx.one<{ edit: boolean }>(`select can_edit_team($1) as edit`, [teamId]));
    if (!allowed?.edit) return NextResponse.json({ ok: false, error: "You don't have access to do that." }, { status: 403 });
    const ext = type === 'application/pdf' ? 'pdf' : type.split('/')[1];
    const key = `${teamId}/${kind}/${randomToken(16)}.${ext}`;
    await putObject(spec.bucket, key, bytes, type);
    if (kind === 'team') {
      await asUser(user.id, (tx) => tx.query(`update teams set photo_path = $2 where id = $1`, [teamId, key]));
      revalidatePath(`/app/manager/${teamId}`, 'layout');
    }
    return NextResponse.json({ ok: true, key, type });
  } catch (err) {
    console.error('team upload failed', err);
    return NextResponse.json({ ok: false, error: dbErrorMessage(err) }, { status: 500 });
  }
}
