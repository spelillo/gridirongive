import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth/session';
import { asUser, sys, dbErrorMessage } from '@/lib/db';
import { putObject, sniffType, UPLOAD_LIMITS } from '@/lib/storage';
import { randomToken } from '@/lib/crypto';
import { cleanUserText, needsHumanReview } from '@/lib/domain/text';
import { sendThankYou } from '@/lib/thanks';
import { notifyTeamStaff, flushSoon } from '@/lib/notify';
import { env } from '@/lib/env';

/** "Say thanks" composer (ui-ux-spec 7.6): text, an optional photo, and who it goes to. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in again.' }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  const body = cleanUserText(String(form.get('body') ?? ''), 500);
  const donationId = String(form.get('donationId') ?? '') || null;
  const needId = String(form.get('needId') ?? '') || null;
  if (body.length < 2) return NextResponse.json({ ok: false, error: 'Write a short note.' }, { status: 400 });
  if (!donationId && !needId) return NextResponse.json({ ok: false, error: 'Pick who the note is for.' }, { status: 400 });

  let photoBytes: Uint8Array | null = null;
  let photoType: string | null = null;
  const photo = form.get('photo');
  if (photo instanceof Blob && photo.size > 0) {
    if (photo.size > UPLOAD_LIMITS.photos.maxBytes) return NextResponse.json({ ok: false, error: 'That photo is too large.' }, { status: 413 });
    photoBytes = new Uint8Array(await photo.arrayBuffer());
    photoType = sniffType(photoBytes);
    if (!photoType || !UPLOAD_LIMITS.photos.types.includes(photoType)) return NextResponse.json({ ok: false, error: 'Use a JPG, PNG or WebP photo.' }, { status: 415 });
  }

  // The note must point at a gift this athlete actually received. (Checked
  // before the user transaction: athletes can't read donation rows directly.)
  const target = donationId
    ? await sys.one(`select 1 from donations d join allocations al on al.donation_id = d.id join needs n on n.id = al.need_id where d.id = $1 and n.athlete_id = $2 limit 1`, [donationId, id])
    : await sys.one(`select 1 from needs where id = $1 and athlete_id = $2`, [needId, id]);
  if (!target) return NextResponse.json({ ok: false, error: 'Pick a supporter from the list.' }, { status: 400 });

  try {
    const result = await asUser(user.id, async (tx) => {
      const a = await tx.one<{ team_id: string; role: string | null; require: boolean }>(
        `select a.team_id, athlete_role(a.id) as role, t.require_thankyou_approval as require from athletes a join teams t on t.id = a.team_id where a.id = $1`,
        [id],
      );
      if (!a?.role) return null;
      let path: string | null = null;
      if (photoBytes && photoType) {
        path = `${a.team_id}/${id}/thanks-${randomToken(10)}.${photoType.split('/')[1]}`;
        await putObject('photos', path, photoBytes, photoType);
      }
      const autoSend = !a.require && !needsHumanReview(body);
      const row = await tx.one<{ id: string }>(
        `insert into thank_yous (team_id, athlete_id, need_id, donation_id, body, photo_path, status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [a.team_id, id, needId, donationId, body, path, autoSend ? 'approved' : 'pending', user.id],
      );
      return { id: row!.id, autoSend, teamId: a.team_id };
    });
    if (!result) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    if (result.autoSend) {
      await sendThankYou(result.id);
    } else {
      await notifyTeamStaff(sys, result.teamId, {
        kind: 'approval',
        subject: 'A thank-you note is waiting for approval',
        body: 'A player wrote a thank-you note to supporters. Review it in Approvals.',
        link: `${env.appUrl}/app/manager/${result.teamId}/approvals?tab=thanks`,
      });
      flushSoon();
    }
    revalidatePath(`/app/athlete/${id}`, 'layout');
    return NextResponse.json({ ok: true, sent: result.autoSend });
  } catch (err) {
    return NextResponse.json({ ok: false, error: dbErrorMessage(err) }, { status: 403 });
  }
}
