import 'server-only';
import { sys } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { athleteDisplayName } from '@/lib/domain/names';
import { receiptSig } from '@/lib/crypto';
import { thanksSig } from '@/lib/thanks';
import { deliveryPhotoPath } from '@/lib/media-links';

export interface DonorGift {
  id: string;
  date: Date;
  status: string;
  team: { name: string; slug: string; public: boolean };
  totalCents: number;
  giftCents: number;
  receiptHref: string;
  items: { needId: string; name: string; athlete: string | null; amountCents: number; status: string; purchasedAt: Date | null; deliveredAt: Date | null; hasPhoto?: boolean }[];
}

export interface DonorUpdate {
  key: string;
  date: Date;
  kind: 'purchased' | 'delivered' | 'thanks';
  title: string;
  body: string | null;
  photoHref: string | null;
}

/**
 * Links gifts made with this email before the person had an account. The
 * session email was verified at sign-in (magic link or code), so this is
 * safe. Runs as system, never inside a user transaction.
 */
export async function claimDonationsByEmail(user: SessionUser): Promise<void> {
  await sys.query(`update donations set donor_user_id = $1 where donor_user_id is null and lower(donor_email) = lower($2)`, [user.id, user.email]);
}

export async function donorGiftCount(user: SessionUser): Promise<number> {
  const r = await sys.one<{ n: number }>(
    `select count(*)::int as n from donations where (donor_user_id = $1 or lower(donor_email) = lower($2)) and status <> 'failed'`,
    [user.id, user.email],
  );
  return r?.n ?? 0;
}

/** Athlete names follow the public display rules; hidden or deleted pages show no name. */
function nameFor(r: any): string | null {
  if (!r.athlete_id) return null;
  if (r.a_status !== 'live' || r.a_archived) return 'A player';
  return athleteDisplayName({ first_name: r.first_name, last_name: r.last_name, preferred_name: r.pub_preferred_name, show_full_last_name: r.show_full_last_name });
}

export async function donorHistory(user: SessionUser): Promise<{ gifts: DonorGift[]; updates: DonorUpdate[] }> {
  const donations = await sys.query<any>(
    `select d.id, d.status, d.created_at, d.succeeded_at, d.total_cents, d.gift_cents, t.name as team_name, t.slug as team_slug,
       t.status in ('live', 'season_closed') as team_public
     from donations d join teams t on t.id = d.team_id
     where (d.donor_user_id = $1 or lower(d.donor_email) = lower($2)) and d.status <> 'failed'
     order by coalesce(d.succeeded_at, d.created_at) desc limit 500`,
    [user.id, user.email],
  );
  const ids = donations.map((d) => d.id as string);
  if (!ids.length) return { gifts: [], updates: [] };
  const allocs = await sys.query<any>(
    `select al.donation_id, al.need_id, sum(al.amount_cents)::int as amount_cents, n.name, n.kind, n.status, n.purchased_at, n.delivered_at, n.delivery_photo_path is not null as has_photo, n.athlete_id,
       a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name, a.status as a_status, a.archived_at is not null as a_archived
     from allocations al join needs n on n.id = al.need_id left join athletes a on a.id = n.athlete_id
     where al.donation_id = any($1::uuid[])
     group by al.donation_id, al.need_id, n.id, a.id
     order by min(al.created_at)`,
    [ids],
  );
  // What the donor asked for, for gifts that have not been allocated yet.
  const lines = await sys.query<any>(
    `select l.donation_id, n.name, n.kind, n.athlete_id, a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name,
       a.status as a_status, a.archived_at is not null as a_archived, l.athlete_id as line_athlete
     from donation_lines l left join needs n on n.id = l.need_id left join athletes a on a.id = coalesce(n.athlete_id, l.athlete_id)
     where l.donation_id = any($1::uuid[])`,
    [ids],
  );

  const gifts: DonorGift[] = donations.map((d) => {
    const mine = allocs.filter((a) => a.donation_id === d.id);
    const items = mine.length
      ? mine.map((a) => ({
          needId: a.need_id,
          name: a.kind === 'team_fund' ? 'Team fund' : a.name,
          athlete: nameFor(a),
          amountCents: a.amount_cents,
          status: a.status,
          purchasedAt: a.purchased_at,
          deliveredAt: a.delivered_at,
          hasPhoto: a.has_photo,
        }))
      : lines
          .filter((l) => l.donation_id === d.id)
          .map((l, i) => ({
            needId: `line-${i}`,
            name: l.kind === 'team_fund' || (!l.name && !l.line_athlete) ? 'Team fund' : (l.name ?? 'Gear'),
            athlete: nameFor({ ...l, athlete_id: l.athlete_id ?? l.line_athlete }),
            amountCents: 0,
            status: 'pending',
            purchasedAt: null,
            deliveredAt: null,
          }));
    return {
      id: d.id,
      date: d.succeeded_at ?? d.created_at,
      status: d.status,
      team: { name: d.team_name, slug: d.team_slug, public: d.team_public },
      totalCents: d.total_cents,
      giftCents: d.gift_cents,
      receiptHref: `/receipt/${d.id}?sig=${receiptSig(d.id)}`,
      items,
    };
  });

  const updates: DonorUpdate[] = [];
  const seen = new Set<string>();
  for (const g of gifts) {
    if (g.status !== 'succeeded') continue;
    for (const it of g.items) {
      if (seen.has(it.needId)) continue;
      seen.add(it.needId);
      const label = it.athlete ? `${it.name} for ${it.athlete}` : it.name;
      if (it.purchasedAt) updates.push({ key: `p-${it.needId}`, date: it.purchasedAt, kind: 'purchased', title: `${label} was purchased`, body: `${g.team.name} bought the gear you helped fund.`, photoHref: null });
      if (it.deliveredAt) updates.push({ key: `d-${it.needId}`, date: it.deliveredAt, kind: 'delivered', title: `${label} was delivered`, body: 'The gear was handed out.', photoHref: it.hasPhoto ? deliveryPhotoPath(it.needId) : null });
    }
  }
  const needIds = [...seen].filter((s) => !s.startsWith('line-'));
  const notes = await sys.query<any>(
    `select ty.id, ty.body, ty.photo_path, ty.sent_at, ty.created_at, a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name,
       a.status as a_status, a.archived_at is not null as a_archived, ty.athlete_id
     from thank_yous ty join athletes a on a.id = ty.athlete_id
     where ty.status = 'sent' and (ty.donation_id = any($1::uuid[]) or (ty.donation_id is null and ty.need_id = any($2::uuid[])))
     order by coalesce(ty.sent_at, ty.created_at) desc limit 100`,
    [ids.filter((id) => gifts.find((g) => g.id === id)?.status === 'succeeded'), needIds],
  );
  for (const n of notes) {
    const who = nameFor(n) ?? 'A player';
    updates.push({
      key: `t-${n.id}`,
      date: n.sent_at ?? n.created_at,
      kind: 'thanks',
      title: `A thank-you from ${who}`,
      body: n.body,
      photoHref: n.photo_path ? `/media/thanks/${n.id}?sig=${thanksSig(n.id)}` : null,
    });
  }
  updates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return { gifts, updates: updates.slice(0, 60) };
}
