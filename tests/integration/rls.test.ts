import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb } from '../support/db';
import { demoIds, createUser, addMember } from '../support/fixtures';
import { asUser, type Driver } from '@/lib/db';

let db: Driver;
let ids: Awaited<ReturnType<typeof demoIds>>;
let viewer: string;
let stranger: string;
let draftAthlete: string;

beforeAll(async () => {
  db = await freshDb();
  ids = await demoIds(db);
  viewer = await createUser(db, 'ad.viewer@example.com', 'Dana Morris');
  await addMember(db, ids.team, viewer, 'ad.viewer@example.com', 'viewer');
  stranger = await createUser(db, 'random.person@example.com');
  await db.query(
    `insert into payouts (team_id, stripe_payout_id, amount_cents, status, arrival_date) values ($1, 'po_test_1', 50000, 'paid', current_date)`,
    [ids.team],
  );
  const [season] = await db.query<{ id: string }>(`select current_season_id as id from teams where id = $1`, [ids.hillcrest]);
  const [a] = await db.query<{ id: string }>(
    `insert into athletes (team_id, first_name, last_name, slug, share_token, status) values ($1, 'Hidden', 'Player', 'hidden-p-1', 'hiddenp1token', 'draft') returning id`,
    [ids.hillcrest],
  );
  draftAthlete = a.id;
  await db.query(`insert into athlete_contacts (athlete_id, guardian_email) values ($1, 'hidden.parent@example.com')`, [a.id]);
  await db.query(`insert into needs (team_id, season_id, athlete_id, kind, name, price_cents) values ($1, $2, $3, 'athlete', 'Helmet', 30000)`, [ids.hillcrest, season.id, a.id]);
});

const count = async (userId: string, sql: string, params: unknown[] = []) =>
  asUser(userId, async (tx) => (await tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params))[0].n);

describe('donations', () => {
  it('a coach sees every donation on their team', async () => {
    const all = (await db.query<{ n: number }>(`select count(*)::int as n from donations where team_id = $1`, [ids.team]))[0].n;
    expect(all).toBeGreaterThan(10);
    expect(await count(ids.coach, `select id from donations where team_id = $1`, [ids.team])).toBe(all);
    expect(await count(ids.staff, `select id from donations where team_id = $1`, [ids.team])).toBe(all);
    expect(await count(viewer, `select id from donations where team_id = $1`, [ids.team])).toBe(all);
  });

  it('a coach does not see donations for other teams', async () => {
    expect(await count(ids.coach, `select id from donations where team_id <> $1`, [ids.team])).toBe(0);
    expect(await count(ids.coach, `select id from allocations`)).toBe(
      (await db.query<{ n: number }>(`select count(*)::int as n from allocations al join donations d on d.id = al.donation_id where d.team_id = $1`, [ids.team]))[0].n,
    );
  });

  it('a guardian and an athlete cannot read donations, lines or allocations', async () => {
    for (const u of [ids.guardian, ids.athleteUser, stranger]) {
      expect(await count(u, `select id from donations`)).toBe(0);
      expect(await count(u, `select id from donation_lines`)).toBe(0);
      expect(await count(u, `select id from allocations`)).toBe(0);
    }
  });

  it('a donor signed in sees their own donation only', async () => {
    const [d] = await db.query<{ id: string }>(`select id from donations where team_id = $1 limit 1`, [ids.team]);
    await db.query(`update donations set donor_user_id = $2 where id = $1`, [d.id, stranger]);
    const rows = await asUser(stranger, (tx) => tx.query<{ id: string }>(`select id from donations`));
    expect(rows.map((r) => r.id)).toEqual([d.id]);
    await db.query(`update donations set donor_user_id = null where id = $1`, [d.id]);
  });

  it('nobody but staff can mark a donation', async () => {
    const rows = await asUser(ids.guardian, (tx) => tx.query(`update donations set message_status = 'approved' where team_id = $1 returning id`, [ids.team]));
    expect(rows).toEqual([]);
  });
});

