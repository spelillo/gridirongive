import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb } from '../support/db';
import type { Driver } from '@/lib/db';

let db: Driver;
beforeAll(async () => {
  db = await freshDb();
});

describe('migrations and demo seed', () => {
  it('creates the demo team with live athletes and totals', async () => {
    const [t] = await db.query<any>(`select t.*, tt.* from teams t join team_totals tt on tt.team_id = t.id where slug = 'central-high-football'`);
    expect(t.status).toBe('live');
    expect(t.athletes_live).toBe(14);
    expect(t.raised_cents).toBeGreaterThan(0);
    expect(t.raised_cents).toBeLessThanOrEqual(t.goal_cents + t.team_fund_cents);
  });

  it('builds Jayden to match the spec examples', async () => {
    const [j] = await db.query<any>(`select a.id, at.* from athletes a join athlete_totals at on at.athlete_id = a.id where a.slug = 'jayden-s-12'`);
    const needs = await db.query<any>(`select name, price_cents, raised_cents, status from needs where athlete_id = $1 order by sort`, [j.id]);
    const helmet = needs.find((n) => n.name === 'Helmet');
    expect(helmet).toMatchObject({ price_cents: 30000, raised_cents: 14000, status: 'partially_funded' });
    expect(needs.find((n) => n.name === 'Mouthguard')?.status).toBe('funded');
  });
});
