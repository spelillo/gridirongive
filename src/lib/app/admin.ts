import 'server-only';
import { cache } from 'react';
import { sys } from '@/lib/db';
import { needsHumanReview } from '@/lib/domain/text';

/** Teams waiting for a person to check their documents. */
export const VERIFICATION_QUEUE_SQL = `(t.verification_status = 'under_review' or (t.verification_status = 'unverified' and t.verification_doc_path is not null))`;

export interface FlaggedMessage {
  id: string;
  team_id: string;
  team_name: string;
  donor_name: string;
  donor_email: string;
  message: string;
  created_at: Date;
}

export interface FlaggedNote {
  id: string;
  team_id: string;
  team_name: string;
  athlete_id: string;
  body: string;
  status: string;
  photo_path: string | null;
  created_at: Date;
}

/** Donor messages waiting for review that the text filter caught (links, phone numbers, payment apps). */
export const flaggedMessages = cache(async (): Promise<FlaggedMessage[]> => {
  const rows = await sys.query<FlaggedMessage>(
    `select d.id, d.team_id, t.name as team_name, d.donor_name, d.donor_email, d.message, d.created_at
     from donations d join teams t on t.id = d.team_id
     where d.message is not null and d.message_status = 'pending' and d.status = 'succeeded'
     order by d.created_at desc limit 500`,
  );
  return rows.filter((r) => needsHumanReview(r.message));
});

/** Thank-you notes not sent yet whose text the filter caught. */
export const flaggedNotes = cache(async (): Promise<FlaggedNote[]> => {
  const rows = await sys.query<FlaggedNote>(
    `select ty.id, ty.team_id, t.name as team_name, ty.athlete_id, ty.body, ty.status, ty.photo_path, ty.created_at
     from thank_yous ty join teams t on t.id = ty.team_id
     where ty.status in ('pending', 'approved')
     order by ty.created_at desc limit 500`,
  );
  return rows.filter((r) => needsHumanReview(r.body));
});

export const adminCounts = cache(async () => {
  const [row, messages, notes] = await Promise.all([
    sys.one<{ verification: number; teams: number; suspended: number; refunds: number; reports: number; failed: number; catalog: number }>(
      `select
         (select count(*) from teams t where ${VERIFICATION_QUEUE_SQL})::int as verification,
         (select count(*) from teams)::int as teams,
         (select count(*) from teams where status = 'suspended')::int as suspended,
         (select count(*) from refund_requests where status = 'open')::int as refunds,
         (select count(*) from reports where status = 'open')::int as reports,
         (select count(*) from notifications where status = 'failed')::int as failed,
         (select count(*) from gear_catalog where active)::int as catalog`,
    ),
    flaggedMessages(),
    flaggedNotes(),
  ]);
  const r = row!;
  return { ...r, flagged: messages.length + notes.length, moderation: r.reports + messages.length + notes.length };
});

/** Domain part of an email or a website, lowercased, without "www.". */
export function domainOf(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.trim().toLowerCase();
  const host = v.includes('@') ? v.split('@').pop()! : v.replace(/^https?:\/\//, '').split('/')[0];
  return host.replace(/^www\./, '') || null;
}

/** True when the email's domain is the org domain or a subdomain of it. */
export function domainMatches(email: string | null | undefined, orgDomain: string | null | undefined): boolean {
  const a = domainOf(email);
  const b = domainOf(orgDomain);
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`)));
}
