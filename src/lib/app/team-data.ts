import 'server-only';
import { asUser } from '@/lib/db';
import { athleteDisplayName } from '@/lib/domain/names';

export interface RosterRow {
  id: string;
  name: string;
  publicName: string;
  firstName: string;
  lastName: string;
  jersey: string | null;
  position: string | null;
  positionGroup: string | null;
  grade: number | null;
  status: string;
  hiddenReason: string | null;
  inviteStatus: string;
  consent: boolean;
  pendingChanges: boolean;
  goalCents: number;
  raisedCents: number;
  openItems: number;
  heldCents: number;
  hasGuardianEmail: boolean;
  photo: string | null;
}

/** The roster as the signed-in staff member or viewer sees it. */
export async function rosterFor(userId: string, teamId: string): Promise<RosterRow[]> {
  const rows = await asUser(userId, (tx) =>
    tx.query<any>(
      `select a.*, coalesce(at.goal_cents, 0) as goal_cents, coalesce(at.raised_cents, 0) as raised_cents,
         coalesce(at.items_total - at.items_funded, 0) as open_items, (c.guardian_email is not null or c.guardian2_email is not null) as has_guardian,
         coalesce((select sum(n.raised_cents) from needs n where n.athlete_id = a.id and n.raised_cents > 0 and n.status not in ('delivered', 'removed')), 0)::int as held,
         t.require_profile_approval
       from athletes a join teams t on t.id = a.team_id left join athlete_totals at on at.athlete_id = a.id left join athlete_contacts c on c.athlete_id = a.id
       where a.team_id = $1 and a.archived_at is null
       order by nullif(regexp_replace(coalesce(a.jersey, ''), '\\D', '', 'g'), '')::int nulls last, a.last_name, a.first_name`,
      [teamId],
    ),
  );
  return rows.map((a) => ({
    id: a.id,
    name: `${a.preferred_name || a.first_name} ${a.last_name}`,
    publicName: athleteDisplayName(a),
    firstName: a.first_name,
    lastName: a.last_name,
    jersey: a.jersey,
    position: a.position,
    positionGroup: a.position_group,
    grade: a.grade,
    status: a.status,
    hiddenReason: a.hidden_reason,
    inviteStatus: a.invite_status,
    consent: Boolean(a.consent_at),
    pendingChanges: Boolean(
      a.status === 'live' && a.require_profile_approval && a.submitted_at && (!a.published_at || new Date(a.submitted_at) > new Date(a.published_at)),
    ),
    goalCents: a.goal_cents,
    raisedCents: a.raised_cents,
    openItems: a.open_items,
    heldCents: a.held,
    hasGuardianEmail: Boolean(a.has_guardian),
    photo: a.photo_path ? `/media/athlete/${a.id}?draft=1&v=${encodeURIComponent(String(a.photo_path).slice(-12))}` : null,
  }));
}

export async function teamTemplates(userId: string, teamId: string) {
  return asUser(userId, (tx) =>
    tx.query<{ id: string; name: string; positions: string[]; items: number; total_cents: number }>(
      `select g.id, g.name, g.positions, count(i.id)::int as items, coalesce(sum(i.price_cents), 0)::int as total_cents
       from gear_templates g left join gear_template_items i on i.template_id = g.id
       where g.team_id = $1 group by g.id order by g.created_at`,
      [teamId],
    ),
  );
}
