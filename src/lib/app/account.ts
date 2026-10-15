import 'server-only';
import { sys } from '@/lib/db';

/** Reasons the account can't be deleted yet. Empty when it can. */
export async function accountDeletionBlockers(userId: string): Promise<string[]> {
  const [coach, guardian] = await Promise.all([
    sys.query<{ name: string }>(
      `select t.name from team_members m join teams t on t.id = m.team_id where m.user_id = $1 and m.status = 'active' and m.role = 'coach' order by t.name`,
      [userId],
    ),
    sys.query<{ first_name: string }>(
      `select a.first_name from athlete_access x join athletes a on a.id = x.athlete_id where x.user_id = $1 and x.role = 'guardian' order by a.first_name`,
      [userId],
    ),
  ]);
  const out: string[] = [];
  for (const t of coach) out.push(`You are the head coach of ${t.name}. Hand the team to another coach in team settings, or delete the team first.`);
  for (const a of guardian) out.push(`You are the parent or guardian for ${a.first_name}. Delete ${a.first_name}'s profile from Profile and privacy first, or ask the coach to link another guardian.`);
  return out;
}
