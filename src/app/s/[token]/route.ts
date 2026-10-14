import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sys } from '@/lib/db';
import { setAthleteUnlock, setTeamUnlock } from '@/lib/access';

/**
 * Short share links. A team link unlocks the roster (and stops working when
 * the code changes); an athlete link unlocks only that athlete's page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const store = await cookies();
  const remember = () => store.set('gg_src', token.slice(0, 64), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });

  const teamLink = await sys.one<{ team_id: string; slug: string; code_version: number; active: boolean }>(
    `select s.team_id, t.slug, t.code_version, s.active from share_links s join teams t on t.id = s.team_id
     where s.token = $1 and s.athlete_id is null and t.status in ('live', 'season_closed')`,
    [token],
  );
  if (teamLink) {
    if (!teamLink.active) return NextResponse.redirect(new URL(`/t/${teamLink.slug}?expired=1`, url));
    await sys.query(`update share_links set visits = visits + 1 where token = $1`, [token]);
    await setTeamUnlock(teamLink.team_id, teamLink.code_version);
    remember();
    return NextResponse.redirect(new URL(`/t/${teamLink.slug}`, url));
  }

  const athlete = await sys.one<{ id: string; slug: string; share_token: string; team_slug: string; team_id: string }>(
    `select a.id, a.slug, a.share_token, t.slug as team_slug, t.id as team_id from athletes a join teams t on t.id = a.team_id
     where a.share_token = $1 and a.archived_at is null and t.status in ('live', 'season_closed')`,
    [token],
  );
  if (athlete) {
    await sys.query(
      `insert into share_links (token, team_id, athlete_id, visits) values ($1, $2, $3, 1)
       on conflict (token) do update set visits = share_links.visits + 1`,
      [token, athlete.team_id, athlete.id],
    );
    await setAthleteUnlock(athlete.id, athlete.share_token);
    remember();
    return NextResponse.redirect(new URL(`/t/${athlete.team_slug}/${athlete.slug}`, url));
  }
  return NextResponse.redirect(new URL('/link-expired', url));
}
