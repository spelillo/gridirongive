import QRCode from 'qrcode';
import { Printer, Download } from 'lucide-react';
import { loadAthleteCtx } from '@/lib/app/athlete';
import { sys } from '@/lib/db';
import { env } from '@/lib/env';
import { Banner } from '@/components/ui/Banner';
import { ButtonLink, buttonClass } from '@/components/ui/Button';
import { CopyButton, ShareButton } from '@/components/ui/CopyButton';
import { possessive } from '@/lib/domain/names';
import { money } from '@/lib/domain/money';
import { Messages } from '@/components/app/Messages';

export const metadata = { title: 'Share' };

/** Player share page (ui-ux-spec 7.7). */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAthleteCtx(id);
  const a = ctx.athlete;
  const self = ctx.role === 'athlete';
  const url = `${env.appUrl}/s/${a.shareToken}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: '#000000', light: '#ffffff' } });
  const stats = await sys.one<{ visits: number; gifts: number; cents: number }>(
    `select coalesce((select visits from share_links where token = $1), 0)::int as visits,
       count(d.id)::int as gifts, coalesce(sum(d.gift_cents), 0)::int as cents
     from donations d where d.source_token = $1 and d.status = 'succeeded'`,
    [a.shareToken],
  );
  const name = self ? 'my' : possessive(a.first);
  const live = a.status === 'live';
  const messages = [
    { id: 'text', label: 'Text message', text: `Hi! I'm raising money for my ${ctx.team.sport} gear this season with ${ctx.team.name}. Every bit helps, and you can pick exactly what you're paying for: ${url}` },
    { id: 'insta', label: 'Instagram caption', text: `New season, new gear. I'm raising money for equipment with ${ctx.team.name}. Link in bio, or ask me for it.` },
    {
      id: 'email',
      label: 'Family email',
      text: `Hi everyone,\n\n${self ? "I'm" : `${a.first} is`} playing ${ctx.team.sport} for ${ctx.team.name} this season and ${self ? 'need' : 'needs'} some gear. You can see the list and give toward a specific item here:\n\n${url}\n\nThe coach buys the gear and you'll get an email when it's purchased. Thank you!`,
    },
  ];

  return (
    <div className="flex max-w-[760px] flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="t-hero">Share</h1>
        <p className="t-body">This link opens only {self ? 'your' : possessive(a.first)} page. It doesn&apos;t unlock the rest of the team.</p>
      </header>
      {!live && <Banner tone="info">The link starts working when {name} page is live.</Banner>}

      <section aria-labelledby="link-h" className="flex flex-col gap-3">
        <h2 id="link-h" className="t-subhead">
          Personal link
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-h-11 flex-1 truncate rounded-md bg-chrome px-3 py-2.5 text-[15px] text-ink">{url}</code>
          <div className="flex gap-2">
            <CopyButton value={url} label="Copy" surface="player_share" />
            <ShareButton url={url} title={`${possessive(a.first)} gear`} text={`Help ${a.first} get the gear they need.`} surface="player_share" />
          </div>
        </div>
        <p className="t-caption tabular">
          {stats?.visits ?? 0} visits · {stats?.gifts ?? 0} gifts through this link{stats?.cents ? ` (${money(stats.cents)})` : ''}
        </p>
      </section>

      <section aria-labelledby="qr-h" className="flex flex-col gap-3">
        <h2 id="qr-h" className="t-subhead">
          QR code
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <img src={qr} alt={`QR code for ${name} page`} width={200} height={200} className="rounded-md border border-hairline-soft" />
          <div className="flex flex-col gap-3">
            <a href={qr} download={`${a.first.toLowerCase()}-gridiron-give-qr.png`} className={buttonClass('secondary')}>
              <Download size={18} aria-hidden /> Download PNG
            </a>
            <ButtonLink href={`/app/athlete/${id}/share/flyer`} variant="secondary" target="_blank">
              <Printer size={18} aria-hidden /> Print a flyer
            </ButtonLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="msg-h" className="flex flex-col gap-3">
        <h2 id="msg-h" className="t-subhead">
          Messages to send
        </h2>
        <p className="t-caption">Edit them first if you like. Copy puts your version on the clipboard.</p>
        <Messages items={messages} surface="player_messages" />
      </section>
    </div>
  );
}
