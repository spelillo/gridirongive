# Security and privacy

Most people on Gridiron Give are minors. The design starts from that: a player is invisible until a guardian agrees, money never goes to a player, and everything about a player sits behind a code that only the team shares.

## Minors

| Protection | Where it is enforced |
|---|---|
| Nothing about a player is public until a guardian gives consent | Athlete status starts at `needs_consent`; public queries only return `live` athletes (`src/lib/queries/public.ts`), and storage only serves a published photo |
| Consent is a signed record: typed name, time, network address, policy version | `consents` table, `src/app/app/athlete/[id]/consent-actions.ts` |
| Guardians can hide the page, delete the photo, delete the profile, or withdraw consent at any time; withdrawing hides the page immediately | Family app, profile and privacy screen |
| Rosters need the team code; there is no player search | `canViewAthlete` in `src/lib/access.ts`, team search only matches team and school names |
| First name and last initial by default; contact details, hometown and birthdate are never shown | `athleteDisplayName`, public queries select only public columns |
| Player pages are not indexed and link previews never show the player | `robots` metadata, sitemap and Open Graph image routes |
| Players under 13 never get their own invite or account | `sendAthleteInvites` |
| Donor messages and thank-you notes can require coach approval, and text with links, phone numbers, email addresses or payment app names is held for a person to review even when approval is off | Team settings, `needsHumanReview` |
| Delivery photos can only be attached when every player in them has consent | `markDelivered` |
| Anyone can report a page; admins can hide it at once | `/report`, Admin > Moderation |

## Money

- Gifts settle into the **team's** Stripe connected account (a school, booster club or the coach as custodian). Players never receive money.
- Card details go straight from the browser to Stripe. The app never sees or stores card numbers.
- Every gift is earmarked to a need, and the coach must post a receipt for each purchase. Donors are told when their item is bought and handed out.
- Webhooks are verified against the signing secret of each Stripe destination and recorded by event id before being applied, so a replay or retry has no effect.
- Totals are maintained by database triggers from the allocation ledger, never written directly.
- Teams cannot take gifts until they are verified (school email domain or manual admin review) and have finished Stripe onboarding.

## Access control

- **Row level security** on every table, enforced in Postgres for every signed-in request (`asUser`). Supabase's own `anon` and `authenticated` roles have no table access; the browser has no direct database path.
- **System access** (`sys`) is limited to code that checks access itself, and cannot be nested inside a user transaction.
- **Server actions** check the caller's role on the team before doing anything, then run the write as that user so the policies apply again.
- **Files** live in private buckets and are only served by `/media/[kind]/[id]` after an access check. Thank-you and delivery photos also open from an HMAC-signed link sent to the donor. Uploads are checked by their actual bytes, not the file name.
- **Secrets**: `APP_SECRET` keys every signature and the team code hashes. The service role key and Stripe secret key are only read on the server.
- **Headers**: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and a restrictive `Permissions-Policy` on every response; files are served with a sandboxing Content Security Policy.
- **Rate limits** on team code guesses, sign-in emails and coach messages to families.

## Tests that cover this

`tests/integration/rls.test.ts`, `access.test.ts` and `guards.test.ts` check the policies and guards from each role's point of view (coach, staff, viewer, guardian, athlete, stranger, admin), including that nobody can make themselves an admin. They run against PGlite by default and against real Postgres 16 in CI. See [TESTING.md](TESTING.md).

## Before launch: needs a person, not code

- **Legal review of `/terms`, `/privacy` and `/guardian-consent`.** They are written plainly and match what the product does, but they have not been reviewed by counsel. COPPA applies to players under 13, and many states have their own student privacy rules.
- **Tax receipts.** Receipts do not say gifts are tax deductible. Turn `RECEIPTS_TAX_DEDUCTIBLE` on only once a nonprofit or fiscal sponsor is in place and a team's organization has an EIN on file (see [DECISIONS.md](DECISIONS.md)).
- **Stripe platform agreement.** Confirm with Stripe that the use case (fundraising for school teams, destination charges) is approved for your platform account before switching to live keys.
- **Rotate any old keys.** The old prototype folder on the Mac holds a file that looks like a live API key. It was not copied into this repository. Revoke it with whichever service issued it.

## Reporting a vulnerability

Email the address in `SUPPORT_EMAIL` with "Security" in the subject. Please don't open a public issue.
