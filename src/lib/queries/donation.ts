import 'server-only';
import { sys } from '@/lib/db';
import { athleteDisplayName } from '@/lib/domain/names';

export interface DonationSummary {
  id: string;
  status: string;
  donorName: string;
  donorEmail: string;
  showName: boolean;
  message: string | null;
  messageStatus: string;
  giftCents: number;
  coverFees: boolean;
  platformFeeCents: number;
  stripeFeeCents: number;
  totalCents: number;
  netCents: number;
  cardBrand: string | null;
  cardLast4: string | null;
  chargeId: string | null;
  paymentIntentId: string | null;
  failureReason: string | null;
  createdAt: Date;
  succeededAt: Date | null;
  refundedAt: Date | null;
  team: { id: string; name: string; slug: string; orgName: string; orgEin: string | null; orgTaxExempt: boolean };
  athlete: { id: string; name: string; first: string; slug: string; shareToken: string } | null;
  lines: { needId: string; name: string; kind: string; athleteName: string | null; amountCents: number; priceCents: number | null; raisedCents: number; status: string; overflow: boolean }[];
}

export async function getDonationSummary(id: string): Promise<DonationSummary | null> {
  const d = await sys.one<any>(
    `select d.*, t.name as team_name, t.slug as team_slug, o.name as org_name, o.ein as org_ein, o.tax_exempt as org_tax_exempt,
       a.id as a_id, a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name, a.slug as a_slug, a.share_token
     from donations d join teams t on t.id = d.team_id join organizations o on o.id = t.org_id
     left join athletes a on a.id = d.athlete_id
     where d.id = $1`,
    [id],
  );
  if (!d) return null;
  const lines = await sys.query<any>(
    `select n.id as need_id, n.name, n.kind, n.price_cents, n.raised_cents, n.status, al.amount_cents, al.overflow,
       a.first_name, a.last_name, a.pub_preferred_name, a.show_full_last_name
     from allocations al join needs n on n.id = al.need_id left join athletes a on a.id = n.athlete_id
     where al.donation_id = $1 order by al.overflow, al.amount_cents desc`,
    [id],
  );
  return {
    id: d.id,
    status: d.status,
    donorName: d.donor_name,
    donorEmail: d.donor_email,
    showName: d.show_name,
    message: d.message,
    messageStatus: d.message_status,
    giftCents: d.gift_cents,
    coverFees: d.cover_fees,
    platformFeeCents: d.platform_fee_cents,
    stripeFeeCents: d.stripe_fee_cents,
    totalCents: d.total_cents,
    netCents: d.net_cents,
    cardBrand: d.card_brand,
    cardLast4: d.card_last4,
    chargeId: d.charge_id,
    paymentIntentId: d.payment_intent_id,
    failureReason: d.failure_reason,
    createdAt: d.created_at,
    succeededAt: d.succeeded_at,
    refundedAt: d.refunded_at,
    team: { id: d.team_id, name: d.team_name, slug: d.team_slug, orgName: d.org_name, orgEin: d.org_ein, orgTaxExempt: d.org_tax_exempt },
    athlete: d.a_id
      ? { id: d.a_id, name: athleteDisplayName(d, d.pub_preferred_name), first: (d.pub_preferred_name || d.first_name).trim(), slug: d.a_slug, shareToken: d.share_token }
      : null,
    lines: lines.map((l) => ({
      needId: l.need_id,
      name: l.name,
      kind: l.kind,
      athleteName: l.first_name ? athleteDisplayName(l, l.pub_preferred_name) : null,
      amountCents: l.amount_cents,
      priceCents: l.price_cents,
      raisedCents: l.raised_cents,
      status: l.status,
      overflow: l.overflow,
    })),
  };
}

/** The next most-needed open item for an athlete, for "Fund another item". */
export async function nextOpenNeed(athleteId: string, excludeIds: string[] = []) {
  return sys.one<{ id: string; name: string; left_cents: number }>(
    `select n.id, n.name, (n.price_cents - n.raised_cents) as left_cents from needs n join athletes a on a.id = n.athlete_id join teams t on t.id = a.team_id
     where n.athlete_id = $1 and n.season_id = t.current_season_id and n.status in ('open', 'partially_funded') and n.request_status = 'approved'
       and a.status = 'live' and not (n.id = any($2::uuid[]))
     order by (n.price_cents - n.raised_cents) desc limit 1`,
    [athleteId, excludeIds],
  );
}
