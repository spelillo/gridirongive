// TEMPORARY test fixture for the admin pages. Deleted after browser testing.
import { NextResponse } from 'next/server';
import { sys } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { mode } from '@/lib/env';
import { putObject } from '@/lib/storage';
import { readFile } from 'node:fs/promises';

export async function PUT() {
  await requireAdmin();
  if (!mode.demo) return NextResponse.json({ error: 'demo only' }, { status: 404 });
  const { flushNotifications, sendDigests } = await import('@/lib/notify');
  const u = await sys.one<any>(`select id from profiles where email = 'jordan.lee@example.com'`);
  await sys.query(`update profiles set email_prefs = '{"donations":"digest","approvals":"off","updates":"instant"}' where id = $1`, [u.id]);
  await sys.query(`insert into notifications (user_id, kind, subject, body, link) values ($1, 'new_gift', 'DIGTEST gift one', 'Body one', '/app'), ($1, 'item_funded', 'DIGTEST funded two', 'Body two', null), ($1, 'approval_needed', 'DIGTEST approval off', 'x', null), ($1, 'refund', 'DIGTEST refund always', 'y', null)`, [u.id]);
  const flush = await flushNotifications(500);
  const mid = await sys.query(`select subject, status, error, in_app from notifications where subject like 'DIGTEST%' order by subject`);
  const dig = await sendDigests();
  const after = await sys.query(`select subject, status, error from notifications where subject like 'DIGTEST%' order by subject`);
  const mail = await sys.one(`select subject, body from notifications where kind = 'digest' and user_id = $1 order by created_at desc limit 1`, [u.id]);
  await sys.query(`update profiles set email_prefs = '{"donations":"instant","approvals":"instant","updates":"instant"}' where id = $1`, [u.id]);
  await sys.query(`delete from notifications where user_id = $1 and (subject like 'DIGTEST%' or kind = 'digest')`, [u.id]);
  return NextResponse.json({ flush, mid, dig, after, mail });
}

export async function POST() {
  await requireAdmin();
  if (!mode.demo) return NextResponse.json({ error: 'demo only' }, { status: 404 });
  const png = await readFile('/tmp/claude-0/account-admin/doc.png');
  await putObject('verification', 'test/hillcrest-doc.png', png, 'image/png');
  const hill = await sys.one<any>(`update teams set verification_status = 'under_review', verification_method = 'document', verification_doc_path = 'test/hillcrest-doc.png',
    verification_contact = 'Dana Price, athletic director, 423-555-0100' where slug = 'hillcrest-football' returning id`);
  const far = await sys.one<any>(`select id from teams where slug = 'farragut-football'`);
  const ath = await sys.one<any>(`select id from athletes where team_id = $1 and status = 'live' order by first_name limit 1`, [far.id]);
  await sys.query(`insert into reports (team_id, athlete_id, reason, reporter_email) values ($1, $2, 'The photo shows a home address on the mailbox.', 'concerned.parent@example.com')`, [far.id, ath.id]);
  await sys.query(`insert into reports (team_id, reason) values ($1, 'This team page asks people to Venmo the coach directly.')`, [far.id]);
  const dons = await sys.query<any>(`select id from donations where team_id = $1 and status = 'succeeded' order by created_at limit 2`, [far.id]);
  if (dons[0]) await sys.query(`insert into refund_requests (donation_id, team_id, reason) values ($1, $2, 'Donor gave twice by mistake and asked for the second gift back.')`, [dons[0].id, far.id]);
  if (dons[1]) await sys.query(`update donations set message = 'Text me at 865-555-0199 for more help!', message_status = 'pending' where id = $1`, [dons[1].id]);
  await sys.query(`insert into thank_yous (team_id, athlete_id, body, status) values ($1, $2, 'Thanks! Follow me at www.example.com/me', 'pending')`, [far.id, ath.id]);
  await sys.query(`insert into notifications (email, kind, subject, body, in_app, send_email, status, error) values ('bounce@example.com', 'receipt', 'Receipt: $25.00 to Farragut Varsity Football', 'Test', false, true, 'failed', 'Resend responded 422')`);
  return NextResponse.json({ ok: true, hill: hill?.id, far: far.id, athlete: ath.id, donations: dons.map((d: any) => d.id) });
}
