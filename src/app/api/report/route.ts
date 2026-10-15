import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sys } from '@/lib/db';
import { env } from '@/lib/env';
import { ipKey } from '@/lib/request';
import { countRecent, record } from '@/lib/auth/limits';
import { notify, flushSoon } from '@/lib/notify';
import { REPORT_REASONS, reportReasonLabel } from '@/lib/report-reasons';
import { cleanUserText } from '@/lib/domain/text';
import { SITE } from '@/config/site';

const reasonIds = REPORT_REASONS.map((r) => r.id) as [string, ...string[]];
const slug = z.string().trim().max(120).regex(/^[a-z0-9-]*$/).optional().or(z.literal(''));

const Body = z
  .object({
    reason: z.enum(reasonIds, { error: 'Choose what is wrong.' }),
    details: z.string().max(2000, 'Keep the details under 2,000 characters.').default(''),
    email: z.union([z.literal(''), z.email('Enter a valid email address, or leave it blank.')]).default(''),
    page: z.string().trim().max(300).default(''),
    team: slug,
    athlete: slug,
    // Honeypot: a field people never see. Bots fill it in.
    website: z.string().max(200).default(''),
  })
  .refine((b) => b.reason !== 'other' || b.details.trim().length >= 10, { path: ['details'], message: 'Tell us what is wrong in a sentence or two.' });

const LIMIT_PER_HOUR = 5;

/** Report a problem with a page (team or athlete). Stored for admins, who are notified. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? 'form');
      fields[k] ??= issue.message;
    }
    return NextResponse.json({ ok: false, error: 'Check the highlighted fields.', fields }, { status: 400 });
  }
  const b = parsed.data;
  // Pretend it worked so bots learn nothing.
  if (b.website) return NextResponse.json({ ok: true });

  const key = await ipKey('report');
  if ((await countRecent([key], 60)) >= LIMIT_PER_HOUR) {
    return NextResponse.json(
      { ok: false, error: `You've sent several reports in the last hour. Try again later, or email ${SITE.supportEmail}.` },
      { status: 429 },
    );
  }

  const team = b.team ? await sys.one<{ id: string; name: string; slug: string }>(`select id, name, slug from teams where slug = $1`, [b.team]) : null;
  const athlete = team && b.athlete ? await sys.one<{ id: string }>(`select id from athletes where team_id = $1 and slug = $2`, [team.id, b.athlete]) : null;

  const label = reportReasonLabel(b.reason);
  const details = cleanUserText(b.details, 2000);
  const page = b.page && !team ? cleanUserText(b.page, 300) : '';
  const text = [label + '.', details && `Details: ${details}`, page && `Page: ${page}`].filter(Boolean).join('\n');

  await sys.query(`insert into reports (team_id, athlete_id, reason, reporter_email) values ($1, $2, $3, $4)`, [
    team?.id ?? null,
    athlete?.id ?? null,
    text,
    b.email ? b.email.toLowerCase() : null,
  ]);
  await record([key], true);

  const where = team ? `${team.name}${athlete ? ', a player page' : ', team page'}` : page || 'No page given';
  const admins = await sys.query<{ id: string }>(`select id from profiles where is_admin`);
  for (const a of admins) {
    await notify(sys, {
      userId: a.id,
      kind: 'report',
      subject: `New report: ${label}`,
      body: `${where}.\n\n${details || 'No details given.'}${b.email ? `\n\nReporter: ${b.email}` : ''}`,
      link: `${env.appUrl}/app/admin/moderation`,
    });
  }
  flushSoon();
  return NextResponse.json({ ok: true });
}
