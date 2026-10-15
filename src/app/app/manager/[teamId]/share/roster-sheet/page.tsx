import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { env } from '@/lib/env';
import { athleteDisplayName } from '@/lib/domain/names';
import { PrintNow } from '@/components/app/PrintNow';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = { title: 'Roster QR sheet' };

/** Every live player's personal link as a QR, to hand out at practice (ui-ux-spec 8.11). */
export default async function RosterSheetPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  if (!ctx.canEdit) notFound();
  const athletes = await asUser(ctx.user.id, (tx) =>
    tx.query<any>(
      `select id, first_name, last_name, preferred_name, pub_preferred_name, show_full_last_name, jersey, position, share_token
       from athletes where team_id = $1 and status = 'live' and archived_at is null
       order by nullif(regexp_replace(coalesce(jersey, ''), '\\D', '', 'g'), '')::int nulls last, first_name`,
      [teamId],
    ),
  );
  const cards = await Promise.all(
    athletes.map(async (a) => {
      const url = `${env.appUrl}/s/${a.share_token}`;
      return { id: a.id, name: athleteDisplayName(a, a.pub_preferred_name), jersey: a.jersey, position: a.position, url, qr: await QRCode.toDataURL(url, { margin: 0, width: 300 }) };
    }),
  );
  return (
    <div className="flex flex-col gap-4">
      <style>{`@media print { @page { size: letter; margin: 0.4in; } }`}</style>
      <div className="no-print flex flex-col gap-1">
        <h1 className="t-section">Roster QR sheet</h1>
        <p className="t-caption">Cut along the lines and hand each player their card. Each code opens only that player&apos;s page.</p>
      </div>
      {cards.length === 0 ? (
        <EmptyState action={<ButtonLink href={`/app/manager/${teamId}/roster`} variant="secondary">Open the roster</ButtonLink>}>No live players yet.</EmptyState>
      ) : (
        <>
          <PrintNow label="Print sheet" />
          <p className="hidden text-[14px] text-ink-meta print:block">{ctx.team.name}</p>
          <ul className="grid grid-cols-2 gap-0 sm:grid-cols-3 print:grid-cols-3">
            {cards.map((c) => (
              <li key={c.id} className="flex break-inside-avoid flex-col items-center gap-2 border border-dashed border-hairline-soft p-4 text-center">
                <img src={c.qr} alt={`QR code for ${c.name}'s page`} className="size-28" />
                <p className="text-[16px] font-medium leading-tight text-ink">
                  {c.jersey ? `#${c.jersey} ` : ''}
                  {c.name}
                </p>
                {c.position && <p className="t-caption">{c.position}</p>}
                <p className="break-all text-[11px] leading-tight text-ink-meta">{c.url.replace(/^https?:\/\//, '')}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
