import 'server-only';
import type { Driver } from '@/lib/db';
import { codeHash, sha256 } from '@/lib/crypto';
import { quoteGift } from '@/lib/domain/money';
import { athleteSlug, positionGroup } from '@/lib/domain/names';

/**
 * Demo data: one fully built team (Central High Varsity Football) plus a
 * handful of other teams so search and "Teams near you" have something to
 * show. Every person here is fictional and every email is @example.com.
 * See /demo for one-click sign-in as each role.
 */
export const DEMO = {
  teamSlug: 'central-high-football',
  teamCode: 'KX7P2Q',
  accounts: [
    { email: 'coach.alex@example.com', name: 'Alex Smith', label: 'Head coach, Central High Football' },
    { email: 'jordan.lee@example.com', name: 'Jordan Lee', label: 'Assistant coach (staff), Central High Football' },
    { email: 'pat.smith@example.com', name: 'Pat Smith', label: "Jayden S.'s parent (guardian)" },
    { email: 'jayden.smith@example.com', name: 'Jayden Smith', label: 'Athlete, #12 QB' },
    { email: 'coach.riley@example.com', name: 'Riley Brooks', label: 'Coach setting up a new team (Hillcrest)' },
    { email: 'admin@example.com', name: 'Gridiron Give admin', label: 'Platform admin' },
  ],
  inviteTokens: {
    guardian: 'demo-invite-guardian-owen',
    athlete: 'demo-invite-athlete-owen',
  },
} as const;

// Small deterministic PRNG so the demo looks the same every time.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gear markers, as fractions of the player illustrations drawn by
// scripts/demo-art.mjs (helmet held at the right hip, gloved left hand).
const PINS: Record<string, [number, number]> = {
  Helmet: [0.71, 0.5],
  Mouthguard: [0.81, 0.56],
  'Chin Strap': [0.81, 0.56],
  'Shoulder Pads': [0.36, 0.33],
  'Rib Protector': [0.41, 0.45],
  'Practice Jersey': [0.57, 0.48],
  'Game Jersey': [0.57, 0.48],
  Gloves: [0.33, 0.56],
  'Lineman Gloves': [0.33, 0.56],
  Girdle: [0.44, 0.575],
  'Integrated Padded Pants': [0.57, 0.65],
  Cleats: [0.44, 0.9],
  'Kicking Cleats': [0.44, 0.9],
};

// Team colors and the illustrated covers in public/demo/teams.
const TEAM_COLORS: Record<string, string> = {
  'central-high-football': '#4c1d95',
  'westview-lacrosse': '#0f766e',
  'farragut-football': '#1e3a8a',
  'maryville-youth-football': '#b91c1c',
  'bearden-jv-football': '#1d4ed8',
  'lincoln-football': '#9f1239',
  'riverside-hockey': '#18181b',
  'eastside-baseball': '#166534',
  'hillcrest-football': '#0e7490',
};

const DONORS = [
  'Pat Morgan', 'Linda Carter', 'Rob Hayes', 'The Nguyen family', "Dave's Auto Body", 'Maria Lopez', 'Sam Patel', 'Grandma June',
  'Chris Walker', 'Tina Brooks', 'Knox Valley Rotary', 'Jamal Reed', 'Erin Foster', 'The Okafor family', 'Mike Chen', 'Uncle Ray',
];
const MESSAGES = [
  'Go Bobcats!', 'Have a great season.', 'Proud of you. Play hard and stay safe.', 'From one Bobcat to another.',
  'Good luck this fall!', 'Keep working hard.', null, null, null, null,
];

