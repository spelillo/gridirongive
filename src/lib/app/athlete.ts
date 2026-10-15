import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireUser, type SessionUser } from '@/lib/auth/session';
import { athleteDisplayName, firstName } from '@/lib/domain/names';

export interface AthleteCtx {
  user: SessionUser;
  role: 'guardian' | 'athlete';
  canEdit: boolean;
  athlete: {
    id: string;
    teamId: string;
    slug: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    displayName: string;
    first: string;
    jersey: string | null;
    position: string | null;
    grade: number | null;
    under13: boolean;
    status: string;
    hiddenReason: string | null;
    reviewNote: string | null;
    showFullLastName: boolean;
    athleteCanEdit: boolean;
    bio: string;
    photoPath: string | null;
    photoAlt: string | null;
    pubBio: string | null;
    pubPhotoPath: string | null;
    pubPreferredName: string | null;
    publishedAt: Date | null;
    shareToken: string;
    consentAt: Date | null;
    submittedAt: Date | null;
    setupStep: number;
  };
  team: {
    id: string;
    name: string;
    slug: string;
    status: string;
    sport: string;
    color: string | null;
    requireProfileApproval: boolean;
    requireThankyouApproval: boolean;
    showAmountsToAthletes: boolean;
    seasonId: string | null;
    seasonLabel: string;
    coach: string;
  };
}

/** Loads an athlete the signed-in person is linked to (as guardian or athlete), through row level security. */
export const loadAthleteCtx = cache(async (athleteId: string): Promise<AthleteCtx> => {
  const user = await requireUser(`/app/athlete/${athleteId}`);
  if (!/^[0-9a-f-]{36}$/.test(athleteId)) notFound();
  const row = await asUser(user.id, (tx) =>
    tx.one<any>(
      `select a.*, athlete_role(a.id) as my_role, t.name as team_name, t.slug as team_slug, t.status as team_status, t.sport, t.color as team_color,
         t.require_profile_approval, t.require_thankyou_approval, t.show_amounts_to_athletes, t.current_season_id,
         coalesce(s.label, '') as season_label,
         coalesce((select p.full_name from team_members m join profiles p on p.id = m.user_id
                   where m.team_id = t.id and m.role = 'coach' and m.status = 'active' order by m.created_at limit 1), '') as coach
       from athletes a join teams t on t.id = a.team_id left join seasons s on s.id = t.current_season_id
       where a.id = $1 and a.archived_at is null`,
      [athleteId],
    ),
  ).catch(() => null);
  if (!row || !row.my_role) notFound();
  const role = row.my_role as 'guardian' | 'athlete';
  const coachLast = row.coach ? `Coach ${row.coach.trim().split(/\s+/).pop()}` : 'your coach';
  return {
    user,
    role,
    canEdit: role === 'guardian' || row.athlete_can_edit,
    athlete: {
      id: row.id,
      teamId: row.team_id,
      slug: row.slug,
      firstName: row.first_name,
      lastName: row.last_name,
      preferredName: row.preferred_name,
      displayName: athleteDisplayName(row),
      first: firstName(row),
      jersey: row.jersey,
      position: row.position,
      grade: row.grade,
      under13: row.under_13,
      status: row.status,
      hiddenReason: row.hidden_reason,
      reviewNote: row.review_note,
      showFullLastName: row.show_full_last_name,
      athleteCanEdit: row.athlete_can_edit,
      bio: row.bio,
      photoPath: row.photo_path,
      photoAlt: row.photo_alt,
      pubBio: row.pub_bio,
      pubPhotoPath: row.pub_photo_path,
      pubPreferredName: row.pub_preferred_name,
      publishedAt: row.published_at,
      shareToken: row.share_token,
      consentAt: row.consent_at,
      submittedAt: row.submitted_at,
      setupStep: row.setup_step,
    },
    team: {
      id: row.team_id,
      name: row.team_name,
      slug: row.team_slug,
      status: row.team_status,
      sport: row.sport,
      color: row.team_color ?? null,
      requireProfileApproval: row.require_profile_approval,
      requireThankyouApproval: row.require_thankyou_approval,
      showAmountsToAthletes: row.show_amounts_to_athletes,
      seasonId: row.current_season_id,
      seasonLabel: row.season_label,
      coach: coachLast,
    },
  };
});
