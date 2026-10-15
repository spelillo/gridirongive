import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { loadTeamCtx } from '@/lib/app/team';
import { teamShare } from '@/lib/app/team-share';
import { PrintNow } from '@/components/app/PrintNow';

export const metadata = { title: 'Poster' };

/** Letter-size poster (ui-ux-spec 8.11): team name, QR, short URL and one line. Plain layout. */
export default async function PosterPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  if (!ctx.canEdit) notFound();
  const share = await teamShare(ctx.user.id, teamId);
  if (!share.url) notFound();
  const qr = await QRCode.toDataURL(share.url, { margin: 0, width: 900, errorCorrectionLevel: 'M' });
  return (
    <div className="flex flex-col gap-4">
      <style>{`@media print { @page { size: letter; margin: 0.5in; } }`}</style>
      <PrintNow label="Print poster" />
      <article className="mx-auto flex aspect-[8.5/11] w-full max-w-[8.5in] flex-col items-center justify-between gap-6 border border-hairline-soft p-[6%] text-center print:aspect-auto print:h-[10in] print:max-w-none print:border-0 print:p-0">
        <div className="flex flex-col items-center gap-3">
          <p className="text-[clamp(14px,2.4vw,20px)] uppercase tracking-[0.12em] text-ink-meta">{ctx.team.orgName}</p>
          <h1 className="text-[clamp(28px,6vw,56px)] font-medium leading-tight text-ink">{ctx.team.name}</h1>
        </div>
        {ctx.team.photoPath && <img src={`/media/team/${teamId}`} alt="" className="aspect-[16/9] w-3/4 rounded-md object-cover" />}
        <div className="flex flex-col items-center gap-4">
          <p className="text-[clamp(22px,4.5vw,40px)] font-medium text-ink">Scan to support our players</p>
          <img src={qr} alt="QR code for the team page" className={ctx.team.photoPath ? 'w-[40%]' : 'w-[55%]'} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-[clamp(14px,2.4vw,20px)] text-ink-meta">Or go to</p>
          <p className="break-all text-[clamp(16px,3vw,26px)] font-medium text-ink">{share.url.replace(/^https?:\/\//, '')}</p>
          <p className="text-[clamp(12px,2vw,16px)] text-ink-meta">Every gift buys a specific piece of gear for a specific player.</p>
        </div>
      </article>
    </div>
  );
}