export async function seedDemo(db: Driver) {
  const r = rng(20261014);
  const q = (text: string, params: unknown[] = []) => db.query<any>(text, params);
  const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

  // People ---------------------------------------------------------------------
  const users: Record<string, string> = {};
  for (const a of DEMO.accounts) {
    const u = await one(`insert into auth.users (email) values ($1) returning id`, [a.email]);
    users[a.email] = u.id;
    await q(`insert into profiles (id, email, full_name, is_admin) values ($1, $2, $3, $4)`, [u.id, a.email, a.name, a.email === 'admin@example.com']);
  }

  const catalog = new Map<string, any>();
  for (const c of await q(`select * from gear_catalog`)) catalog.set(`${c.sport}:${c.name}`, c);
  const templates = await q(`select g.id, g.sport, g.name, g.positions from gear_templates g where g.team_id is null`);
  const templateItems = await q(`select ti.*, c.name, c.sizes from gear_template_items ti join gear_catalog c on c.id = ti.catalog_id order by ti.sort`);
  const itemsFor = (templateId: string) => templateItems.filter((t) => t.template_id === templateId);
  const templateFor = (sport: string, position: string | null) => {
    const list = templates.filter((t) => t.sport === sport);
    return list.find((t) => position && t.positions.includes(position)) ?? list.find((t) => t.name === 'Standard kit')!;
  };

  // Team factory ---------------------------------------------------------------
  async function createTeam(o: {
    org: string; city: string; state: string; zip: string; domain?: string;
    slug: string; name: string; sport: string; level: string; mascot: string; about: string; code: string;
    status: 'live' | 'draft'; coach: string; season: string; verified: boolean; connected: boolean; activityDaysAgo: number;
  }) {
    const org = await one(`insert into organizations (name, city, state, website, domain) values ($1, $2, $3, $4, $5) returning id`,
      [o.org, o.city, o.state, o.domain ? `https://www.${o.domain}` : null, o.domain ?? null]);
    const team = await one(
      `insert into teams (org_id, slug, name, sport, level, mascot, city, state, zip, about, status, verification_status, verification_method,
         verified_at, code_hash, payouts_status, stripe_account_id, created_by, published_at, last_activity_at, color, photo_path)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now() - make_interval(days => $20), $21, $22) returning id`,
      [org.id, o.slug, o.name, o.sport, o.level, o.mascot, o.city, o.state, o.zip, o.about, o.status,
        o.verified ? 'verified' : 'unverified', o.verified ? 'domain' : null, o.verified ? new Date(Date.now() - 40 * 86400000) : null,
        codeHash(o.code), o.connected ? 'connected' : 'not_connected', o.connected ? `acct_demo_${o.slug.replace(/-/g, '_')}` : null,
        users[o.coach] ?? null, o.status === 'live' ? new Date(Date.now() - 35 * 86400000) : null, o.activityDaysAgo,
        TEAM_COLORS[o.slug] ?? null, o.status === 'live' ? `demo/teams/${o.slug}.svg` : null],
    );
    await q(`insert into team_secrets (team_id, code) values ($1, $2)`, [team.id, o.code]);
    const season = await one(`insert into seasons (team_id, label, starts_on, ends_on, status) values ($1, $2, '2026-08-01', '2026-12-15', 'active') returning id`, [team.id, o.season]);
    // Copy the sport's templates onto the team so the coach can edit them.
    let defaultTemplate: string | null = null;
    for (const t of templates.filter((x) => x.sport === o.sport)) {
      const copy = await one(`insert into gear_templates (team_id, sport, name, positions) values ($1, $2, $3, $4) returning id`, [team.id, t.sport, t.name, t.positions]);
      for (const it of itemsFor(t.id)) {
        await q(`insert into gear_template_items (template_id, catalog_id, size, price_cents, sort) values ($1, $2, $3, $4, $5)`, [copy.id, it.catalog_id, it.size, it.price_cents, it.sort]);
      }
      if (t.name === 'Standard kit') defaultTemplate = copy.id;
    }
    await q(`update teams set current_season_id = $2, default_template_id = $3 where id = $1`, [team.id, season.id, defaultTemplate]);
    const fund = await one(`insert into needs (team_id, season_id, kind, name, sort) values ($1, $2, 'team_fund', 'Team fund', 0) returning id`, [team.id, season.id]);
    if (users[o.coach]) await q(`insert into team_members (team_id, user_id, email, role, title, status) values ($1, $2, $3, 'coach', 'Head coach', 'active')`, [team.id, users[o.coach], o.coach]);
    await q(`insert into share_links (token, team_id, visits) values ($1, $2, $3)`, [`T${o.slug.replace(/-/g, '').slice(0, 10)}${o.code.toLowerCase()}`, team.id, Math.floor(r() * 300)]);
    return { id: team.id as string, slug: o.slug, seasonId: season.id as string, fundId: fund.id as string };
  }

  async function addAthlete(team: { id: string; slug: string; seasonId: string }, sport: string, p: {
    first: string; last: string; jersey: string; position: string; grade: number; status: string; bio?: string;
    guardianEmail?: string; athleteEmail?: string; invite?: string; consentDaysAgo?: number; preferred?: string;
  }) {
    const slug = athleteSlug(p.first, p.last, p.jersey);
    const live = p.status === 'live';
    const consented = !['needs_consent'].includes(p.status);
    const bio = p.bio ?? (consented ? `I play ${p.position} and I've been playing since middle school. New gear would let me practice every day without borrowing from teammates.` : '');
    // Illustrations stand in for player photos: every demo player is a fictional minor.
    const photo = consented ? `demo/players/${team.slug}--${slug}.svg` : null;
    const a = await one(
      `insert into athletes (team_id, first_name, last_name, preferred_name, jersey, position, position_group, grade, slug, status, bio, photo_path,
         photo_alt, pub_preferred_name, pub_bio, pub_photo_path, published_at, share_token, invite_status, invite_sent_at, invite_accepted_at, consent_at, submitted_at, setup_step)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning id`,
      [team.id, p.first, p.last, p.preferred ?? null, p.jersey, p.position, positionGroup(p.position), p.grade, slug, p.status, bio, photo,
        photo ? `Illustration of #${p.jersey} in uniform` : null,
        live ? p.preferred ?? null : null, live ? bio : null, live ? photo : null, live ? new Date(Date.now() - 30 * 86400000) : null,
        `${slug.replace(/-/g, '')}${Math.floor(r() * 1e6).toString(36)}`.slice(0, 22),
        p.invite ?? (consented ? 'accepted' : 'not_sent'),
        p.invite && p.invite !== 'not_sent' || consented ? new Date(Date.now() - 38 * 86400000) : null,
        consented ? new Date(Date.now() - 36 * 86400000) : null,
        consented ? new Date(Date.now() - (p.consentDaysAgo ?? 36) * 86400000) : null,
        live ? new Date(Date.now() - 31 * 86400000) : ['awaiting_coach', 'changes_requested'].includes(p.status) ? new Date(Date.now() - 3 * 86400000) : null,
        consented ? 4 : 0],
    );
    await q(`insert into athlete_contacts (athlete_id, guardian_email, athlete_email) values ($1, $2, $3)`,
      [a.id, p.guardianEmail ?? `${p.first.toLowerCase()}.${p.last.toLowerCase()}.parent@example.com`, p.athleteEmail ?? null]);
    const tpl = templateFor(sport, p.position);
    const needIds: Record<string, string> = {};
    let i = 0;
    for (const it of itemsFor(tpl.id)) {
      i += 1;
      const size = it.sizes?.length ? it.sizes[Math.min(it.sizes.length - 1, 1 + Math.floor(r() * 2))] : null;
      const pin = photo ? PINS[it.name] : undefined;
      const n = await one(
        `insert into needs (team_id, season_id, athlete_id, kind, catalog_id, name, variant, price_cents, sort, pin_x, pin_y)
         values ($1, $2, $3, 'athlete', $4, $5, $6, $7, $8, $9, $10) returning id`,
        [team.id, team.seasonId, a.id, it.catalog_id, it.name, size ? `Adult ${size}` : null, it.price_cents, i, pin?.[0] ?? null, pin?.[1] ?? null],
      );
      needIds[it.name] = n.id;
    }
    return { id: a.id as string, needIds };
  }

  let donationSeq = 0;
  async function give(team: { id: string; seasonId: string }, athleteId: string | null, allocs: { needId: string; cents: number }[], o: { daysAgo: number; donor?: string; show?: boolean; message?: string | null; messageStatus?: string; cover?: boolean }) {
    donationSeq += 1;
    const gift = allocs.reduce((s, a) => s + a.cents, 0);
    const quote = quoteGift(gift, o.cover ?? true);
    const donor = o.donor ?? DONORS[donationSeq % DONORS.length];
    const email = `${donor.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`;
    const message = o.message === undefined ? MESSAGES[donationSeq % MESSAGES.length] : o.message;
    const d = await one(
      `insert into donations (team_id, season_id, athlete_id, target, status, donor_name, donor_email, show_name, message, message_status,
         gift_cents, cover_fees, platform_fee_cents, stripe_fee_cents, total_cents, net_cents, idempotency_key, payment_intent_id, charge_id,
         card_brand, card_last4, created_at, succeeded_at)
       values ($1,$2,$3,$4,'succeeded',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'visa','4242', now() - make_interval(days => $19), now() - make_interval(days => $19))
       returning id`,
      [team.id, team.seasonId, athleteId, allocs.length > 1 ? 'fund_rest' : athleteId ? 'need' : 'team_fund', donor, email, o.show ?? r() > 0.2,
        message, message ? o.messageStatus ?? 'approved' : 'none', quote.giftCents, quote.coverFees, quote.platformFeeCents, quote.stripeFeeCents,
        quote.totalCents, quote.netCents, `demo-${donationSeq}`, `pi_demo_${donationSeq}`, `ch_demo_${donationSeq}`, o.daysAgo],
    );
    for (const a of allocs) {
      await q(`insert into donation_lines (donation_id, need_id, athlete_id, requested_cents) values ($1, $2, $3, $4)`, [d.id, a.needId, athleteId, a.cents]);
      await q(`insert into allocations (donation_id, need_id, amount_cents, created_at) values ($1, $2, $3, now() - make_interval(days => $4))`, [d.id, a.needId, a.cents, o.daysAgo]);
    }
    return d.id as string;
  }

  /** Funds an athlete's needs up to a fraction of their goal using several gifts. */
  async function fundAthlete(team: { id: string; seasonId: string }, athleteId: string, fraction: number) {
    const needs = await q(`select id, price_cents, raised_cents from needs where athlete_id = $1 order by sort`, [athleteId]);
    const goal = needs.reduce((s: number, n: any) => s + n.price_cents, 0);
    let toRaise = Math.round((goal * fraction) / 500) * 500;
    for (const n of needs) {
      if (toRaise <= 0) break;
      let left = Math.min(n.price_cents - n.raised_cents, toRaise);
      while (left > 0) {
        const chunk = Math.min(left, [2500, 5000, 4000, 10000, 7500][Math.floor(r() * 5)]);
        await give(team, athleteId, [{ needId: n.id, cents: chunk }], { daysAgo: 1 + Math.floor(r() * 30) });
        left -= chunk;
        toRaise -= chunk;
      }
    }
  }

  // Central High Varsity Football --------------------------------------------------
  const central = await createTeam({
    org: 'Central High School', city: 'Knoxville', state: 'TN', zip: '37902', domain: 'centralhigh.example.com',
    slug: DEMO.teamSlug, name: 'Central High Varsity Football', sport: 'football', level: 'varsity', mascot: 'Bobcats',
    about: 'We are 46 players from every part of Knoxville. About half of our players borrow gear that is past its safe life, and helmets in particular need to be replaced or reconditioned every season. Every dollar here goes to a specific piece of equipment for a specific player, and we post the receipt when we buy it.',
    code: DEMO.teamCode, status: 'live', coach: 'coach.alex@example.com', season: 'Fall 2026', verified: true, connected: true, activityDaysAgo: 0,
  });
  await q(`insert into team_members (team_id, user_id, email, role, title, status) values ($1, $2, 'jordan.lee@example.com', 'staff', 'Assistant coach', 'active')`, [central.id, users['jordan.lee@example.com']]);
  await q(`insert into team_members (team_id, email, role, title, status) values ($1, 'ad.morris@example.com', 'viewer', 'Athletic director', 'invited')`, [central.id]);

  const roster = [
    ['Jayden', 'Smith', '12', 'QB', 12], ['Liam', 'Johnson', '22', 'RB', 11], ['Noah', 'Williams', '81', 'WR', 10], ['Mason', 'Brown', '88', 'TE', 12],
    ['Elijah', 'Jones', '74', 'OL', 11], ['Logan', 'Garcia', '95', 'DL', 10], ['Lucas', 'Miller', '44', 'LB', 12], ['Ethan', 'Davis', '3', 'CB', 11],
    ['Aiden', 'Rodriguez', '21', 'S', 10], ['James', 'Martinez', '17', 'K', 12], ['Benjamin', 'Hernandez', '19', 'P', 11], ['Alexander', 'Lopez', '7', 'QB', 10],
    ['Michael', 'Gonzalez', '28', 'RB', 12], ['Daniel', 'Wilson', '84', 'WR', 11], ['Matthew', 'Anderson', '86', 'TE', 10], ['Henry', 'Thomas', '66', 'OL', 12],
    ['Sebastian', 'Taylor', '91', 'DL', 11], ['Jack', 'Moore', '52', 'LB', 10], ['Owen', 'Jackson', '24', 'CB', 12], ['Wyatt', 'Martin', '31', 'S', 11],
    ['Carter', 'Lee', '39', 'K', 10],
  ] as const;
  const statuses = ['live', 'live', 'live', 'live', 'live', 'live', 'live', 'live', 'live', 'live', 'live', 'live', 'live', 'live',
    'awaiting_coach', 'awaiting_coach', 'changes_requested', 'draft', 'needs_consent', 'needs_consent', 'needs_consent'];
  const fractions = [0, 0.2, 0.5, 1, 0.1, 0.35, 0.62, 0, 0.45, 0.7, 0.15, 0.3, 0.9, 0.05];
  const athletes: { id: string; needIds: Record<string, string> }[] = [];
  for (let i = 0; i < roster.length; i++) {
    const [first, last, jersey, position, grade] = roster[i];
    const status = statuses[i];
    const a = await addAthlete(central, 'football', {
      first, last, jersey, position, grade, status,
      bio: i === 0
        ? "I've played quarterback since seventh grade. My helmet is a hand-me-down that's two years past its recertification date, so a new one is first on my list. I want to play in college and study engineering."
        : undefined,
      guardianEmail: i === 0 ? 'pat.smith@example.com' : undefined,
      athleteEmail: i === 0 ? 'jayden.smith@example.com' : i === 18 ? 'owen.jackson@example.com' : undefined,
      invite: i === 18 ? 'opened' : i === 19 ? 'sent' : i === 20 ? 'not_sent' : undefined,
    });
    athletes.push(a);
    if (status === 'live' && i > 0) await fundAthlete(central, a.id, fractions[i]);
  }

  // One live athlete has edited their bio since it was approved, so the
  // Approvals queue shows a "changes pending" diff against the live page.
  await q(
    `update athletes set bio = $2, submitted_at = now() - interval '1 day' where id = $1`,
    [athletes[3].id, "I play tight end and I run track in the spring. My cleats split at the toe last month, so I've been borrowing a pair a size too big. New gloves and cleats would make a real difference."],
  );

  // Jayden: hand-built so the page matches the spec's examples.
  const jayden = athletes[0];
  await q(`insert into athlete_access (athlete_id, user_id, role) values ($1, $2, 'guardian'), ($1, $3, 'athlete')`, [jayden.id, users['pat.smith@example.com'], users['jayden.smith@example.com']]);
  await q(`insert into consents (athlete_id, guardian_user_id, signed_name, ip, show_full_last_name, athlete_can_edit, signed_at)
           values ($1, $2, 'Pat Smith', '203.0.113.7', false, true, now() - interval '36 days')`, [jayden.id, users['pat.smith@example.com']]);
  const J = jayden.needIds;
  await give(central, jayden.id, [{ needId: J['Shoulder Pads'], cents: 20000 }], { daysAgo: 21, donor: "Dave's Auto Body", show: true, message: 'Go Bobcats! Proud to support #12.' });
  await give(central, jayden.id, [{ needId: J['Helmet'], cents: 10000 }], { daysAgo: 12, donor: 'Linda Carter', show: true, message: 'Stay safe out there, Jayden.' });
  await give(central, jayden.id, [{ needId: J['Helmet'], cents: 4000 }], { daysAgo: 4, show: false, message: null });
  await give(central, jayden.id, [{ needId: J['Rib Protector'], cents: 4500 }, { needId: J['Mouthguard'], cents: 1500 }], { daysAgo: 6, donor: 'Grandma June', show: true, message: 'Love you! Have a great senior year.' });
  await give(central, jayden.id, [{ needId: J['Cleats'], cents: 2500 }], { daysAgo: 1, donor: 'Sam Patel', show: true, message: 'Good luck this season. You have got this.', messageStatus: 'pending' });

  // Team needs: a sled, partially funded, and some team fund gifts.
  const sled = await one(
    `insert into needs (team_id, season_id, kind, catalog_id, name, variant, price_cents, sort) values ($1, $2, 'team', $3, 'Tackling Sled', 'Two-man sled', 90000, 1) returning id`,
    [central.id, central.seasonId, catalog.get('football:Tackling Sled').id],
  );
  await give(central, null, [{ needId: sled.id, cents: 25000 }], { daysAgo: 15, donor: 'Knox Valley Rotary', show: true, message: null });
  await give(central, null, [{ needId: central.fundId, cents: 5000 }], { daysAgo: 9, donor: 'Erin Foster', show: true, message: null });
  await give(central, null, [{ needId: central.fundId, cents: 10000 }], { daysAgo: 2, donor: 'Mike Chen', show: false, message: null });

  // A purchase covering funded needs, one of them delivered.
  const funded = await q(
    `select n.id, n.raised_cents from needs n where n.team_id = $1 and n.status = 'funded' and n.athlete_id is not null order by n.price_cents desc limit 3`,
    [central.id],
  );
  if (funded.length) {
    const total = funded.reduce((s: number, n: any) => s + n.raised_cents, 0);
    const p = await one(
      `insert into purchases (team_id, season_id, vendor, order_date, total_cents, receipt_path, note, created_by)
       values ($1, $2, 'BSN Sports', current_date - 8, $3, 'demo/receipt.svg', 'Ordered with the team discount.', $4) returning id`,
      [central.id, central.seasonId, total - 1200, users['coach.alex@example.com']],
    );
    for (const n of funded) {
      await q(`insert into purchase_needs (purchase_id, need_id, amount_cents) values ($1, $2, $3)`, [p.id, n.id, n.raised_cents]);
      await q(`update needs set status = 'purchased', purchase_id = $2, purchased_at = now() - interval '8 days' where id = $1`, [n.id, p.id]);
    }
    await q(`update needs set status = 'delivered', delivered_at = now() - interval '2 days' where id = $1`, [funded[0].id]);
  }

  // Pending work for the coach's queues.
  await q(`update athletes set review_note = 'Please use a photo where your face is visible, and add a sentence about what position you play.' where id = $1`, [athletes[16].id]);
  await q(`insert into needs (team_id, season_id, athlete_id, kind, name, variant, price_cents, sort, request_status, request_reason)
           values ($1, $2, $3, 'athlete', 'Knee Brace', 'Adult M, hinged', 8500, 20, 'pending', 'My doctor recommended a hinged brace after a sprain last spring.')`,
    [central.id, central.seasonId, athletes[6].id]);
  await q(`insert into thank_yous (team_id, athlete_id, need_id, body, status, recipients_count, created_by)
           values ($1, $2, $3, 'Thank you for the shoulder pads! They fit great and I wore them at practice all week.', 'pending', 1, $4)`,
    [central.id, jayden.id, J['Shoulder Pads'], users['jayden.smith@example.com']]);

  // Invites for Owen Jackson (needs consent) so the guardian flow can be tried from /demo.
  const owen = athletes[18];
  for (const [kind, token, email] of [['guardian', DEMO.inviteTokens.guardian, 'owen.jackson.parent@example.com'], ['athlete', DEMO.inviteTokens.athlete, 'owen.jackson@example.com']] as const) {
    await q(`insert into invites (token_hash, kind, team_id, athlete_id, email, role, expires_at, opened_at)
             values ($1, 'athlete', $2, $3, $4, $5, now() + interval '30 days', ${kind === 'guardian' ? 'now()' : 'null'})`,
      [sha256(token), central.id, owen.id, email, kind]);
  }
  for (const idx of [19]) {
    await q(`insert into invites (token_hash, kind, team_id, athlete_id, email, role, expires_at)
             values ($1, 'athlete', $2, $3, 'wyatt.martin.parent@example.com', 'guardian', now() + interval '30 days')`,
      [sha256(`demo-unused-${idx}`), central.id, athletes[idx].id]);
  }

  await q(`insert into notifications (user_id, kind, subject, body, link, in_app, send_email, status, created_at)
           select $1, 'new_gift', 'New gift: $25.00 toward Cleats for Jayden S.', 'Sam Patel gave $25.00 toward Cleats for Jayden S.', '/app/manager/' || $2 || '/donations', true, false, 'sent', now() - interval '1 day'`,
    [users['coach.alex@example.com'], central.id]);
  await q(`insert into activity_log (team_id, athlete_id, actor_id, action, detail, created_at) values
           ($1, $2, $3, 'consent_given', '{"by":"Pat Smith"}', now() - interval '36 days'),
           ($1, $2, $4, 'profile_submitted', '{}', now() - interval '33 days'),
           ($1, $2, $5, 'profile_approved', '{}', now() - interval '30 days')`,
    [central.id, jayden.id, users['pat.smith@example.com'], users['jayden.smith@example.com'], users['coach.alex@example.com']]);

  // Other teams for search ---------------------------------------------------------
  const others = [
    { org: 'Westview High School', city: 'Knoxville', state: 'TN', zip: '37919', slug: 'westview-lacrosse', name: 'Westview Varsity Lacrosse', sport: 'lacrosse', level: 'varsity', mascot: 'Wolves', code: 'WV4LAX', act: 3 },
    { org: 'Farragut High School', city: 'Farragut', state: 'TN', zip: '37934', slug: 'farragut-football', name: 'Farragut Varsity Football', sport: 'football', level: 'varsity', mascot: 'Admirals', code: 'FA9RMT', act: 1 },
    { org: 'Maryville Youth Football League', city: 'Maryville', state: 'TN', zip: '37801', slug: 'maryville-youth-football', name: 'Maryville Rebels 12U', sport: 'football', level: 'youth', mascot: 'Rebels', code: 'MY12UR', act: 6 },
    { org: 'Bearden High School', city: 'Knoxville', state: 'TN', zip: '37919', slug: 'bearden-jv-football', name: 'Bearden JV Football', sport: 'football', level: 'jv', mascot: 'Bulldogs', code: 'BJ7VFB', act: 9 },
    { org: 'Lincoln High School', city: 'Portland', state: 'OR', zip: '97205', slug: 'lincoln-football', name: 'Lincoln Cardinals Football', sport: 'football', level: 'varsity', mascot: 'Cardinals', code: 'LC5PDX', act: 2 },
    { org: 'Riverside High School', city: 'Columbus', state: 'OH', zip: '43215', slug: 'riverside-hockey', name: 'Riverside Pirates Hockey', sport: 'hockey', level: 'varsity', mascot: 'Pirates', code: 'RH8CBS', act: 4 },
    { org: 'Eastside High School', city: 'Austin', state: 'TX', zip: '78702', slug: 'eastside-baseball', name: 'Eastside Panthers Baseball', sport: 'baseball', level: 'varsity', mascot: 'Panthers', code: 'EB3ATX', act: 12 },
  ];
  const names = [['Marcus', 'Bell'], ['Tyler', 'Ward'], ['Andre', 'Price'], ['Caleb', 'Ross'], ['Diego', 'Flores'], ['Nate', 'Kim'], ['Evan', 'Cole'], ['Jalen', 'Hart']];
  for (const o of others) {
    const t = await createTeam({
      org: o.org, city: o.city, state: o.state, zip: o.zip, slug: o.slug, name: o.name, sport: o.sport, level: o.level, mascot: o.mascot,
      about: `Gear for the ${o.name}. Every gift is earmarked for a specific item and player, and we log each purchase with its receipt.`,
      code: o.code, status: 'live', coach: '', season: o.sport === 'baseball' ? 'Spring 2027' : 'Fall 2026', verified: true, connected: true, activityDaysAgo: o.act,
    });
    const count = 4 + Math.floor(r() * 4);
    for (let i = 0; i < count; i++) {
      const [first, last] = names[(i + o.act) % names.length];
      const pos = o.sport === 'football' ? ['QB', 'RB', 'OL', 'LB', 'WR', 'DL', 'CB', 'K'][i % 8] : '';
      const a = await addAthlete(t, o.sport, { first, last, jersey: String(10 + i * 7), position: pos, grade: o.level === 'youth' ? 6 : 9 + (i % 4), status: 'live' });
      await fundAthlete(t, a.id, [0.1, 0.5, 0.25, 0.8, 0, 0.4, 0.65, 0.2][(i + o.act) % 8]);
    }
  }

  // A team still being set up, for the setup wizard.
  await createTeam({
    org: 'Hillcrest High School', city: 'Chattanooga', state: 'TN', zip: '37411', slug: 'hillcrest-football', name: 'Hillcrest Varsity Football',
    sport: 'football', level: 'varsity', mascot: 'Hawks', about: '', code: 'HC6HWK', status: 'draft', coach: 'coach.riley@example.com',
    season: 'Fall 2026', verified: false, connected: false, activityDaysAgo: 0,
  });
}
