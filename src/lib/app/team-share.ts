import 'server-only';
import { asUser, sys } from '@/lib/db';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';

/**
 * The team's code and its current team link (/s/<token>). The link unlocks
 * the roster like the code does; changing the code switches it off and makes
 * a new one (see changeTeamCode). Teams made before links existed get one here.
 */
export async function teamShare(userId: string, teamId: string): Promise<{ code: string | null; token: string | null; url: string | null; codeUrl: string | null; slug: string }> {
  const r = await asUser(userId, async (tx) => {
    const t = await tx.one<{ slug: string; edit: boolean }>(`select slug, can_edit_team(id) as edit from teams where id = $1`, [teamId]);
    if (!t?.edit) return t ? { slug: t.slug, code: null, token: null } : null;
    const s = await tx.one<{ code: string }>(`select code from team_secrets where team_id = $1`, [teamId]);
    const l = await tx.one<{ token: string }>(`select token from share_links where team_id = $1 and athlete_id is null and active order by created_at desc limit 1`, [teamId]);
    return { slug: t.slug, code: s?.code ?? null, token: l?.token ?? null };
  });
  if (!r) return { code: null, token: null, url: null, codeUrl: null, slug: '' };
  let token = r.token;
  if (r.code && !token) {
    token = `T${r.slug.replace(/-/g, '').slice(0, 10)}${r.code.toLowerCase()}${randomToken(4)}`;
    await sys.query(`insert into share_links (token, team_id) values ($1, $2)`, [token, teamId]);
  }
  return {
    code: r.code,
    token,
    url: token ? `${env.appUrl}/s/${token}` : null,
    codeUrl: r.code ? `${env.appUrl}/t/${r.slug}?code=${r.code}` : null,
    slug: r.slug,
  };
}
