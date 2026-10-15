import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sys } from '@/lib/db';

const NAMES = [
  'search_submitted', 'team_viewed', 'code_attempted', 'athlete_viewed', 'pin_tapped', 'give_opened', 'give_amount_selected',
  'give_fees_toggled', 'payment_submitted', 'payment_succeeded', 'share_clicked', 'invite_sent', 'invite_accepted', 'consent_given',
  'profile_submitted', 'profile_approved', 'purchase_logged', 'delivery_marked',
] as const;

const Body = z.object({
  name: z.enum(NAMES),
  props: z.record(z.string().max(40), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).default({}),
});

/** Analytics events for the funnel metrics in ui-ux-spec 1.4. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const props = Object.fromEntries(Object.entries(parsed.data.props).slice(0, 12));
  await sys.query(`insert into analytics_events (name, props) values ($1, $2)`, [parsed.data.name, JSON.stringify(props)]);
  return new NextResponse(null, { status: 204 });
}
