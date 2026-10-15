import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { asUser, sys } from '@/lib/db';
import { requireUser, type SessionUser } from '@/lib/auth/session';

export interface TeamCtx {
  user: SessionUser;
  role: 'coach' | 'staff' | 'viewer';
  canEdit: boolean;
  isCoach: boolean;
  team: {
    id: string;
    orgId: string;
    orgName: string;
    orgDomain: string | null;
    slug: string;
    name: string;
    sport: string;
    level: string;
    city: string;
    state: string;
    zip: string | null;
    about: string;
    photoPath: string | null;
    status: string;
    verificationStatus: string;
    verificationMethod: string | null;
    verificationNote: string | null;
    payoutsStatus: string;
    stripeAccountId: string | null;
    codeVersion: number;
    requireProfileApproval: boolean;
    requireThankyouApproval: boolean;
    requireMessageApproval: boolean;
    showAmountsToAthletes: boolean;
    seasonId: string | null;
    seasonLabel: string;
    defaultTemplateId: string | null;
    publishedAt: Date | null;
  };
}

/** Loads a team the signed-in person is staff or a viewer on. Platform admins can open any team as a viewer. */
export const loadTeamCtx = cache(async (teamId: string): Promise<TeamCtx> => {
  const user = await requireUser(`/app/manager/${teamId}`);
  if (!/^[0-9a-f-]{36}$/.test(teamId)) notFound();
  const row = await asUser(user.id, (tx) =>
    tx.one<any>(
      `select t.*, team_role(t.id) as my_role, o.name as org_name, o.domain as org_domain, coalesce(s.label, '') as season_label
       from teams t join organizations o on o.id = t.org_id left join seasons s on s.id = t.current_season_id where t.id = $1`,
      [teamId],
    ),
  ).catch(() => null);
  if (!row) notFound();
  let role = row.my_role as TeamCtx['role'] | null;
  if (!role && user.isAdmin) role = 'viewer';
  if (!role) notFound();
  return {
    user,
    role,
    canEdit: role === 'coach' || role === 'staff',
    isCoach: role === 'coach',
    team: {
      id: row.id,
      orgId: row.org_id,
      orgName: row.org_name,
      orgDomain: row.org_domain,
      slug: row.slug,
      name: row.name,
      sport: row.sport,
      level: row.level,
      city: row.city,
      state: row.state,
      zip: row.zip,
      about: row.about,
      photoPath: row.photo_path,
      status: row.status,
      verificationStatus: row.verification_status,
      verificationMethod: row.verification_method,
      verificationNote: row.verification_note,
      payoutsStatus: row.payouts_status,
      stripeAccountId: row.stripe_account_id,
      codeVersion: row.code_version,
      requireProfileApproval: row.require_profile_approval,
      requireThankyouApproval: row.require_thankyou_approval,
      requireMessageApproval: row.require_message_approval,
      showAmountsToAthletes: row.show_amounts_to_athletes,
      seasonId: row.current_season_id,
      seasonLabel: row.season_label,
      defaultTemplateId: row.default_template_id,
      publishedAt: row.published_at,
    },
  };
});

/** Counts that drive the action list and nav badges. */
export const teamCounts = cache(async (teamId: string) => {
  const r = await sys.one<any>(
    `select
       (select count(*) from athletes a where a.team_id = $1 and a.archived_at is null and (a.status = 'awaiting_coach'
          or (a.status = 'live' and t.require_profile_approval and a.submitted_at is not null and (a.published_at is null or a.submitted_at > a.published_at))))::int as profiles,
       (select count(*) from needs n where n.team_id = $1 and n.season_id = t.current_season_id and n.request_status = 'pending' and n.status <> 'removed')::int as gear,
       (select count(*) from donations d where d.team_id = $1 and d.status = 'succeeded' and d.message_status = 'pending')::int as messages,
       (select count(*) from thank_yous ty where ty.team_id = $1 and ty.status = 'pending')::int as thanks,
       (select count(*) from needs n where n.team_id = $1 and n.season_id = t.current_season_id and n.status = 'funded' and n.kind <> 'team_fund')::int as to_buy,
       (select count(*) from athletes a where a.team_id = $1 and a.archived_at is null and a.invite_status <> 'accepted' and a.status = 'needs_consent')::int as not_joined
     from teams t where t.id = $1`,
    [teamId],
  );
  const c = r ?? { profiles: 0, gear: 0, messages: 0, thanks: 0, to_buy: 0, not_joined: 0 };
  return { ...c, approvals: c.profiles + c.gear + c.messages + c.thanks };
});
