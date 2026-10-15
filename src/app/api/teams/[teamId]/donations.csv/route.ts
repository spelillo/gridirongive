import { getUser } from '@/lib/auth/session';
import { asUser } from '@/lib/db';
import { toCsv } from '@/lib/domain/buylist';
import { athleteDisplayName } from '@/lib/domain/names';
import { donationWhere, donorDisplay, ledgerSelect, parseDonationFilters, type LedgerRow } from '@/lib/app/team-money';

/** CSV of the ledger's current view (ui-ux-spec 8.8). Same filters, no paging. */
export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const user = await getUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(teamId)) return new Response('Not found', { status: 404 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = parseDonationFilters(sp);

  const out = await asUser(user.id, async (tx) => {
    const access = await tx.one<{ member: boolean; edit: boolean; slug: string }>(
      `select is_team_member(id) as member, can_edit_team(id) as edit, slug from teams where id = $1`,
      [teamId],
    );
    if (!access?.member) return null;
    const where = donationWhere(teamId, f, access.edit);
    const rows = await tx.query<LedgerRow>(
      `${ledgerSelect(where.sql)} order by d.created_at desc limit 20000`,
      where.params,
    );
    return { rows, edit: access.edit, slug: access.slug };
  });
  if (!out) return new Response('Not found', { status: 404 });

  const header = ['Date', 'Donor', ...(out.edit ? ['Donor email', 'Shown publicly'] : []), 'Athlete', 'Items', 'Gift', 'Fees covered', 'Net to team', 'Status', 'Message', 'Donation ID'];
  const body = out.rows.map((r) => [
    new Date(r.created_at).toISOString().slice(0, 10),
    out.edit ? r.donor_name : donorDisplay(r),
    ...(out.edit ? [r.donor_email, r.show_name ? 'Yes' : 'No'] : []),
    r.athlete_first ? athleteDisplayName({ first_name: r.athlete_first, last_name: r.athlete_last ?? '', preferred_name: r.athlete_preferred, show_full_last_name: r.athlete_full }) : 'Team',
    r.items ?? 'Team fund',
    (r.gift_cents / 100).toFixed(2),
    r.cover_fees ? (r.fees_cents / 100).toFixed(2) : '0.00',
    (r.net_cents / 100).toFixed(2),
    r.status,
    r.message && (out.edit || r.message_status === 'approved') ? r.message : '',
    r.id,
  ]);
  const csv = toCsv([header, ...body]);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${out.slug}-donations-${day}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
