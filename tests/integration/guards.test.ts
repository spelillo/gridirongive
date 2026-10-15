import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { freshDb } from '../support/db';
import { demoIds, pgCode } from '../support/fixtures';
import { asUser, type Driver } from '@/lib/db';

let db: Driver;
let ids: Awaited<ReturnType<typeof demoIds>>;

beforeAll(async () => {
  db = await freshDb();
  ids = await demoIds(db);
});

const asGuardian = (sql: string, params: unknown[] = []) => asUser(ids.guardian, (tx) => tx.query<any>(sql, params));
const asAthlete = (sql: string, params: unknown[] = []) => asUser(ids.athleteUser, (tx) => tx.query<any>(sql, params));
const jayden = async () => (await db.query<any>(`select * from athletes where id = $1`, [ids.jayden]))[0];

describe('athletes_guard', () => {
  beforeEach(async () => {
    await db.query(
      `update athletes set status = 'live', hidden_reason = null, athlete_can_edit = true, show_full_last_name = false where id = $1`,
      [ids.jayden],
    );
    await db.query(`update teams set require_profile_approval = true where id = $1`, [ids.team]);
  });

  it('lets a guardian edit the working copy', async () => {
    const rows = await asGuardian(`update athletes set bio = 'Updated bio from Pat.', preferred_name = 'JJ' where id = $1 returning id`, [ids.jayden]);
    expect(rows).toHaveLength(1);
    expect((await jayden()).bio).toBe('Updated bio from Pat.');
  });

  it.each([
    ['first_name', `first_name = 'Jay'`],
    ['last_name', `last_name = 'Smyth'`],
    ['jersey', `jersey = '1'`],
    ['position', `position = 'WR'`],
    ['grade', `grade = 11`],
    ['slug', `slug = 'jay-s-1'`],
    ['share_token', `share_token = 'newtoken12345'`],
    ['under_13', `under_13 = true`],
    ['consent_at', `consent_at = now()`],
  ])('a guardian cannot change %s', async (_col, set) => {
    expect(await pgCode(asGuardian(`update athletes set ${set} where id = $1`, [ids.jayden]))).toBe('42501');
  });

  it('staff can change roster fields', async () => {
    const rows = await asUser(ids.staff, (tx) => tx.query(`update athletes set jersey = '12', position = 'QB' where id = $1 returning id`, [ids.jayden]));
    expect(rows).toHaveLength(1);
  });

  it('blocks an athlete when athlete_can_edit is false', async () => {
    await db.query(`update athletes set athlete_can_edit = false where id = $1`, [ids.jayden]);
    await expect(asAthlete(`update athletes set bio = 'mine' where id = $1`, [ids.jayden])).rejects.toThrow(/parent or guardian manages/);
    // The guardian still can.
    expect(await asGuardian(`update athletes set bio = 'guardian edit' where id = $1 returning id`, [ids.jayden])).toHaveLength(1);
  });

  it('lets an athlete with edit rights change their bio', async () => {
    expect(await asAthlete(`update athletes set bio = 'Athlete edit' where id = $1 returning id`, [ids.jayden])).toHaveLength(1);
  });

  it('an athlete cannot change show_full_last_name or athlete_can_edit', async () => {
    await expect(asAthlete(`update athletes set show_full_last_name = true where id = $1`, [ids.jayden])).rejects.toThrow(/Only a parent or guardian/);
    await expect(asAthlete(`update athletes set athlete_can_edit = false where id = $1`, [ids.jayden])).rejects.toThrow(/Only a parent or guardian/);
    // The guardian can.
    expect(await asGuardian(`update athletes set show_full_last_name = true where id = $1 returning id`, [ids.jayden])).toHaveLength(1);
  });

  it('an athlete cannot unhide their page, but a guardian can unhide a guardian hide', async () => {
    await db.query(`update athletes set status = 'hidden', hidden_reason = 'guardian' where id = $1`, [ids.jayden]);
    await expect(asAthlete(`update athletes set status = 'live' where id = $1`, [ids.jayden])).rejects.toThrow(/Only a parent or guardian/);
    expect(await asGuardian(`update athletes set status = 'live', hidden_reason = null where id = $1 returning id`, [ids.jayden])).toHaveLength(1);
  });

  it('a guardian cannot unhide a page the coach hid', async () => {
    await db.query(`update athletes set status = 'hidden', hidden_reason = 'manager' where id = $1`, [ids.jayden]);
    await expect(asGuardian(`update athletes set status = 'draft' where id = $1`, [ids.jayden])).rejects.toThrow(/Your coach hid this page/);
  });

  it('nobody but staff can leave needs_consent without consent', async () => {
    // Pat is not Owen's guardian, so RLS hides the row entirely.
    expect(await asGuardian(`update athletes set status = 'draft' where id = $1 returning id`, [ids.owen])).toEqual([]);
    // Give Pat guardian access to Owen (who still needs consent) through the system role.
    await db.query(`insert into athlete_access (athlete_id, user_id, role) values ($1, $2, 'guardian')`, [ids.owen, ids.guardian]);
    await expect(asGuardian(`update athletes set status = 'draft' where id = $1`, [ids.owen])).rejects.toThrow(/needs to give consent/);
    await expect(asGuardian(`update athletes set status = 'live' where id = $1`, [ids.owen])).rejects.toThrow(/needs to give consent/);
    // Editing the working copy while waiting for consent is fine.
    expect(await asGuardian(`update athletes set bio = 'Waiting on consent' where id = $1 returning id`, [ids.owen])).toHaveLength(1);
    await db.query(`delete from athlete_access where athlete_id = $1 and user_id = $2`, [ids.owen, ids.guardian]);
  });

  it('with approval required, a guardian cannot write pub_* columns or go live', async () => {
    for (const set of [`pub_bio = 'sneaky'`, `pub_photo_path = 'x.jpg'`, `pub_preferred_name = 'JJ'`]) {
      await expect(asGuardian(`update athletes set ${set} where id = $1`, [ids.jayden])).rejects.toThrow(/needs coach approval/);
    }
    await db.query(`update athletes set status = 'draft' where id = $1`, [ids.jayden]);
    await expect(asGuardian(`update athletes set status = 'live' where id = $1`, [ids.jayden])).rejects.toThrow(/needs coach approval/);
    // Submitting for review is allowed.
    expect(await asGuardian(`update athletes set status = 'awaiting_coach' where id = $1 returning id`, [ids.jayden])).toHaveLength(1);
  });

  it('a guardian can bring back a page they hid themselves even with approval on', async () => {
    await db.query(`update athletes set status = 'hidden', hidden_reason = 'guardian' where id = $1`, [ids.jayden]);
    expect(await asGuardian(`update athletes set status = 'live', hidden_reason = null where id = $1 returning id`, [ids.jayden])).toHaveLength(1);
  });

  it('without approval required, a guardian can publish directly', async () => {
    await db.query(`update teams set require_profile_approval = false where id = $1`, [ids.team]);
    expect(await asGuardian(`update athletes set pub_bio = bio where id = $1 returning id`, [ids.jayden])).toHaveLength(1);
  });

  it('the system role is never blocked', async () => {
    await db.query(`update athletes set first_name = 'Jayden', pub_bio = pub_bio where id = $1`, [ids.jayden]);
  });
});

