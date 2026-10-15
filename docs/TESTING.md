# Testing

```sh
npm run check      # typecheck, lint, unit and integration tests
npm run test:e2e   # browser tests at desktop and phone sizes, with accessibility checks
```

CI (`.github/workflows/ci.yml`) runs all of it on every pull request, plus the integration tests a second time against Postgres 16 and a dry run of the live migration script.

## Unit tests (`tests/unit`)

Pure logic, no database: fee quotes and rounding (`money`), how a gift is split across items (`allocation`), the buy list, team code generation and parsing, display names, roster import parsing and column mapping, text checks, gear photo pins and the approvals diff.

## Integration tests (`tests/integration`)

Each file gets a fresh database with every migration and the full demo seed, then calls the real server code: checkout, payment processing, webhooks, refunds and disputes (`payments`, `webhook-route`); invites and guardian consent (`invites-consent`); the row level security policies from every role's point of view (`rls`, `access`); the triggers that stop families changing coach-only fields (`guards`); the daily job (`daily-job`); and the seed itself (`seed`).

By default the database is PGlite in memory, so the suite needs nothing installed and runs in about 20 seconds. To run it against a real Postgres server, the same engine Supabase uses:

```sh
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
```

Each test file creates its own database named `gg_test_<random>` on that server. They are left in place for inspection; drop them with:

```sh
psql "$TEST_DATABASE_URL" -Atc "select 'drop database ' || datname || ';' from pg_database where datname like 'gg_test_%'" | psql "$TEST_DATABASE_URL"
```

Running against real Postgres matters: it caught a difference in how the live driver sends JSON parameters that PGlite hides.

## Browser tests (`tests/e2e`)

Playwright, Chromium, two projects: `desktop` (1280 x 900) and `mobile` (Pixel 7). `npm run test:e2e` builds the app, starts it in demo mode on port 3200 with its own database in `.data/e2e-pglite` (the server command wipes it before starting; deleting it from Playwright's global setup removed files under an already running server), and runs:

- **public**: team search never finds players, the roster stays locked until the right code, a player page without the code shows nothing, a gift from item to receipt (including the fee total and that the receipt makes no tax claim), and a declined card.
- **family**: a guardian opens the invite, signs in with the emailed code from the outbox, and gives consent.
- **coach**: the overview, roster search, the approvals side-by-side diff, every manager page loading, and the setup wizard resuming.
- **admin**: every admin page loads for an admin and stays closed to a coach.
- **a11y**: axe-core with the WCAG 2.0, 2.1 and 2.2 A and AA rules on every public page, the unlocked roster, a player page and the give dialog, the coach pages, and the family, account and admin pages. Any serious or critical violation fails the test. Each page is also checked for horizontal scrolling.

To run against a server you already have running (for example `npm run dev`), set `E2E_BASE_URL=http://localhost:3000`. Tests that change data (the gift, the consent) assume fresh demo data, so run `npm run db:reset-demo` first.

## Testing payments by hand

- Demo mode: card `4242 4242 4242 4242` succeeds and `4000 0000 0000 0002` is declined. Both go through the same processing code as real Stripe events.
- Stripe test mode: use Stripe's test cards and `stripe listen` as described in [SETUP.md](SETUP.md#2-stripe).
- The email each step sends is in `/dev/outbox` (demo) or Admin > Email log.
