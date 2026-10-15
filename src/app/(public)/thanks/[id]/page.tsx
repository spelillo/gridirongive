import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sys } from '@/lib/db';
import { safeEqual } from '@/lib/crypto';
import { thanksSig } from '@/lib/thanks';
import { athleteDisplayName } from '@/lib/domain/names';
import { formatDate } from '@/lib/domain/text';

export const metadata: Metadata = { title: 'A thank-you note', robots: { index: false, follow: false } };

/** A thank-you note with its photo, opened from the email (signed link). */
export default async function ThanksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sig?: string }> }) {
  const { id } = await params;
  const { sig } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id) || !sig || !safeEqual(sig, thanksSig(id))) notFound();
  const t = await sys.one<any>(
    `select ty.body, ty.photo_path, ty.sent_at, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, tm.name as team_name
     from thank_yous ty join athletes a on a.id = ty.athlete_id join teams tm on tm.id = ty.team_id where ty.id = $1 and ty.status = 'sent'`,
    [id],
  );
  if (!t) notFound();
  const name = athleteDisplayName(t);
  return (
    <div className="page-x mx-auto flex w-full max-w-[560px] flex-col gap-5 py-10">
      <p className="t-caption">{t.team_name}</p>
      <h1 className="t-section">A thank-you from {name}</h1>
      {t.photo_path && <img src={`/media/thanks/${id}?sig=${sig}`} alt={`Photo from ${name}`} className="w-full rounded-lg bg-band" />}
      <blockquote className="whitespace-pre-line border-l-[3px] border-primary pl-4 text-[18px] leading-7 text-ink-body">{t.body}</blockquote>
      {t.sent_at && <p className="t-caption">Sent {formatDate(t.sent_at)}</p>}
    </div>
  );
}
