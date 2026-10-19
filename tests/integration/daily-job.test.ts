import { describe, it, expect, beforeAll, vi } from 'vitest';
import { freshDb } from '../support/db';
import { demoIds } from '../support/fixtures';
import type { Driver } from '@/lib/db';

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { inviteReminders, profileNudges, weeklySummaries, housekeeping, runDaily } = await import('@/lib/jobs/daily');

const DAY = 86_400_000;
const inDays = (d: number) => new Date(Date.now() + d * DAY);

let db: Driver;
let ids: Awaited<ReturnType<typeof demoIds>>;

beforeAll(async () => {
  db = await freshDb();
  ids = await demoIds(db);
});

const count = async (sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) x`, params))[0].n;

describe('invite reminders', () => {
  let athleteId: string;
  beforeAll(async () => {
    // One athlete waiting on consent with an open invite; every other invite is marked used so only this one counts.
    const [row] = await db.query<{ athlete_id: string }>(
      `select i.athlete_id from invites i join athletes a on a.id = i.athlete_id
       where i.used_at is null and i.kind = 'athlete' and a.status = 'needs_consent' and a.archived_at is null limit 1`,
    );
    expect(row, 'demo seed has an athlete with an open invite').toBeTruthy();
    athleteId = row.athlete_id;
    await db.query(`update invites set used_at = now() where used_at is null and athlete_id <> $1`, [athleteId]);
    await db.query(`update invites set send_count = 1, created_at = now(), last_sent_at = now() where athlete_id = $1`, [athleteId]);
    await db.query(`update athletes set invite_status = 'sent' where id = $1`, [athleteId]);
  });

  it('sends nothing before day 3', async () => {
    expect(await inviteReminders(inDays(2))).toEqual({ athletes: 0, sent: 0 });
  });

  it('sends the first reminder on day 3 and only once', async () => {
    const first = await inviteReminders(inDays(3.1));
    expect(first.athletes).toBe(1);
    expect(first.sent).toBeGreaterThan(0);
    expect(await count(`select 1 from invites where athlete_id = $1 and used_at is null and send_count = 2`, [athleteId])).toBeGreaterThan(0);
    expect(await count(`select 1 from notifications where kind = 'invite_reminder'`)).toBe(first.sent);
    expect(await inviteReminders(inDays(3.2))).toEqual({ athletes: 0, sent: 0 });
  });

  it('sends the second reminder on day 7, then stops', async () => {
    const second = await inviteReminders(inDays(7.1));
    expect(second.athletes).toBe(1);
    expect(await inviteReminders(inDays(20))).toEqual({ athletes: 0, sent: 0 });
    expect(await count(`select 1 from activity_log where athlete_id = $1 and action = 'invite_reminder'`, [athleteId])).toBe(2);
  });

  it('skips athletes whose family already accepted', async () => {
    await db.query(`update invites set send_count = 1 where athlete_id = $1`, [athleteId]);
    await db.query(`update athletes set invite_status = 'accepted' where id = $1`, [athleteId]);
    expect(await inviteReminders(inDays(4))).toEqual({ athletes: 0, sent: 0 });
  });
});

describe('profile nudges', () => {
  it('nudges a family with an unfinished page once per week', async () => {
    await db.query(`update athletes set status = 'draft' where id = $1`, [ids.liam]);
    const consented = await count(`select 1 from athletes where id = $1 and consent_at is not null`, [ids.liam]);
    expect(consented, 'Liam has consent in the demo seed').toBe(1);
    expect((await profileNudges(inDays(2))).nudged).toBe(0);
    const first = await profileNudges(inDays(6));
    expect(first.nudged).toBeGreaterThanOrEqual(1);
    expect(await count(`select 1 from activity_log where athlete_id = $1 and action = 'profile_nudge'`, [ids.liam])).toBe(1);
    expect(await count(`select 1 from notifications where kind = 'profile_nudge'`)).toBeGreaterThan(0);
    // Same week: no second nudge.
    await profileNudges(inDays(6));
    expect(await count(`select 1 from activity_log where athlete_id = $1 and action = 'profile_nudge'`, [ids.liam])).toBe(1);
  });
});

describe('weekly summaries', () => {
  // The coming Monday, or today when today is Monday. Notifications are stamped
  // with the real clock, so the date must stay within the job's 6-day window.
  const nextMonday = () => {
    const d = new Date();
    while (d.getUTCDay() !== 1) d.setTime(d.getTime() + DAY);
    return d;
  };

  it('only runs on Mondays', async () => {
    const tuesday = new Date(nextMonday().getTime() + DAY);
    expect((await weeklySummaries(tuesday)).skipped).toBe('not Monday');
  });

  it('sends each coach and staff member one summary per week', async () => {
    const monday = nextMonday();
    const r = await weeklySummaries(monday);
    expect(r.teams).toBeGreaterThan(0);
    expect(await count(`select 1 from notifications where kind = 'weekly_summary' and user_id = $1 and link = $2`, [ids.coach, `/app/manager/${ids.team}`])).toBe(1);
    expect(await count(`select 1 from notifications where kind = 'weekly_summary' and user_id = $1 and link = $2`, [ids.staff, `/app/manager/${ids.team}`])).toBe(1);
    expect((await weeklySummaries(monday)).sent).toBe(0);
    const [n] = await db.query<{ body: string }>(`select body from notifications where kind = 'weekly_summary' and user_id = $1 limit 1`, [ids.coach]);
    expect(n.body).toMatch(/Available to spend: \$/);
    expect(n.body).not.toMatch(/—/);
  });
});

describe('housekeeping', () => {
  it('marks checkouts abandoned after a day and clears old rate-limit rows', async () => {
    await db.query(
      `insert into donations (team_id, season_id, target, donor_name, donor_email, gift_cents, cover_fees, platform_fee_cents, stripe_fee_cents, total_cents, net_cents, idempotency_key)
       values ($1, $2, 'team_fund', 'Test Donor', 'test.donor@example.com', 2500, false, 125, 103, 2500, 2272, 'daily-job-test')`,
      [ids.team, ids.season],
    );
    await db.query(`insert into unlock_attempts (key, success, created_at) values ('test', false, now() - interval '40 days')`);
    const today = await housekeeping(new Date());
    expect(today.abandoned).toBe(0);
    expect(today.unlockRows).toBeGreaterThanOrEqual(1);
    expect((await housekeeping(inDays(2))).abandoned).toBeGreaterThanOrEqual(1);
    const [d] = await db.query<{ status: string; failure_reason: string }>(`select status, failure_reason from donations where idempotency_key = 'daily-job-test'`);
    expect(d).toEqual({ status: 'failed', failure_reason: 'Checkout not completed' });
  });
});

describe('runDaily', () => {
  it('runs every step and reports each one', async () => {
    const r = await runDaily(inDays(30));
    expect(r.errors).toEqual({});
    expect(r.ok).toBe(true);
    expect(Object.keys(r.steps)).toEqual(['inviteReminders', 'profileNudges', 'weeklySummaries', 'housekeeping', 'digests', 'flush']);
    expect(await count(`select 1 from notifications where status = 'queued'`)).toBe(0);
  });
});

describe('cron route', () => {
  it('rejects a request without the secret when CRON_SECRET is set', async () => {
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'cron-test-secret');
    const { GET } = await import('@/app/api/cron/daily/route');
    expect((await GET(new Request('http://localhost/api/cron/daily'))).status).toBe(401);
    expect((await GET(new Request('http://localhost/api/cron/daily', { headers: { authorization: 'Bearer wrong-secret-xx' } }))).status).toBe(401);
    vi.unstubAllEnvs();
  });
});
