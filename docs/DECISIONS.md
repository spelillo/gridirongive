# Decisions and defaults

Where the spec left a question open, the build picked a default. Each one is listed here with how to change it.

## Open questions for the owner

| Question | Default in the build | How to change it |
|---|---|---|
| Platform fee | **$1.00 + 1% of each gift**, the same as the old prototype. Donors cover fees by default and can opt out. | `PLATFORM_FEE_FIXED_CENTS` and `PLATFORM_FEE_BASIS_POINTS`, or `src/config/fees.ts`. Checkout, receipts, help text and the "How fees work" panel all read the same values. |
| Nonprofit or fiscal sponsor | None yet, so **receipts never say a gift is tax deductible**. | Set `RECEIPTS_TAX_DEDUCTIBLE=true` once a sponsor is in place. Even then, the line only appears for teams whose organization is marked tax exempt with an EIN. |
| Payments | **Stripe in test mode** until live keys are set. Without keys, demo mode simulates payments and live mode refuses gifts. | Live keys in Vercel; see [SETUP.md](SETUP.md#2-stripe). |
| Who holds the money | The team's Stripe connected account (school, booster club or coach as custodian), earmarked per player and item. | Product decision; changing it would mean the platform buys gear itself. |

## Product defaults (from the architecture and UX spec)

- **Privacy:** teams are searchable by name only; rosters sit behind a team code that players and coaches share; share links carry the code; coaches can change the code; there is no player name search.
- **Consent:** a guardian consents once for every player under 18. Coach approval of pages is on by default and can be turned off per team.
- **Names:** first name and last initial unless the guardian turns on the full last name.
- **Accounts for players:** players 13 and older get their own invite; younger players are managed by their guardian.
- **Leftover money:** moves to the team fund with donors told; no automatic refunds. A donor can ask for a refund of moved money within 30 days of the notice by emailing support; refunds are issued by a platform admin, never by the coach.
- **Verification:** automatic when the coach's email domain matches the school's, otherwise an admin reviews a document.
- **Season close:** unspent earmarked money moves to the team fund, which carries into next season.

## Where the build differs from the spec, and why

- **The photo column is sticky on the player page, not the gear list.** The spec put the sticky column on the gear list (5/12). Gear items are pinned on the photo, and the gear list is the longer column, so keeping the photo in view while scrolling the list keeps each pin next to its item. On phones the layout is a single column with a sticky give bar, as specced.
- **"Near you" uses ZIP codes, not distance.** The home page and the "Nearest" sort in search rank teams without a geolocation database or asking for location. They take the visitor's ZIP (from Vercel's request headers, or typed in) and rank schools in the same ZIP first, then the same 3-digit prefix, then by how close the ZIP numbers are, falling back to the visitor's state when no ZIP is known. A typed ZIP is remembered in a cookie on the visitor's device; nothing about location is stored on the server.
- **Two Stripe webhook secrets.** Stripe signs platform events and connected-account events with different secrets, so the webhook accepts both (`STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`).
- **Delivery photos reach donors through signed links.** Stored files are private. Donors don't need an account, so the delivery email and their giving history use a link signed for that one item.
- **Migrations are applied by `npm run db:migrate`,** which records them in `public._migrations`, the same table the demo database uses, so one set of SQL files serves both.
- **Demo mode is a real database.** PGlite runs the same migrations and policies as production, so the demo and the tests exercise the real security model rather than mocks.

## Copy rules

Utility first and plain: no hero slogans, no em dashes, no decorative card grids, exact numbers ("$45 left", not "almost there"). Emails are text-forward with one button.
