# Setup and deployment

Gridiron Give runs with no configuration at all (demo mode). Going live takes four services: Supabase for the database, sign-in and file storage; Stripe for payments and payouts; Resend for email; Vercel for hosting and the daily job. This page walks through each one in the order you need them.

Every variable is also listed, with comments, in [`.env.example`](../.env.example).

## How the app picks its mode

| Setting | Effect |
|---|---|
| `DATABASE_URL` not set | **Demo mode.** Embedded Postgres (PGlite) with seeded data, one-tap demo sign-in at `/demo`, uploads on local disk. |
| `DATABASE_URL` set | **Live mode.** Supabase Postgres, Supabase Auth email sign-in, Supabase Storage. The Supabase keys and `APP_SECRET` are required. |
| Both Stripe keys set | Real Stripe payments (use test keys first). Without them, demo mode simulates card payments and live mode refuses to take gifts. |
| `RESEND_API_KEY` set | Email is sent through Resend. Without it, email is kept in the on-site outbox at `/dev/outbox` (demo) or the admin email log. |

## 1. Supabase

1. Create a project at supabase.com. Pick the region closest to your users.
2. **Apply the database schema.** In Project Settings > Database, copy the connection string for the **session pooler** (port 5432), then run:

   ```sh
   MIGRATION_DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' npm run db:migrate
   ```

   This applies every file in `supabase/migrations` once, in order, and records it in `public._migrations`. Running it again only applies new files. It also creates the four private storage buckets (`photos`, `team`, `receipts`, `verification`). Add `--dry-run` to see what would run.
3. **Copy the app's database URL.** From the same page, copy the **transaction pooler** string (port 6543). That is `DATABASE_URL`. The app disables prepared statements so it works with the transaction pooler.
4. **Copy the API keys.** Project Settings > API:
   - `NEXT_PUBLIC_SUPABASE_URL`: the project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the `anon` public key
   - `SUPABASE_SERVICE_ROLE_KEY`: the `service_role` secret key. Server only; never expose it to the browser.
5. **Set up email sign-in.** Authentication > URL Configuration:
   - Site URL: `https://<your-domain>`
   - Redirect URLs: add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for local testing against Supabase)
6. **Edit the Magic Link email template** (Authentication > Email Templates > Magic Link) so the link works on any device and the 6-digit code is included:

   ```html
   <h2>Sign in to Gridiron Give</h2>
   <p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in</a>. The link works for 1 hour.</p>
   <p>Or enter this code: <strong>{{ .Token }}</strong></p>
   <p>If you didn't ask for this, you can ignore it.</p>
   ```

   The app sends `RedirectTo` as `https://<your-domain>/auth/callback?next=...`, so appending the token hash keeps the person on the page they started from.
7. **Use your own email sender for sign-in** (Authentication > SMTP Settings). Supabase's built-in sender is rate limited to a few emails an hour. Point it at Resend's SMTP (`smtp.resend.com`, port 465, user `resend`, password = your Resend API key) once step 3 is done.
8. **Realtime** needs no setup. When the Supabase keys are present, money pages update live through Realtime broadcast; without them they poll.

Nothing in the browser reads tables directly. All data access goes through the server, which sets the signed-in user before each query so the row level security policies apply (see [ARCHITECTURE.md](ARCHITECTURE.md)).

## 2. Stripe

Gifts are **destination charges**: the donor pays the platform, Stripe moves the gift to the team's connected account in the same charge, and the platform fee stays with the platform as an application fee. Teams onboard with **Connect Express**.

1. Create a Stripe account and stay in **test mode** until you have run a few gifts end to end.
2. **Turn on Connect** (Connect > Get started). Choose "Platform or marketplace", Express accounts, and US as the country. Fill in the platform profile and branding (name "Gridiron Give", your support email and icon); Express onboarding shows them to coaches.
3. **API keys** (Developers > API keys):
   - `STRIPE_SECRET_KEY`: `sk_test_...`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: `pk_test_...`
