# Gridiron Give

Gear funding for high school and youth teams. A supporter finds a team by name, enters the team code, opens a player's page and pays for a specific item: a helmet, cleats, a set of pads. The coach sees every gift, buys the gear with the team's payout account, posts the receipt and marks it handed out. Donors get an email at each step.

Football comes first; hockey, lacrosse and baseball have their own gear catalogs.

## Try it in two minutes

```sh
npm install
npm run dev
```

Open http://localhost:3000/demo. With no configuration the app runs in **demo mode**: an embedded Postgres database with a seeded season, simulated card payments, and an on-site outbox at `/dev/outbox` instead of real email. The demo page signs you in as any seeded role with one tap:

| Account | What to try |
|---|---|
| Alex Smith, head coach | Overview, roster, approvals, buy list, payouts, share kit |
| Jordan Lee, assistant coach | The same team with staff permissions (no payouts) |
| Pat Smith, parent | Consent, profile approval, a player's gear and supporters |
| Jayden Smith, athlete | Editing his own page and sending thank-you notes |
| Riley Brooks, new coach | Picking up team setup halfway through |
| Platform admin | Verification, refunds, moderation, catalog, email log |

The public team is **Central High Varsity Football**, team code **KX7P2Q**. Card `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` is declined.

`npm run db:reset-demo` puts the demo data back to its starting state.

### Hosted demo

Every push to a branch other than `main` publishes the app with the sample data to a separate Vercel project, `gridirongive-demo` (the "Demo site" GitHub Actions job). It has no database or payment settings, so it can't reach the live Supabase or Stripe accounts, and the job refuses to deploy if one is ever added. Use it to click through a design on a phone before it ships. The live site deploys from `main` only.

### Demo art

The players, team photos and gear icons are drawn, not photographed, because the sample players are minors. `node scripts/demo-art.mjs` regenerates the player and team images in `public/demo` (one full-length figure per player, in team colors, with the jersey number). Gear icons are SVG components in `src/components/gear/GearArt.tsx`.

## Going live

Live mode needs a Supabase project, a Stripe account with Connect, and a Vercel project. [docs/SETUP.md](docs/SETUP.md) lists every environment variable, dashboard setting and the webhook URL, in order.

## What's in the box

- **Public site:** team search by name, team pages, code-locked rosters, player pages with a gear photo and pinned items, checkout with fee coverage, receipts, a thank-you page, reporting, help, terms, privacy and the guardian consent policy.
- **Families:** invite links, one-time guardian consent with a signed record, a profile and photo editor, gear requests, a supporter list and thank-you notes.
- **Coaches:** a setup wizard with school verification and Stripe onboarding, roster import from CSV or Excel, gear templates by position, an approvals queue with side-by-side changes, the buy list and purchase log, deliveries with photos, moving funds, payouts, a share kit with QR posters, season close and rollover.
- **Platform admin:** team verification, suspensions, refunds and disputes, moderation, the gear catalog and an email log.
- **Daily job:** invite reminders on day 3 and day 7, nudges for unfinished pages, a Monday summary for coaches, daily digests, and cleanup of abandoned checkouts.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server (demo mode unless `DATABASE_URL` is set) |
| `npm run check` | Typecheck, lint and the unit and integration tests |
| `npm run test:e2e` | Builds the app and runs the browser tests, with accessibility checks, at desktop and phone sizes |
| `npm run db:migrate` | Applies `supabase/migrations` to the live database |
| `npm run db:reset-demo` | Deletes the embedded demo database so it reseeds on next start |
| `node scripts/demo-art.mjs` | Redraws the sample player and team images in `public/demo` |

## Documentation

- [docs/SETUP.md](docs/SETUP.md): configuration and deployment, step by step
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit, the money model, data access rules
- [docs/SECURITY.md](docs/SECURITY.md): minors' privacy, consent, access control, payments and what still needs a lawyer
- [docs/TESTING.md](docs/TESTING.md): the test suites and how to run them against real Postgres
- [docs/DECISIONS.md](docs/DECISIONS.md): defaults chosen where the spec left a question open, and how to change them

## Stack

Next.js 16 (App Router, server actions) on Vercel, Supabase (Postgres with row level security, Auth, Storage, Realtime), Stripe Connect Express with destination charges, Resend for email, Tailwind CSS 4, Vitest and Playwright.
