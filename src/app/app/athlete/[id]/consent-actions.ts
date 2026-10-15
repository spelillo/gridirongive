'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { sys } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { clientIp } from '@/lib/request';
import { notify, notifyTeamStaff, flushSoon } from '@/lib/notify';
import { consentConfirmationEmail } from '@/lib/notify/templates';
import { SITE } from '@/config/site';
import { env } from '@/lib/env';
import { athleteDisplayName, firstName } from '@/lib/domain/names';
import { formatDateTime } from '@/lib/domain/text';

export type ConsentState = { error?: string; fields?: Record<string, string> };

/** Records guardian consent (ui-ux-spec 7.2) with name, time and IP. */
export async function giveConsent(athleteId: string, _prev: ConsentState, form: FormData): Promise<ConsentState> {
  const user = await requireUser(`/app/athlete/${athleteId}/consent`);
  const access = await sys.one<{ role: string }>(`select role from athlete_access where athlete_id = $1 and user_id = $2`, [athleteId, user.id]);
  if (access?.role !== 'guardian') return { error: 'Only a parent or guardian can give consent.' };
  const a = await sys.one<any>(
    `select a.id, a.team_id, a.status, a.under_13, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, t.name as team_name
     from athletes a join teams t on t.id = a.team_id where a.id = $1`,
    [athleteId],
  );
  if (!a) return { error: 'This player page no longer exists.' };

  const signedName = String(form.get('signed_name') ?? '').trim().replace(/\s+/g, ' ');
  const attest = form.get('attest') === 'on';
  const fields: Record<string, string> = {};
  if (!attest) fields.attest = `Confirm that you are ${firstName(a)}'s parent or legal guardian.`;
  if (signedName.length < 3 || !signedName.includes(' ')) fields.signed_name = 'Type your full name, first and last.';
  if (Object.keys(fields).length) return { error: 'Check the form.', fields };

  const showFull = form.get('show_full_last_name') === 'on';
  const athleteEdit = !a.under_13 && form.get('athlete_can_edit') === 'on';
  const h = await headers();
  await sys.tx(async (tx) => {
    await tx.query(`update consents set withdrawn_at = now() where athlete_id = $1 and withdrawn_at is null`, [a.id]);
    await tx.query(
      `insert into consents (athlete_id, guardian_user_id, signed_name, ip, user_agent, show_full_last_name, athlete_can_edit, policy_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [a.id, user.id, signedName.slice(0, 120), await clientIp(), (h.get('user-agent') ?? '').slice(0, 300), showFull, athleteEdit, SITE.consentPolicyVersion],
    );
    await tx.query(
      `update athletes set consent_at = now(), show_full_last_name = $2, athlete_can_edit = $3,
         status = case when status = 'needs_consent' then 'draft'::athlete_status else status end,
         hidden_reason = case when status = 'needs_consent' then null else hidden_reason end
       where id = $1`,
      [a.id, showFull, athleteEdit],
    );
    await tx.query(`update profiles set full_name = coalesce(full_name, $2) where id = $1`, [user.id, signedName]);
    await tx.query(`insert into activity_log (team_id, athlete_id, actor_id, action, detail) values ($1, $2, $3, 'consent_given', $4)`, [
      a.team_id, a.id, user.id, JSON.stringify({ by: signedName }),
    ]);
    const name = athleteDisplayName({ ...a, show_full_last_name: showFull });
    const tpl = consentConfirmationEmail({ athlete: firstName(a), team: a.team_name, signedName, when: formatDateTime(new Date()) });
    await notify(tx, { userId: user.id, email: user.email, kind: 'consent', subject: tpl.subject, body: tpl.body, link: `${env.appUrl}/app/athlete/${a.id}/profile`, inApp: false });
    await notifyTeamStaff(tx, a.team_id, {
      kind: 'consent',
      subject: `Consent given for ${name}`,
      body: `${signedName} gave consent for ${name}. Their page can now be set up.`,
      link: `${env.appUrl}/app/manager/${a.team_id}/roster/${a.id}`,
    });
  });
  flushSoon();
  redirect(`/app/athlete/${a.id}/setup`);
}