describe('athletes and contacts', () => {
  it('a guardian sees only their own athlete and contacts', async () => {
    const athletes = await asUser(ids.guardian, (tx) => tx.query<{ id: string }>(`select id from athletes`));
    expect(athletes.map((a) => a.id)).toEqual([ids.jayden]);
    const contacts = await asUser(ids.guardian, (tx) => tx.query<{ athlete_id: string; guardian_email: string }>(`select athlete_id, guardian_email from athlete_contacts`));
    expect(contacts).toEqual([{ athlete_id: ids.jayden, guardian_email: 'pat.smith@example.com' }]);
    expect(await count(ids.guardian, `select 1 from athlete_contacts where athlete_id = $1`, [ids.liam])).toBe(0);
  });

  it('an athlete sees their own row but not contact details', async () => {
    expect(await count(ids.athleteUser, `select id from athletes`)).toBe(1);
    expect(await count(ids.athleteUser, `select athlete_id from athlete_contacts`)).toBe(0);
  });

  it('a guardian cannot update another athlete', async () => {
    const rows = await asUser(ids.guardian, (tx) => tx.query(`update athletes set bio = 'hacked' where id = $1 returning id`, [ids.liam]));
    expect(rows).toEqual([]);
    const [liam] = await db.query<{ bio: string }>(`select bio from athletes where id = $1`, [ids.liam]);
    expect(liam.bio).not.toBe('hacked');
  });

  it('athlete_contacts are hidden from viewers but shown to coach and staff', async () => {
    const total = (await db.query<{ n: number }>(`select count(*)::int as n from athlete_contacts c join athletes a on a.id = c.athlete_id where a.team_id = $1`, [ids.team]))[0].n;
    expect(await count(viewer, `select athlete_id from athlete_contacts`)).toBe(0);
    expect(await count(ids.coach, `select athlete_id from athlete_contacts`)).toBe(total);
    expect(await count(ids.staff, `select athlete_id from athlete_contacts`)).toBe(total);
    // The viewer can still read the roster itself.
    expect(await count(viewer, `select id from athletes where team_id = $1`, [ids.team])).toBe(21);
  });

  it("a random signed-in user cannot see a draft team's athletes, needs or contacts", async () => {
    expect(await count(stranger, `select id from athletes where team_id = $1`, [ids.hillcrest])).toBe(0);
    expect(await count(stranger, `select id from athletes`)).toBe(0);
    expect(await count(stranger, `select id from needs where team_id = $1`, [ids.hillcrest])).toBe(0);
    expect(await count(stranger, `select athlete_id from athlete_contacts`)).toBe(0);
    expect(await count(stranger, `select id from teams`)).toBe(0);
    // Nor can another team's coach.
    expect(await count(ids.coach, `select id from athletes where id = $1`, [draftAthlete])).toBe(0);
    // The draft team's own coach can.
    expect(await count(ids.riley, `select id from athletes where team_id = $1`, [ids.hillcrest])).toBe(1);
    expect(await count(ids.riley, `select athlete_id from athlete_contacts`)).toBe(1);
  });

  it('a stranger cannot insert an athlete on someone else’s team', async () => {
    await expect(
      asUser(stranger, (tx) => tx.query(`insert into athletes (team_id, first_name, last_name, slug, share_token) values ($1, 'X', 'Y', 'x-y', 'xytoken12345')`, [ids.team])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('an admin sees everything', async () => {
    const total = (await db.query<{ n: number }>(`select count(*)::int as n from athletes`))[0].n;
    expect(await count(ids.admin, `select id from athletes`)).toBe(total);
  });
});

describe('teams', () => {
  it('a viewer can read the team but cannot update it', async () => {
    const [t] = await asUser(viewer, (tx) => tx.query<{ name: string }>(`select name from teams where id = $1`, [ids.team]));
    expect(t.name).toBe('Central High Varsity Football');
    const rows = await asUser(viewer, (tx) => tx.query(`update teams set about = 'changed by viewer' where id = $1 returning id`, [ids.team]));
    expect(rows).toEqual([]);
    const [after] = await db.query<{ about: string }>(`select about from teams where id = $1`, [ids.team]);
    expect(after.about).not.toBe('changed by viewer');
  });

  it('a viewer cannot change roster rows or needs', async () => {
    expect(await asUser(viewer, (tx) => tx.query(`update athletes set jersey = '99' where team_id = $1 returning id`, [ids.team]))).toEqual([]);
    expect(await asUser(viewer, (tx) => tx.query(`update needs set name = 'x' where team_id = $1 returning id`, [ids.team]))).toEqual([]);
  });

  it('staff can update the team, and a coach of another team cannot', async () => {
    const rows = await asUser(ids.staff, (tx) => tx.query(`update teams set mascot = 'Bobcats' where id = $1 returning id`, [ids.team]));
    expect(rows).toHaveLength(1);
    expect(await asUser(ids.riley, (tx) => tx.query(`update teams set mascot = 'Hawks' where id = $1 returning id`, [ids.team]))).toEqual([]);
  });

  it('a guardian sees their athlete’s team but not the team secret', async () => {
    expect(await count(ids.guardian, `select id from teams`)).toBe(1);
    expect(await count(ids.guardian, `select team_id from team_secrets`)).toBe(0);
    expect(await count(viewer, `select team_id from team_secrets`)).toBe(1);
  });
});

describe('payouts', () => {
  it('only the coach can read payouts', async () => {
    expect(await count(ids.coach, `select id from payouts`)).toBe(1);
    expect(await count(ids.staff, `select id from payouts`)).toBe(0);
    expect(await count(viewer, `select id from payouts`)).toBe(0);
    expect(await count(ids.guardian, `select id from payouts`)).toBe(0);
  });
});

describe('notifications', () => {
  it('are private to each user', async () => {
    await db.query(`insert into notifications (user_id, kind, subject, body) values ($1, 'test', 'For Pat', 'x'), ($2, 'test', 'For Jordan', 'y')`, [ids.guardian, ids.staff]);
    const pat = await asUser(ids.guardian, (tx) => tx.query<{ subject: string; user_id: string }>(`select subject, user_id from notifications`));
    expect(pat.length).toBeGreaterThan(0);
    expect(pat.every((n) => n.user_id === ids.guardian)).toBe(true);
    expect(pat.map((n) => n.subject)).toContain('For Pat');
    const coach = await asUser(ids.coach, (tx) => tx.query<{ subject: string; user_id: string }>(`select subject, user_id from notifications`));
    expect(coach.every((n) => n.user_id === ids.coach)).toBe(true);
    expect(coach.map((n) => n.subject)).not.toContain('For Jordan');
  });

  it('a user can mark only their own notifications read', async () => {
    const theirs = await asUser(ids.coach, (tx) => tx.query(`update notifications set read_at = now() where user_id = $1 returning id`, [ids.staff]));
    expect(theirs).toEqual([]);
    const mine = await asUser(ids.staff, (tx) => tx.query(`update notifications set read_at = now() where user_id = $1 returning id`, [ids.staff]));
    expect(mine.length).toBeGreaterThan(0);
  });

  it('a user cannot insert notifications', async () => {
    await expect(asUser(ids.guardian, (tx) => tx.query(`insert into notifications (user_id, kind, subject, body) values ($1, 'x', 'x', 'x')`, [ids.coach]))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('system tables', () => {
  it('stripe_events and unlock_attempts are invisible to users', async () => {
    await db.query(`insert into stripe_events (id, type) values ('evt_rls', 'test')`);
    await db.query(`insert into unlock_attempts (key, success) values ('k', false)`);
    expect(await count(ids.admin, `select id from stripe_events`)).toBe(0);
    expect(await count(ids.coach, `select id from unlock_attempts`)).toBe(0);
  });
});
