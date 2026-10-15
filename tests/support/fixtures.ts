import type { Driver } from '@/lib/db';

/** Ids for the demo seed's main people and records, looked up by name. */
export async function demoIds(db: Driver) {
  const one = async (sql: string, params: unknown[] = []) => {
    const rows = await db.query<{ id: string }>(sql, params);
    if (!rows[0]) throw new Error(`fixture not found: ${sql} ${JSON.stringify(params)}`);
    return rows[0].id;
  };
  const user = (email: string) => one(`select id from profiles where email = $1`, [email]);
  const team = await one(`select id from teams where slug = 'central-high-football'`);
  const athlete = (slug: string) => one(`select id from athletes where team_id = $1 and slug = $2`, [team, slug]);
  return {
    team,
    season: await one(`select current_season_id as id from teams where id = $1`, [team]),
    fund: await one(`select id from needs where team_id = $1 and kind = 'team_fund'`, [team]),
    hillcrest: await one(`select id from teams where slug = 'hillcrest-football'`),
    farragut: await one(`select id from teams where slug = 'farragut-football'`),
    jayden: await athlete('jayden-s-12'),
    liam: await athlete('liam-j-22'),
    owen: await athlete('owen-j-24'),
    jaydenNeed: (name: string) => one(`select n.id from needs n join athletes a on a.id = n.athlete_id where a.slug = 'jayden-s-12' and a.team_id = $1 and n.name = $2`, [team, name]),
    coach: await user('coach.alex@example.com'),
    staff: await user('jordan.lee@example.com'),
    guardian: await user('pat.smith@example.com'),
    athleteUser: await user('jayden.smith@example.com'),
    riley: await user('coach.riley@example.com'),
    admin: await user('admin@example.com'),
  };
}

/** Creates a signed-in person with a profile and nothing else. */
export async function createUser(db: Driver, email: string, name = 'Test Person'): Promise<string> {
  const [u] = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
  await db.query(`insert into profiles (id, email, full_name) values ($1, $2, $3)`, [u.id, email, name]);
  return u.id;
}

/** Adds an existing user to a team with a role. */
export async function addMember(db: Driver, teamId: string, userId: string, email: string, role: 'coach' | 'staff' | 'viewer') {
  await db.query(`insert into team_members (team_id, user_id, email, role, status) values ($1, $2, $3, $4, 'active')`, [teamId, userId, email, role]);
}

/** Postgres error code of a rejected promise (42501 is insufficient_privilege). */
export async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return (err as { code?: string }).code ?? 'unknown';
  }
  return undefined;
}
