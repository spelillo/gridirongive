import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { cookieJar, freshDb } from '../support/db';
import { demoIds } from '../support/fixtures';
import type { Driver } from '@/lib/db';
import { attemptUnlock, hasTeamUnlock } from '@/lib/access';
import { codeHash } from '@/lib/crypto';
import { DEMO } from '@/lib/db/demo-seed';

let db: Driver;
let ids: Awaited<ReturnType<typeof demoIds>>;
let keySeq = 0;
let key: string;

beforeAll(async () => {
  db = await freshDb();
  ids = await demoIds(db);
});
beforeEach(() => {
  cookieJar.clear();
  key = `ip-key-${++keySeq}`;
});

const team = async () => (await db.query<{ id: string; code_version: number }>(`select id, code_version from teams where id = $1`, [ids.team]))[0];

describe('attemptUnlock', () => {
  it('accepts the right code and sets an unlock cookie', async () => {
    expect(await hasTeamUnlock(await team())).toBe(false);
    const r = await attemptUnlock(DEMO.teamCode, key);
    expect(r).toEqual({ ok: true, teamId: ids.team, slug: 'central-high-football' });
    expect(cookieJar.size).toBe(1);
    expect(await hasTeamUnlock(await team())).toBe(true);
    const [row] = await db.query<any>(`select team_id, success from unlock_attempts where key = $1`, [key]);
    expect(row).toEqual({ team_id: ids.team, success: true });
  });

  it('counts down remaining tries and locks after 5 failures in 10 minutes', async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await attemptUnlock('ZZZZZZ', key));
    expect(results.slice(0, 4)).toEqual([
      { ok: false, reason: 'wrong', remaining: 4 },
      { ok: false, reason: 'wrong', remaining: 3 },
      { ok: false, reason: 'wrong', remaining: 2 },
      { ok: false, reason: 'wrong', remaining: 1 },
    ]);
    expect(results[4]).toMatchObject({ ok: false, reason: 'locked' });
    const retry = (results[4] as { retryAfterSec: number }).retryAfterSec;
    expect(retry).toBeGreaterThan(590);
    expect(retry).toBeLessThanOrEqual(600);

    // Even the right code is refused while locked, and no cookie is set.
    expect(await attemptUnlock(DEMO.teamCode, key)).toMatchObject({ ok: false, reason: 'locked' });
    expect(cookieJar.size).toBe(0);
    // A different device is not affected.
    expect(await attemptUnlock(DEMO.teamCode, `${key}-other`)).toMatchObject({ ok: true });
  });

  it('ignores failures older than 10 minutes', async () => {
    await db.query(
      `insert into unlock_attempts (key, success, created_at) select $1, false, now() - interval '11 minutes' from generate_series(1, 5)`,
      [key],
    );
    expect(await attemptUnlock(DEMO.teamCode, key)).toMatchObject({ ok: true });
  });

  it('a lock ends ten minutes after the last failure', async () => {
    await db.query(
      `insert into unlock_attempts (key, success, created_at) select $1, false, now() - interval '9 minutes 50 seconds' from generate_series(1, 5)`,
      [key],
    );
    const r = await attemptUnlock(DEMO.teamCode, key);
    expect(r).toMatchObject({ ok: false, reason: 'locked' });
    expect((r as { retryAfterSec: number }).retryAfterSec).toBeLessThanOrEqual(10);
  });

  it('rejects a code for a different team than expected', async () => {
    expect(await attemptUnlock(DEMO.teamCode, key, ids.farragut)).toEqual({ ok: false, reason: 'wrong', remaining: 4 });
    const [row] = await db.query<any>(`select team_id, success from unlock_attempts where key = $1`, [key]);
    expect(row).toEqual({ team_id: ids.team, success: false });
    expect(await attemptUnlock(DEMO.teamCode, key, ids.team)).toMatchObject({ ok: true });
  });

  it("rejects a draft team's code", async () => {
    expect(await attemptUnlock('HC6HWK', key)).toMatchObject({ ok: false, reason: 'wrong' });
  });

  it('rejects an old code after it is rotated and invalidates old unlocks', async () => {
    expect(await attemptUnlock(DEMO.teamCode, key)).toMatchObject({ ok: true });
    const before = await team();
    expect(await hasTeamUnlock(before)).toBe(true);

    await db.query(`update teams set code_hash = $2, code_version = code_version + 1 where id = $1`, [ids.team, codeHash('NEW2CD')]);
    const after = await team();
    expect(await hasTeamUnlock(after)).toBe(false);
    expect(await attemptUnlock(DEMO.teamCode, key)).toEqual({ ok: false, reason: 'wrong', remaining: 4 });
    expect(await attemptUnlock('NEW2CD', key)).toMatchObject({ ok: true, teamId: ids.team });
    expect(await hasTeamUnlock(after)).toBe(true);

    await db.query(`update teams set code_hash = $2, code_version = code_version + 1 where id = $1`, [ids.team, codeHash(DEMO.teamCode)]);
  });

  it('a forged cookie does not unlock', async () => {
    const t = await team();
    cookieJar.set(`gg_t_${t.id.replace(/-/g, '').slice(0, 16)}`, `${t.id}:${t.code_version}.forged`);
    expect(await hasTeamUnlock(t)).toBe(false);
  });
});
