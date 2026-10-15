import QRCode from 'qrcode';
import { Download, Printer } from 'lucide-react';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { teamShare } from '@/lib/app/team-share';
import { money } from '@/lib/domain/money';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { ButtonLink, buttonClass } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Messages } from '@/components/app/Messages';
import { ChangeCode } from './ChangeCode';

export const metadata = { title: 'Share kit' };

/** Share kit (ui-ux-spec 8.11). */
export default async function ShareKitPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  const base = `/app/manager/${teamId}/share`;
  const share = ctx.canEdit ? await teamShare(ctx.user.id, teamId) : null;
  const stats = await asUser(ctx.user.id, (tx) =>
    tx.one<any>(
      `with links as (
         select s.token, s.athlete_id, s.visits from share_links s where s.team_id = $1
         union all
         select a.share_token, a.id, 0 from athletes a where a.team_id = $1 and not exists (select 1 from share_links s where s.token = a.share_token)
       ), gifts as (
         select d.source_token, d.gift_cents from donations d where d.team_id = $1 and d.status = 'succeeded'
       )
       select
         coalesce((select sum(visits) from links where athlete_id is null), 0)::int as team_visits,
         coalesce((select sum(visits) from links where athlete_id is not null), 0)::int as athlete_visits,
         (select count(*) from gifts g join links l on l.token = g.source_token and l.athlete_id is null)::int as team_gifts,
         coalesce((select sum(g.gift_cents) from gifts g join links l on l.token = g.source_token and l.athlete_id is null), 0)::int as team_cents,
         (select count(*) from gifts g join links l on l.token = g.source_token and l.athlete_id is not null)::int as athlete_gifts,
         coalesce((select sum(g.gift_cents) from gifts g join links l on l.token = g.source_token and l.athlete_id is not null), 0)::int as athlete_cents,
         (select count(*) from gifts g where g.source_token is null or not exists (select 1 from links l where l.token = g.source_token))::int as other_gifts,
         coalesce((select sum(g.gift_cents) from gifts g where g.source_token is null or not exists (select 1 from links l where l.token = g.source_token)), 0)::int as other_cents`,
      [teamId],
    ),
  );
  const live = ctx.team.status === 'live' || ctx.team.status === 'season_closed';
  const qr = share?.url ? await QRCode.toDataURL(share.url, { margin: 1, width: 480 }) : null;
  const url = share?.url ?? '';
  const sport = ctx.team.sport;
  const messages = share?.url
    ? [
        {
          id: 'parents',
          label: 'For parents',
          text: `Hi families,\n\nWe're raising money for ${sport} gear this season on Gridiron Give. Each player has a list of the gear they need, and supporters can pick an item and give toward it. The coaches buy the gear and post the receipts.\n\nPlease share this link with relatives, neighbors and local businesses. It opens our team page:\n${url}\n\nTeam code: ${share.code}\n\nThank you,\n${ctx.user.fullName ?? 'Coach'}`,
        },
        {
          id: 'social',
          label: 'Social post',
          text: `${ctx.team.name} is raising money for player gear. Pick a helmet, cleats or pads for a specific player and follow it until it's handed out. ${url}`,
        },
        {
          id: 'newsletter',
          label: 'School newsletter',
          text: `${ctx.team.name}: gear drive\n\nOur players need safe, properly fitted equipment this season. On Gridiron Give, every gift goes to a specific item for a specific player, and the coaches log each purchase with its receipt. To give, visit ${url} or enter team code ${share.code} on the team's page.`,
        },
      ]
    : [];

  return (
    <div className="flex max-w-[880px] flex-col gap-8">
      <PageHeader title="Share kit" sub="The team code, the team link and printables for game day." />
      {!live && <Banner tone="info">Links and codes start working when the team is live.</Banner>}

      {!ctx.canEdit ? (
        <Banner tone="info">Ask a coach for the team code. Viewers can see the link stats below.</Banner>
      ) : (
        <>
          <Section title="Team code" id="code">
            <div className="flex flex-col gap-4 rounded-md border border-hairline-soft p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-[40px] font-medium leading-none tracking-[0.18em] text-ink tabular" aria-label={`Team code ${share?.code?.split('').join(' ')}`}>
                  {share?.code}
                </p>
                <p className="t-caption mt-2">Anyone with this code can see the roster. Change it if it gets posted publicly.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {share?.code && <CopyButton value={share.code} label="Copy code" surface="team_code" />}
                <ChangeCode teamId={teamId} />
              </div>
            </div>
          </Section>

          <Section title="Team link" id="link">
            <p className="t-caption">This link has the code built in. It opens the whole roster.</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="min-h-11 min-w-0 flex-1 truncate rounded-md bg-chrome px-3 py-2.5 text-[15px] text-ink">{url}</code>
              <CopyButton value={url} label="Copy link" surface="team_share" />
            </div>
            {qr && (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <img src={qr} alt="QR code for the team link" width={180} height={180} className="rounded-md border border-hairline-soft" />
                <div className="flex flex-col gap-2">
                  <a href={`/api/teams/${teamId}/qr?format=png`} download className={buttonClass('secondary')}>
                    <Download size={18} aria-hidden /> Download PNG
                  </a>
                  <a href={`/api/teams/${teamId}/qr?format=svg`} download className={buttonClass('secondary')}>
                    <Download size={18} aria-hidden /> Download SVG
                  </a>
                </div>
              </div>
            )}
          </Section>

          <Section title="Printables" id="print">
            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={`${base}/poster`} variant="secondary" target="_blank">
                <Printer size={18} aria-hidden /> Poster (letter size)
              </ButtonLink>
              <ButtonLink href={`${base}/roster-sheet`} variant="secondary" target="_blank">
                <Printer size={18} aria-hidden /> Roster QR sheet
              </ButtonLink>
            </div>
            <p className="t-caption">The roster sheet has each live player&apos;s personal link. A personal link opens only that player&apos;s page.</p>
          </Section>

          <Section title="Messages to send" id="messages">
            <p className="t-caption">Edit them first if you like. Copy puts your version on the clipboard.</p>
            <Messages items={messages} surface="team_messages" />
          </Section>
        </>
      )}

      <Section title="Link stats" id="stats">
        <div className="overflow-hidden rounded-md border border-hairline-soft">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Visits and gifts by link</caption>
            <thead>
              <tr className="bg-chrome">
                <th scope="col" className="t-label h-12 px-3 font-medium">Source</th>
                <th scope="col" className="t-label h-12 px-3 text-right font-medium">Visits</th>
                <th scope="col" className="t-label h-12 px-3 text-right font-medium">Gifts</th>
                <th scope="col" className="t-label h-12 px-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Team link', stats?.team_visits, stats?.team_gifts, stats?.team_cents],
                ['Player links', stats?.athlete_visits, stats?.athlete_gifts, stats?.athlete_cents],
                ['Code, search or direct', null, stats?.other_gifts, stats?.other_cents],
              ].map(([k, v, g, c]) => (
                <tr key={k as string} className="h-12 border-t border-hairline-soft">
                  <th scope="row" className="t-list px-3 font-normal">
                    {k}
                  </th>
                  <td className="t-list px-3 text-right tabular">{v === null ? 'Not tracked' : Number(v ?? 0).toLocaleString('en-US')}</td>
                  <td className="t-list px-3 text-right tabular">{Number(g ?? 0).toLocaleString('en-US')}</td>
                  <td className="t-list px-3 text-right tabular">{money(Number(c ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
