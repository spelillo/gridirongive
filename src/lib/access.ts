import 'server-only';
import { cookies } from 'next/headers';
import { sys } from '@/lib/db';
import { env } from '@/lib/env';
import { codeHash, sign, verifySigned } from '@/lib/crypto';
import { lockedUntil, UNLOCK_WINDOW_MS } from '@/lib/domain/codes';
import { getUser } from '@/lib/auth/session';

/**
 * Who can see a roster or an athlete page (rebuild-architecture 1.3):
 * - anyone who entered the current team code on this device,
 * - anyone who opened that athlete's personal link (that athlete only),
 * - the team's staff, and the athlete's own family.
 *
 * Unlocks are signed cookies tied to the team's code version, so changing the
 * code invalidates every device on its next request.
 */
const TEAM_COOKIE = (teamId: string) => `gg_t_${teamId.replace(/-/g, '').slice(0, 16)}`;
const ATHLETE_COOKIE = (athleteId: string) => `gg_a_${athleteId.replace(/-/g, '').slice(0, 16)}`;
const UNLOCK_DAYS = 200;

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.appUrl.startsWith('https'),
  path: '/',
  maxAge: UNLOCK_DAYS * 86_400,
});

export async function setTeamUnlock(teamId: string, codeVersion: number) {
  (await cookies()).set(TEAM_COOKIE(teamId), sign('unlock', `${teamId}:${codeVersion}`), cookieOpts());
}

export async function clearTeamUnlock(teamId: string) {
  (await cookies()).delete(TEAM_COOKIE(teamId));
}

export async function setAthleteUnlock(athleteId: string, shareToken: string) {
  (await cookies()).set(ATHLETE_COOKIE(athleteId), sign('athlete', `${athleteId}:${shareToken}`), cookieOpts());
}

export async function hasTeamUnlock(team: { id: string; code_version: number }): Promise<boolean> {
  const payload = verifySigned('unlock', (await cookies()).get(TEAM_COOKIE(team.id))?.value);
  return payload === `${team.id}:${team.code_version}`;
}

export async function hasAthleteUnlock(athlete: { id: string; share_token: string }): Promise<boolean> {
  const payload = verifySigned('athlete', (await cookies()).get(ATHLETE_COOKIE(athlete.id))?.value);
  return payload === `${athlete.id}:${athlete.share_token}`;
}

/** Signed-in team staff or family of an athlete on the team. */
export async function memberAccess(teamId: string): Promise<{ staff: boolean; family: boolean }> {
  const user = await getUser();
  if (!user) return { staff: false, family: false };
  const row = await sys.one<{ staff: boolean; family: boolean }>(
    `select
       exists (select 1 from team_members where team_id = $1 and user_id = $2 and status = 'active') or $3 as staff,
       exists (select 1 from athlete_access aa join athletes a on a.id = aa.athlete_id where a.team_id = $1 and aa.user_id = $2) as family`,
    [teamId, user.id, user.isAdmin],
  );
  return row ?? { staff: false, family: false };
}

export type RosterAccess = 'code' | 'staff' | 'family' | null;

export async function rosterAccess(team: { id: string; code_version: number }): Promise<RosterAccess> {
  if (await hasTeamUnlock(team)) return 'code';
  const m = await memberAccess(team.id);
  if (m.staff) return 'staff';
  if (m.family) return 'family';
  return null;
}

export async function canViewAthlete(team: { id: string; code_version: number }, athlete: { id: string; share_token: string }): Promise<boolean> {
  if (await rosterAccess(team)) return true;
  return hasAthleteUnlock(athlete);
}

// Code entry with rate limiting -------------------------------------------------

export type UnlockResult =
  | { ok: true; teamId: string; slug: string }
  | { ok: false; reason: 'wrong'; remaining: number }
  | { ok: false; reason: 'locked'; retryAfterSec: number };

export async function attemptUnlock(code: string, key: string, expectTeamId?: string): Promise<UnlockResult> {
  const now = new Date();
  const failures = await sys.query<{ created_at: Date }>(
    `select created_at from unlock_attempts where key = $1 and success = false and created_at > $2 order by created_at desc limit 10`,
    [key, new Date(now.getTime() - UNLOCK_WINDOW_MS)],
  );
  const until = lockedUntil(failures.map((f) => new Date(f.created_at)), now);
  if (until) return { ok: false, reason: 'locked', retryAfterSec: Math.ceil((until.getTime() - now.getTime()) / 1000) };

  const team = await sys.one<{ id: string; slug: string; code_version: number }>(
    `select id, slug, code_version from teams where code_hash = $1 and status in ('live', 'season_closed')`,
    [codeHash(code)],
  );
  const ok = Boolean(team && (!expectTeamId || team.id === expectTeamId));
  await sys.query(`insert into unlock_attempts (key, team_id, success) values ($1, $2, $3)`, [key, team?.id ?? expectTeamId ?? null, ok]);
  if (!ok) {
    const count = failures.length + 1;
    const lock = lockedUntil([now, ...failures.map((f) => new Date(f.created_at))], now);
    if (lock) return { ok: false, reason: 'locked', retryAfterSec: Math.ceil((lock.getTime() - now.getTime()) / 1000) };
    return { ok: false, reason: 'wrong', remaining: Math.max(5 - count, 0) };
  }
  await setTeamUnlock(team!.id, team!.code_version);
  return { ok: true, teamId: team!.id, slug: team!.slug };
}
