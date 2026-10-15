# Architecture

## Overview

```
Browser ──> Next.js on Vercel ──┬──> Supabase Postgres (row level security)
  (React server components,     ├──> Supabase Auth (email link + 6-digit code)
   server actions, route        ├──> Supabase Storage (private buckets, served via /media)
   handlers)                    ├──> Stripe (destination charges, Connect Express)
                                └──> Resend (email)
Stripe webhooks ──> /api/stripe/webhook          Vercel Cron ──> /api/cron/daily
```

The browser never talks to the database, storage or Stripe's server API directly. Pages are server components; changes go through server actions (`src/lib/app/*-actions.ts`) and a few route handlers (`src/app/api`). The only browser-side Stripe code is the card form, which tokenizes the card with Stripe.js.

## Code layout

| Path | What lives there |
|---|---|
| `src/app/(public)` | Public site: home, search, team and player pages, checkout, receipts, invites, help and legal pages |
| `src/app/app` | Signed-in app: `/app` chooser, `athlete/[id]` (family), `manager/[teamId]` (coach), `manager/new` (setup wizard), `donor`, `account`, `notifications`, `admin` |
| `src/app/api` | Route handlers: checkout, Stripe webhook, uploads, CSV exports, QR codes, unlock, cron |
| `src/app/media/[kind]/[id]` | The only way stored files are served, after an access check |
| `src/lib/db` | Database drivers (postgres.js for live, PGlite for demo and tests), migrations runner, demo seed |
| `src/lib/domain` | Pure logic with unit tests: money and fees, gift allocation, buy list, names, codes, roster import, text checks, diff |
| `src/lib/payments` | Checkout, payment processing, refunds and disputes, the webhook handler |
| `src/lib/app` | Data loaders and server actions per area (team, athlete, money, settings, admin, account, donor) |
| `src/lib/notify` | In-app notifications, email preferences, digests, templates |
| `src/lib/jobs` | The daily job |
| `src/components` | UI kit (`ui/`), public site, app shell, manager and gear components |
| `supabase/migrations` | Schema, security policies, gear catalog and fixes, applied in filename order |
| `db/local-auth.sql` | Stand-in for Supabase's `auth` schema, used only by the embedded database |

## Data access: two doors

Every query goes through one of two functions in `src/lib/db`:

- **`asUser(userId, tx => ...)`** opens a transaction, switches to the `gg_user` role and sets the user id in `request.jwt.claims`, exactly as Supabase does for its own API. Row level security then decides what that person can read and change. Coach, staff, family and admin screens use this.
- **`sys`** runs as the database owner, so policies do not apply. It is for code that decides access itself and selects only what it needs: public pages behind the team code, the Stripe webhook, invites, the daily job, and writes the policies deliberately don't allow (moving money between needs, for example, which has no write policy for signed-in users). A development guard throws if `sys` is called inside `asUser`, so a request can't quietly escape its own policies.

The policies live in `supabase/migrations/20261014000002_security.sql`. The helper functions (`team_role`, `can_edit_team`, `athlete_role` and so on) are `security definer` so policies can look up membership without recursing into the membership tables' own policies. Two triggers, `athletes_guard` and `needs_guard`, stop families from changing fields only a coach may change (status, prices on approved items, privacy settings that belong to the guardian).

## Who is who

| Role | How they get access | What they can do |
|---|---|---|
| Donor | Nobody signs in to give | Search teams by name, unlock a roster with the team code, give, open receipts and photo links signed for them. Signing in later links past gifts by email. |
| Guardian | Invite link from the coach | Consent once, edit or approve the page, hide it, delete photos or the profile, see supporters |
| Athlete | Invite link (13 and older) | Edit their page and gear if the guardian allows it, send thank-you notes |
| Coach (head) | Creates the team | Everything for the team, including payouts and deleting the team |
| Staff | Invited by the coach | Everything except payouts, staff management and deleting the team |
| Viewer | Invited by the coach | Read only |
| Platform admin | `ADMIN_EMAILS` | Verification, suspensions, refunds, moderation, catalog, email log |

## Privacy model

- Teams are searchable **by name only**. There is no player search anywhere.
- A team's public page shows the team, its totals and team-level gear. The roster appears only after the visitor enters the **team code**, which sets a signed cookie for that team and code version. Changing the code bumps the version, which locks every device out and switches off old team links.
- A player's page needs the team code or that player's personal link (`/s/<token>`). Player pages are `noindex`, excluded from the sitemap, and their link previews never show the player's name or photo.
- Nothing about a player is shown until a guardian consents. Consent records the signer's typed name, the time, network address and policy version.
- Names default to first name and last initial. Contact details, hometown and birthdate are never shown.
- Codes are stored as a keyed hash. Wrong guesses are rate limited per network address (5 in 10 minutes), and the limit keys never store the raw address.

## Money model

1. **Pricing.** `quoteGift` in `src/lib/domain/money.ts` computes the platform fee ($1 + 1% by default) and Stripe's fee. When the donor covers fees, the charge is grossed up so exactly the gift reaches the team.
2. **Charging.** Checkout creates a PaymentIntent on the platform with `transfer_data.destination` and `on_behalf_of` set to the team's connected account and `application_fee_amount` set to the fees. The donation row is written first, as `pending`, with an idempotency key.
3. **Allocation.** When the payment succeeds (webhook, or immediately in demo mode), the gift is split across needs under a row lock by the pure function in `src/lib/domain/allocation.ts`: a need never takes more than it has left, gifts to a player in general fill their smallest remaining item first, and anything that can't land goes to the team fund. Allocation rows drive need totals through a trigger, so the totals can't drift from the ledger.
4. **Spending.** The coach records a purchase with a receipt, picks the funded items it covered, then marks them handed out. Donors are emailed at each step, including a signed link to the delivery photo.
5. **Moving money.** Money moves only through `fund_transfers` rows (a trigger keeps totals): into the team fund when an item is removed or overfunded, or out of the team fund to finish an item. Donors of the source item are told.
6. **Refunds and disputes** reverse allocations rather than deleting them, so the history stays intact.
7. **Season close** moves unspent earmarked money to the team fund, emails each donor a summary, and the next season starts from the team's gear templates with the fund carried over.

## Notifications

`notify()` writes a row to `notifications`. The row is the in-app copy (the bell) and the email queue. `flushNotifications()` claims queued rows with `for update skip locked` and sends them, honouring each person's preference per category (donations, approvals, updates): instant, daily digest or off. Receipts, refunds, sign-in links, invites and other required mail ignore preferences. The daily job sends digests and retries anything left queued.

## Demo mode

With no `DATABASE_URL`, `src/lib/db` starts PGlite (Postgres compiled to WebAssembly) in `.data/pglite`, applies `db/local-auth.sql` and every migration, and seeds four teams with a season of gifts, purchases, approvals and invites (`src/lib/db/demo-seed.ts`). Sign-in links and all other email go to `/dev/outbox`. Card payments are simulated by `/api/give/simulate`, which runs the same processing code as the Stripe webhook. Because demo mode uses the same migrations and policies as production, the demo exercises the real security model.

## Realtime

After a gift or purchase the server broadcasts on the team's Supabase Realtime channel and open money pages refresh. Demo mode has no broadcast, so those pages poll.

## Daily job

`src/lib/jobs/daily.ts`, run by Vercel Cron through `/api/cron/daily`. Each step is independent and safe to run twice: invite reminders on day 3 and day 7, nudges for unfinished pages (at most weekly), a Monday summary for coaches and staff, daily digests, an email retry, and cleanup of abandoned checkouts and old rate-limit rows.
