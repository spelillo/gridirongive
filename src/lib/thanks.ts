import 'server-only';
import { sys } from '@/lib/db';
import { notify, flushSoon } from '@/lib/notify';
import { thankYouEmail } from '@/lib/notify/templates';
import { athleteDisplayName } from '@/lib/domain/names';
import { env } from '@/lib/env';
import { hmac } from '@/lib/crypto';

export const thanksSig = (id: string) => hmac('thanks', id).slice(0, 24);

/**
 * Emails an approved thank-you to its donors. The athlete never sees donor
 * emails: recipients are resolved here, on the server, at send time.
 */
export async function sendThankYou(thankYouId: string): Promise<number> {
  const t = await sys.one<any>(
    `select ty.id, ty.status, ty.body, ty.photo_path, ty.donation_id, ty.need_id, ty.athlete_id, ty.team_id,
       a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, tm.name as team_name
     from thank_yous ty join athletes a on a.id = ty.athlete_id join teams tm on tm.id = ty.team_id where ty.id = $1`,
    [thankYouId],
  );
  if (!t || t.status === 'sent' || t.status === 'rejected') return 0;
  const emails = await sys.query<{ email: string }>(
    t.donation_id
      ? `select distinct lower(d.donor_email) as email from donations d where d.id = $1 and d.status = 'succeeded'`
      : `select distinct lower(d.donor_email) as email from donations d join allocations al on al.donation_id = d.id and al.reversed_at is null
         where al.need_id = $1 and d.status = 'succeeded'`,
    [t.donation_id ?? t.need_id],
  );
  const name = athleteDisplayName(t);
  const tpl = thankYouEmail({ athlete: name, body: t.body, team: t.team_name });
  for (const e of emails) {
    await notify(sys, { email: e.email, kind: 'thank_you', subject: tpl.subject, body: tpl.body, link: t.photo_path ? `${env.appUrl}/thanks/${t.id}?sig=${thanksSig(t.id)}` : null, inApp: false });
  }
  await sys.query(`update thank_yous set status = 'sent', sent_at = now(), recipients_count = $2 where id = $1`, [t.id, emails.length]);
  flushSoon();
  return emails.length;
}
