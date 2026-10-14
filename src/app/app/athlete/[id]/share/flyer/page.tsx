import QRCode from 'qrcode';
import { loadAthleteCtx } from '@/lib/app/athlete';
import { env } from '@/lib/env';
import { gradeLabel, possessive } from '@/lib/domain/names';
import { PrintNow } from '@/components/app/PrintNow';

export const metadata = { title: 'Flyer' };

/** Half-page printable flyer: name, number, photo, QR and the short URL. Text only. */
export default async function FlyerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAthleteCtx(id);
  const a = ctx.athlete;
  const url = `${env.appUrl}/s/${a.shareToken}`;
  const qr = await QRCode.toDataURL(url, { margin: 0, width: 480 });
  const photo = a.pubPhotoPath ?? a.photoPath;
  return (
    <div className="flex flex-col gap-4">
      <PrintNow />
      <article className="mx-auto flex w-full max-w-[7.5in] flex-col gap-5 border border-hairline-soft p-8 print:border-0 print:p-0" style={{ minHeight: '5in' }}>
        <div className="flex items-start gap-6">
          {photo && <img src={`/media/athlete/${a.id}?draft=1`} alt="" className="aspect-[3/4] w-40 rounded-md object-cover" />}
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-[16px] text-ink-meta">{ctx.team.name}</p>
            <h1 className="text-[36px] font-medium leading-tight text-ink">{a.displayName}</h1>
            <p className="text-[18px] text-ink-body">{[a.jersey ? `#${a.jersey}` : null, a.position, gradeLabel(a.grade)].filter(Boolean).join(' · ')}</p>
            <p className="mt-4 text-[20px] leading-7 text-ink">Help {a.first} get the gear {a.first} needs this season. Pick an item and give toward it.</p>
          </div>
        </div>
        <div className="flex items-center gap-6 border-t border-hairline-soft pt-5">
          <img src={qr} alt={`QR code for ${possessive(a.first)} page`} className="size-36" />
          <div className="flex flex-col gap-1">
            <p className="text-[16px] text-ink-meta">Scan, or go to</p>
            <p className="break-all text-[20px] font-medium text-ink">{url.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>
      </article>
    </div>
  );
}
