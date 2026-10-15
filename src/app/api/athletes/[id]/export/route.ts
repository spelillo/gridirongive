import { getUser } from '@/lib/auth/session';
import { sys } from '@/lib/db';

/** Data export for the athlete or guardian (ui-ux-spec 7.8). Supporter emails are never included. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return new Response('Sign in first', { status: 401 });
  const access = await sys.one<{ role: string }>(`select role from athlete_access where athlete_id = $1 and user_id = $2`, [id, user.id]);
  if (!access) return new Response('Not found', { status: 404 });
  const profile = await sys.one(
    `select a.first_name, a.last_name, a.preferred_name, a.jersey, a.position, a.grade, a.bio, a.photo_alt, a.status, a.show_full_last_name,
       a.athlete_can_edit, a.created_at, a.published_at, t.name as team
     from athletes a join teams t on t.id = a.team_id where a.id = $1`,
    [id],
  );
  const gear = await sys.query(
    `select name, variant, price_cents, raised_cents, status, request_status, why_note, purchased_at, delivered_at from needs where athlete_id = $1 order by created_at`,
    [id],
  );
  const supporters = await sys.query(
    `select distinct on (d.id) case when d.show_name then d.donor_name else 'A supporter' end as name, d.succeeded_at,
       case when d.message_status = 'approved' then d.message end as message
     from donations d join allocations al on al.donation_id = d.id join needs n on n.id = al.need_id
     where n.athlete_id = $1 and d.status = 'succeeded'`,
    [id],
  );
  const contacts = access.role === 'guardian' ? await sys.one(`select guardian_email, guardian2_email, guardian_phone, athlete_email from athlete_contacts where athlete_id = $1`, [id]) : null;
  const consents = access.role === 'guardian' ? await sys.query(`select signed_name, signed_at, withdrawn_at, policy_version, show_full_last_name, athlete_can_edit from consents where athlete_id = $1`, [id]) : [];
  const thankYous = await sys.query(`select body, status, created_at, sent_at from thank_yous where athlete_id = $1`, [id]);
  const body = JSON.stringify({ exported_at: new Date().toISOString(), profile, contacts, consents, gear, supporters, thank_yous: thankYous }, null, 2);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gridiron-give-data.json"',
      'Cache-Control': 'no-store',
    },
  });
}
