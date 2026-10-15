import 'server-only';
import { sys } from '@/lib/db';
import { athleteDisplayName } from '@/lib/domain/names';

export interface Places {
  teams: { id: string; name: string; slug: string; role: string; status: string }[];
  athletes: { id: string; name: string; teamName: string; role: 'guardian' | 'athlete'; status: string }[];
}

/** Everything a signed-in person can manage: teams (as staff) and athlete pages (as athlete or guardian). */
export async function placesFor(userId: string): Promise<Places> {
  const [teams, athletes] = await Promise.all([
    sys.query<any>(
      `select t.id, t.name, t.slug, m.role, t.status from team_members m join teams t on t.id = m.team_id
       where m.user_id = $1 and m.status = 'active' order by t.name`,
      [userId],
    ),
    sys.query<any>(
      `select a.id, a.first_name, a.last_name, a.preferred_name, a.show_full_last_name, a.status, x.role, t.name as team_name
       from athlete_access x join athletes a on a.id = x.athlete_id join teams t on t.id = a.team_id
       where x.user_id = $1 and a.archived_at is null order by a.first_name`,
      [userId],
    ),
  ]);
  return {
    teams: teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug, role: t.role, status: t.status })),
    athletes: athletes.map((a) => ({ id: a.id, name: athleteDisplayName(a), teamName: a.team_name, role: a.role, status: a.status })),
  };
}