4. **Webhooks.** Stripe sends platform events and connected-account events to separate destinations, each with its own signing secret. Create two destinations (Developers > Webhooks > Add destination), both with the URL `https://<your-domain>/api/stripe/webhook`:

   | Destination | Listen to | Events | Secret goes in |
   |---|---|---|---|
   | Payments | Your account | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` | `STRIPE_WEBHOOK_SECRET` |
   | Teams | Connected accounts | `account.updated`, `payout.created`, `payout.updated`, `payout.paid`, `payout.failed` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

   Each event is recorded by id before it is applied, so Stripe's retries never double count a gift.
5. **Local testing** with the Stripe CLI:

   ```sh
   stripe listen --forward-to localhost:3000/api/stripe/webhook --forward-connect-to localhost:3000/api/stripe/webhook
   ```

   Put the `whsec_...` it prints in `STRIPE_WEBHOOK_SECRET`; the CLI signs both kinds of event with it.
6. **Going live:** switch the dashboard to live mode, repeat steps 2 to 4 with live keys, and update the environment variables. Live and test mode have separate connected accounts, so each team connects payouts again.

### Fees

The platform fee is **$1.00 + 1% of the gift** by default, set in one place (`src/config/fees.ts`) and overridable with `PLATFORM_FEE_FIXED_CENTS` and `PLATFORM_FEE_BASIS_POINTS` (100 basis points is 1%). `STRIPE_FEE_FIXED_CENTS` and `STRIPE_FEE_BASIS_POINTS` should match your Stripe pricing (US standard is 30 cents + 2.9%); they are used to quote fees to donors who choose to cover them.

## 3. Email (Resend)

1. Create a Resend account, add your sending domain and add the DNS records it shows (SPF, DKIM).
2. Create an API key: `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on that domain, for example `Gridiron Give <notifications@yourdomain.org>`.
4. Optional: `SUPPORT_EMAIL`, shown on help, terms and receipts.

## 4. Vercel

1. Import the GitHub repository. The framework preset (Next.js) and default build command are correct.
2. **Environment variables** (Settings > Environment Variables), for Production and Preview:

   | Variable | Required in live mode | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_APP_URL` | Yes | `https://<your-domain>`, no trailing slash. Used in emails, Stripe return URLs and share links. |
   | `APP_SECRET` | Yes | `openssl rand -base64 32`. Signs receipt and photo links and the unlock cookies, and keys the team code hashes. **Changing it later invalidates every team code and signed link**, so set it once. |
   | `DATABASE_URL` | Yes | Supabase transaction pooler string |
   | `NEXT_PUBLIC_SUPABASE_URL` | Yes | |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | |
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Mark as sensitive |
   | `STRIPE_SECRET_KEY` | To take gifts | Mark as sensitive |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | To take gifts | |
   | `STRIPE_WEBHOOK_SECRET` | To take gifts | Payments destination |
   | `STRIPE_CONNECT_WEBHOOK_SECRET` | To take gifts | Teams destination |
   | `RESEND_API_KEY` | To send email | |
   | `EMAIL_FROM` | To send email | |
   | `CRON_SECRET` | Yes | Any long random string. Vercel sends it to the daily job. |
   | `ADMIN_EMAILS` | Yes | Comma-separated. These people get platform admin when they sign in. |
   | `SUPPORT_EMAIL` | No | |
   | `PLATFORM_FEE_FIXED_CENTS`, `PLATFORM_FEE_BASIS_POINTS` | No | Defaults: 100 and 100 |
   | `RECEIPTS_TAX_DEDUCTIBLE` | No | Leave `false` until there is a nonprofit or fiscal sponsor; see [DECISIONS.md](DECISIONS.md) |

3. **Daily job.** `vercel.json` schedules `GET /api/cron/daily` at 14:00 UTC. Vercel adds `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set; any other caller gets a 401. The job sends invite reminders (day 3 and day 7), nudges families with unfinished pages, sends coaches a Monday summary, sends daily digests, retries queued email and marks checkouts abandoned after 24 hours. Every step is safe to run twice. To run it by hand:

   ```sh
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily
   ```

4. **Domain.** Add your domain in Settings > Domains, then update `NEXT_PUBLIC_APP_URL`, the Supabase Site URL and redirect URL, and the Stripe webhook URLs to match.

### A public demo on Vercel

Deploying with no `DATABASE_URL` gives a working demo: the embedded database is created in `/tmp` on each server instance and seeded on first request (the migrations and seed ship with every route through `outputFileTracingIncludes`). Data resets whenever Vercel starts a new instance, and search engines are told not to index demo deployments.

## 5. First run checklist

1. Sign in with an address in `ADMIN_EMAILS` and open `/app/admin` to confirm admin access.
2. Start a team at `/app/manager/new` with a test coach email. A school email domain verifies automatically; anything else lands in Admin > Verification.
3. Connect payouts with Stripe's test onboarding (use the test values Stripe pre-fills).
4. Add a player, open the invite from the email, give consent, and publish the page.
5. Give $5 with card `4242 4242 4242 4242`. Check the receipt email, the coach's donation list and the Stripe dashboard (the payment on the platform, the transfer on the connected account).
6. Refund it from Admin > Donations and check that the player's total goes back down.

## Local development against Supabase

Copy `.env.example` to `.env.local`, fill in the Supabase values and run `npm run dev`. Use a separate Supabase project for development; the app and its tests never drop data, but you will create test teams and gifts.