describe('needs_guard', () => {
  const insertNeed = (user: string, cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return asUser(user, (tx) =>
      tx.query<any>(`insert into needs (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, Object.values(cols)),
    );
  };
  const base = () => ({ team_id: ids.team, season_id: ids.season, athlete_id: ids.jayden, kind: 'athlete', name: 'Arm sleeve', price_cents: 2500 });

  it('needs added by a guardian are forced to pending', async () => {
    const [n] = await insertNeed(ids.guardian, { ...base(), request_status: 'approved' });
    expect(n.request_status).toBe('pending');
    expect(n.purchase_id).toBeNull();
    const [m] = await insertNeed(ids.athleteUser, { ...base(), name: 'Visor' });
    expect(m.request_status).toBe('pending');
  });

  it('needs added by staff keep their status', async () => {
    const [n] = await insertNeed(ids.staff, { ...base(), name: 'Staff item' });
    expect(n.request_status).toBe('approved');
  });

  it('rejects a guardian insert for a different team or season', async () => {
    expect(await pgCode(insertNeed(ids.guardian, { ...base(), team_id: ids.farragut }))).toBe('42501');
    const [old] = await db.query<{ id: string }>(`insert into seasons (team_id, label, status) values ($1, 'Fall 2025', 'closed') returning id`, [ids.team]);
    expect(await pgCode(insertNeed(ids.guardian, { ...base(), season_id: old.id }))).toBe('42501');
  });

  it('rejects a guardian insert with money, a non-open status or a team kind', async () => {
    expect(await pgCode(insertNeed(ids.guardian, { ...base(), raised_cents: 100 }))).toBe('42501');
    expect(await pgCode(insertNeed(ids.guardian, { ...base(), status: 'purchased' }))).toBe('42501');
    expect(await pgCode(insertNeed(ids.guardian, { ...base(), athlete_id: null, kind: 'team' }))).toBe('42501');
  });

  it('rejects a guardian insert for another athlete', async () => {
    expect(await pgCode(insertNeed(ids.guardian, { ...base(), athlete_id: ids.liam }))).toBe('42501');
  });

  it('a guardian cannot change price, raised amount, request status or owner', async () => {
    const helmet = await ids.jaydenNeed('Helmet');
    for (const set of [`price_cents = 100`, `raised_cents = 30000`, `request_status = 'rejected'`, `athlete_id = '${ids.liam}'`, `team_id = '${ids.farragut}'`]) {
      expect(await pgCode(asGuardian(`update needs set ${set} where id = $1`, [helmet]))).toBe('42501');
    }
  });

  it('a guardian cannot mark a need purchased or delivered', async () => {
    const helmet = await ids.jaydenNeed('Helmet');
    expect(await pgCode(asGuardian(`update needs set status = 'purchased' where id = $1`, [helmet]))).toBe('42501');
    expect(await pgCode(asGuardian(`update needs set status = 'delivered' where id = $1`, [helmet]))).toBe('42501');
  });

  it('a guardian cannot remove a need that has money, but can remove an unfunded one', async () => {
    const helmet = await ids.jaydenNeed('Helmet');
    await expect(asGuardian(`update needs set status = 'removed' where id = $1`, [helmet])).rejects.toThrow(/Ask your coach/);
    const [n] = await db.query<{ id: string }>(
      `insert into needs (team_id, season_id, athlete_id, kind, name, price_cents) values ($1, $2, $3, 'athlete', 'Spare socks', 1000) returning id`,
      [ids.team, ids.season, ids.jayden],
    );
    expect(await asGuardian(`update needs set status = 'removed' where id = $1 returning id`, [n.id])).toHaveLength(1);
  });

  it('a guardian can change the description fields', async () => {
    const cleats = await ids.jaydenNeed('Cleats');
    const rows = await asGuardian(`update needs set variant = 'Adult 11', why_note = 'My old pair split.' where id = $1 returning variant`, [cleats]);
    expect(rows).toEqual([{ variant: 'Adult 11' }]);
  });

  it('staff can change price', async () => {
    const cleats = await ids.jaydenNeed('Cleats');
    const rows = await asUser(ids.staff, (tx) => tx.query(`update needs set price_cents = price_cents where id = $1 returning id`, [cleats]));
    expect(rows).toHaveLength(1);
  });
});
