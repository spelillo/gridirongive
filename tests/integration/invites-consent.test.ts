import { describe, it, expect, beforeAll, vi } from 'vitest';
import { freshDb } from '../support/db';
import { demoIds, createUser } from '../support/fixtures';
import type { Driver } from '@/lib/db';
import { DEMO } from '@/lib/db/demo-seed';
import { sha256 } from '@/lib/crypto';
import type { SessionUser } from '@/lib/auth/session';

// The signed-in person for server actions.
const session = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock('@/lib/auth/session', () => ({
  getUser: async () => session.user,
  requireUser: async () => {
    if (!session.user) throw new Error('REDIRECT:/sign-in');
    return session.user;
  },
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { acceptInvite, lookupInvite, coachTitle } = await import('@/lib/invites');
const { giveConsent } = await import('@/app/app/athlete/[id]/consent-actions');

let db: Driver;
let ids: Awaited<ReturnType<typeof demoIds>>;
let owenParent: string;

beforeAll(async () => {
  db = await freshDb();
  ids = await demoIds(db);
  owenParent = await createUser(db, 'owen.jackson.parent@example.com', 'Morgan Jackson');
});

const signIn = (id: string, email: string, fullName: string | null = null) => {
  session.user = { id, email, fullName, isAdmin: false };
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const access = (athleteId: string) => db.query<{ user_id: string; role: string }>(`select user_id, role from athlete_access where athlete_id = $1 order by created_at`, [athleteId]);

describe('lookupInvite', () => {
  it('describes a valid invite', async () => {
    const inv = await lookupInvite(DEMO.inviteTokens.guardian);
    expect(inv).toMatchObject({
      role: 'guardian',
      email: 'owen.jackson.parent@example.com',
      expired: false,
      used: false,
      athlete: { id: ids.owen, first: 'Owen', name: 'Owen J.', status: 'needs_consent', under13: false },
      team: { id: ids.team, name: 'Central High Varsity Football', season: 'Fall 2026' },
      coach: 'Coach Smith',
    });
  });

  it('returns null for unknown, empty or overlong tokens', async () => {
    expect(await lookupInvite('nope')).toBeNull();
    expect(await lookupInvite('')).toBeNull();
    expect(await lookupInvite('x'.repeat(101))).toBeNull();
  });

  it('coachTitle uses the last name', () => {
    expect(coachTitle('Alex Smith')).toBe('Coach Smith');
    expect(coachTitle('Your coach')).toBe('Your coach');
    expect(coachTitle('')).toBe('Your coach');
  });
});

describe('acceptInvite', () => {
  it('links a guardian and marks the invite used', async () => {
    const r = await acceptInvite(DEMO.inviteTokens.guardian, owenParent, 'guardian');
    expect(r).toEqual({ ok: true, athleteId: ids.owen });
    expect(await access(ids.owen)).toEqual([{ user_id: owenParent, role: 'guardian' }]);
    const [inv] = await db.query<any>(`select used_at, used_by from invites where token_hash = $1`, [sha256(DEMO.inviteTokens.guardian)]);
    expect(inv.used_by).toBe(owenParent);
    expect(inv.used_at).not.toBeNull();
    const [a] = await db.query<any>(`select invite_status, invite_accepted_at from athletes where id = $1`, [ids.owen]);
    expect(a.invite_status).toBe('accepted');
    expect(a.invite_accepted_at).not.toBeNull();
    const log = await db.query<any>(`select action, detail from activity_log where athlete_id = $1 and action = 'invite_accepted'`, [ids.owen]);
    expect(log).toEqual([{ action: 'invite_accepted', detail: { as: 'guardian' } }]);
  });

  it('the same person opening it again just lands on the page', async () => {
    expect(await acceptInvite(DEMO.inviteTokens.guardian, owenParent, 'guardian')).toEqual({ ok: true, athleteId: ids.owen });
    expect(await access(ids.owen)).toHaveLength(1);
  });

  it('a used invite fails for a different person in the same role', async () => {
    const other = await createUser(db, 'someone.else@example.com');
    const r = await acceptInvite(DEMO.inviteTokens.guardian, other, 'guardian');
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/already used/);
    expect((await access(ids.owen)).map((x) => x.user_id)).not.toContain(other);
  });

  it('an expired invite fails', async () => {
    await db.query(`update invites set expires_at = now() - interval '1 day' where token_hash = $1`, [sha256(DEMO.inviteTokens.athlete)]);
    const owenUser = await createUser(db, 'owen.jackson@example.com', 'Owen Jackson');
    expect(await acceptInvite(DEMO.inviteTokens.athlete, owenUser, 'athlete')).toEqual({ ok: false, error: 'This invite expired. Ask Coach Smith to resend it.' });
    expect((await access(ids.owen)).map((x) => x.user_id)).not.toContain(owenUser);
    await db.query(`update invites set expires_at = now() + interval '30 days' where token_hash = $1`, [sha256(DEMO.inviteTokens.athlete)]);
    expect(await acceptInvite(DEMO.inviteTokens.athlete, owenUser, 'athlete')).toEqual({ ok: true, athleteId: ids.owen });
  });

  it('an unknown token fails', async () => {
    expect(await acceptInvite('not-a-real-token', owenParent, 'guardian')).toEqual({ ok: false, error: "This invite link isn't valid." });
  });

  it('players under 13 cannot accept as the athlete', async () => {
    const wyatt = (await db.query<{ id: string }>(`select id from athletes where slug = 'wyatt-m-31' and team_id = $1`, [ids.team]))[0].id;
    await db.query(`update athletes set under_13 = true where id = $1`, [wyatt]);
    const kid = await createUser(db, 'wyatt.kid@example.com');
    expect(await acceptInvite('demo-unused-19', kid, 'athlete')).toEqual({ ok: false, error: 'A parent or guardian sets up pages for players under 13.' });
    // A guardian can still use it.
    const parent = await createUser(db, 'wyatt.martin.parent@example.com');
    expect(await acceptInvite('demo-unused-19', parent, 'guardian')).toEqual({ ok: true, athleteId: wyatt });
  });
});

describe('giveConsent', () => {
  it('only a guardian can give consent', async () => {
    const [owenUser] = await db.query<{ id: string }>(`select id from profiles where email = 'owen.jackson@example.com'`);
    signIn(owenUser.id, 'owen.jackson@example.com');
    expect(await giveConsent(ids.owen, {}, form({ signed_name: 'Owen Jackson', attest: 'on' }))).toEqual({ error: 'Only a parent or guardian can give consent.' });
    signIn(ids.guardian, 'pat.smith@example.com'); // Jayden's guardian, not Owen's
    expect(await giveConsent(ids.owen, {}, form({ signed_name: 'Pat Smith', attest: 'on' }))).toEqual({ error: 'Only a parent or guardian can give consent.' });
  });

  it('requires the attestation and a full name', async () => {
    signIn(owenParent, 'owen.jackson.parent@example.com', 'Morgan Jackson');
    const r = await giveConsent(ids.owen, {}, form({ signed_name: 'Morgan' }));
    expect(r.error).toBe('Check the form.');
    expect(Object.keys(r.fields ?? {}).sort()).toEqual(['attest', 'signed_name']);
    expect(r.fields?.attest).toBe("Confirm that you are Owen's parent or legal guardian.");
    expect((await db.query(`select id from consents where athlete_id = $1`, [ids.owen]))).toEqual([]);
  });

  it('records consent, moves the athlete to draft and redirects to setup', async () => {
    signIn(owenParent, 'owen.jackson.parent@example.com', 'Morgan Jackson');
    await expect(
      giveConsent(ids.owen, {}, form({ signed_name: '  Morgan   Jackson ', attest: 'on', athlete_can_edit: 'on', show_full_last_name: 'on' })),
    ).rejects.toThrow(`REDIRECT:/app/athlete/${ids.owen}/setup`);

    const [a] = await db.query<any>(`select status, consent_at, athlete_can_edit, show_full_last_name, hidden_reason from athletes where id = $1`, [ids.owen]);
    expect(a).toMatchObject({ status: 'draft', athlete_can_edit: true, show_full_last_name: true, hidden_reason: null });
    expect(a.consent_at).not.toBeNull();

    const consents = await db.query<any>(`select guardian_user_id, signed_name, ip, show_full_last_name, athlete_can_edit, policy_version, withdrawn_at from consents where athlete_id = $1`, [ids.owen]);
    expect(consents).toEqual([
      { guardian_user_id: owenParent, signed_name: 'Morgan Jackson', ip: '198.51.100.9', show_full_last_name: true, athlete_can_edit: true, policy_version: '2026-10', withdrawn_at: null },
    ]);
    const log = await db.query<any>(`select detail from activity_log where athlete_id = $1 and action = 'consent_given'`, [ids.owen]);
    expect(log).toEqual([{ detail: { by: 'Morgan Jackson' } }]);
    const staff = await db.query<any>(`select user_id from notifications where kind = 'consent' and subject = 'Consent given for Owen Jackson'`);
    expect(staff.map((s) => s.user_id).sort()).toEqual([ids.coach, ids.staff].sort());
    const mine = await db.query<any>(`select email from notifications where kind = 'consent' and user_id = $1`, [owenParent]);
    expect(mine).toEqual([{ email: 'owen.jackson.parent@example.com' }]);
  });

  it('giving consent again withdraws the old record and keeps the status', async () => {
    signIn(owenParent, 'owen.jackson.parent@example.com', 'Morgan Jackson');
    await db.query(`update athletes set status = 'awaiting_coach' where id = $1`, [ids.owen]);
    await expect(giveConsent(ids.owen, {}, form({ signed_name: 'Morgan Jackson', attest: 'on' }))).rejects.toThrow(/REDIRECT/);
    const consents = await db.query<any>(`select athlete_can_edit, withdrawn_at from consents where athlete_id = $1 order by signed_at, withdrawn_at nulls last`, [ids.owen]);
    expect(consents).toHaveLength(2);
    expect(consents.filter((c) => c.withdrawn_at === null)).toEqual([{ athlete_can_edit: false, withdrawn_at: null }]);
    const [a] = await db.query<any>(`select status, athlete_can_edit, show_full_last_name from athletes where id = $1`, [ids.owen]);
    expect(a).toEqual({ status: 'awaiting_coach', athlete_can_edit: false, show_full_last_name: false });
  });

  it('an under-13 athlete never gets edit rights', async () => {
    const wyatt = (await db.query<{ id: string }>(`select id from athletes where slug = 'wyatt-m-31' and team_id = $1`, [ids.team]))[0].id;
    const [parent] = await db.query<{ id: string }>(`select id from profiles where email = 'wyatt.martin.parent@example.com'`);
    signIn(parent.id, 'wyatt.martin.parent@example.com');
    await expect(giveConsent(wyatt, {}, form({ signed_name: 'Jamie Martin', attest: 'on', athlete_can_edit: 'on' }))).rejects.toThrow(/REDIRECT/);
    const [a] = await db.query<any>(`select status, athlete_can_edit from athletes where id = $1`, [wyatt]);
    expect(a).toEqual({ status: 'draft', athlete_can_edit: false });
  });

  it('asks for sign-in when nobody is signed in', async () => {
    session.user = null;
    await expect(giveConsent(ids.owen, {}, form({}))).rejects.toThrow('REDIRECT:/sign-in');
  });
});
