# Deploying

Smash Queue runs on **Vercel** with **Neon Postgres**. Both have free tiers that comfortably
cover one group playing once or twice a week.

---

## Why this pairing

Neon is serverless Postgres with a native Vercel integration. The app talks to it over HTTP
(`@neondatabase/serverless` + `drizzle-orm/neon-http`), which means no connection pool to
exhaust from short-lived serverless functions, and the same code path works in `next dev`, in
a Vercel function, and in a plain node script.

The trade-off is no interactive transactions over HTTP. Every write in `src/server/actions.ts`
is a self-contained statement, so this costs nothing today — but keep it in mind before adding
a multi-statement write that must be atomic. If you ever need one, `@neondatabase/serverless`
also exposes a WebSocket `Pool` that does support transactions.

**Put the functions in the same region as the database.** A page render makes roughly a dozen
round trips to Postgres. Same region, that's a few milliseconds each; across an ocean it's
forty. `vercel.json` pins functions to `fra1` because the Neon project lives in
`aws-eu-central-1`. If you move one, move the other.

---

## First deploy

### 1. Neon

Create a project (Frankfurt is a good pick for the Gulf), then apply the migrations:

```bash
export DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
npm run db:migrate
```

`db:migrate` is safe to run against a database at any stage. An empty one gets every
migration in order. A database created by an older `db:push` gets baselined — the ledger is
written as though the first migration had run, because the tables it would create are
already there — and everything after it applies normally. Running it twice does nothing.

### 2. Create the first community

```bash
GROUP_NAME="Abu Dhabi Smashers" \
OWNER_NAME="Your Name" \
OWNER_EMAIL="you@example.com" \
VENUE_NAME="Zayed Sports City, Hall 2" \
GROUP_LOCATION="Abu Dhabi, UAE" \
DEFAULT_FEE=40 COURT_COUNT=4 \
STAFF_PIN=<4 to 8 digits> \
npm run db:bootstrap
```

Every input, with its default:

| Variable | Default | |
| --- | --- | --- |
| `OWNER_EMAIL` | — | **Required.** How the first organizer signs in |
| `STAFF_PIN` | — | **Required.** 4 to 8 digits; it refuses anything shorter |
| `GROUP_NAME` | `Badminton Group` | |
| `OWNER_NAME` | `Organizer` | Also becomes your player record |
| `VENUE_NAME` | `Main Hall` | |
| `VENUE_ADDRESS` | none | Free text, shown on the session page |
| `GROUP_LOCATION` | `Abu Dhabi, UAE` | |
| `CURRENCY` | `AED` | Display only — no conversion anywhere |
| `DEFAULT_FEE` | `40` | Per player per session, overridable per session |
| `COURT_COUNT` | `4` | The venue's courts, overridable per session |
| `POINTS_TO` | `30` | Points a game is played to |

This creates the first community, its first venue and you as its organizer **and platform
admin**. Nothing else — no demo players, no fake match history. It refuses to run twice:
every community after the first is created from `/hq` by a platform admin, in the app.

`OWNER_EMAIL` is required and is how you sign in. Without it the group exists but nobody can
reach `/admin`, because the organizer screens take an account and an account is an email.

To add a second sign-in address later, or to give an existing player staff rights:

```bash
npm run db:grant-admin -- "Their Name" them@example.com                         # organizer
npm run db:grant-admin -- "Their Name" them@example.com coordinator
npm run db:grant-admin -- "Their Name" them@example.com organizer <slug>        # with >1 community
npm run db:grant-admin -- "Their Name" them@example.com platform                # platform admin
```

With more than one community on the deployment the script needs the community's slug and
refuses without it — granting "everywhere" would hand a new organizer every community's
roster and money. Usually you won't need the script at all: organizers appoint
co-organizers from **Members**, and platform admins appoint organizers from `/hq`.

Setting `PLATFORM_ADMINS` (comma-separated sign-in addresses) is the other way to make a
platform admin: those accounts are promoted on their next sign-in, the flag is written to
the database, and the variable can then be removed.

Run it twice with two addresses to give **one person** two ways in — a personal address and
a work one, say. It attaches them to the existing player rather than creating a second
record, which matters more than it sounds: games played, fairness, Elo and partner history
all hang off one user id, and nothing warns you when one person quietly becomes two.

`npm run db:seed` is the opposite: thirty invented players and a hundred and fifty fake
matches, for local development. **Never point it at production.**

### 3. Vercel

Set `CRON_SECRET` (any long random string, e.g. `openssl rand -hex 32`) on the project.
`vercel.json` schedules `/api/cron/purge` daily; Vercel sends the secret with each call, and
the route erases communities whose owners deleted them more than 30 days ago. Without the
secret the route refuses every call and nothing is ever purged. The same secret guards
`/api/cron/reminders`, which at 10:00 UTC (2pm Gulf) pushes a reminder to everyone booked
into a session that day.

**Push notifications.** Generate a key pair once, on your own machine:

```bash
npx web-push generate-vapid-keys
```

Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (mark it sensitive) in Vercel
**before** the deploy that should use them: the public key is baked into the build. Keep the
pair for good; a new pair quietly breaks every phone that already subscribed, and each would
have to turn notifications off and on again. On iPhone, web push only works for the app
added to the home screen (iOS 16.4 or later), and the Notifications switch says so.


Import the GitHub repo and set these environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `QR_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | From resend.com — see below |
| `MAIL_FROM` | `Smash Queue <noreply@yourdomain>` |
| `APP_BASE_URL` | *leave unset* — see below |
| `NEXT_PUBLIC_TIME_ZONE` | `Asia/Dubai` |

**`RESEND_API_KEY` is what makes sign-in work.** Staff and organizers sign in with a code
and a link sent by email; without a mail provider neither can be sent. Create a Resend
account, add your domain, put the DKIM and SPF records it gives you into DNS, and wait for
it to verify. Then set `MAIL_FROM` to an address at that domain.

Until the key is set, the sign-in form says so plainly rather than claiming to have sent
something. Coordinators can still use the session PIN on the court board, but nobody can
reach the organizer screens — so set this before you need it.

> **Adding DNS records can knock out other records in the same zone.** If your app is on a
> subdomain of the domain you are verifying, check that its record still resolves after the
> mail setup, not just that mail works.

**`APP_BASE_URL` should normally be left unset.** QR codes are built from the origin
the request actually arrived on, so they are correct on production, on every preview
deployment, and on a custom domain the day you add one — without anybody remembering to
update a variable. Set it only behind a proxy that rewrites the `Host` header, and then get
it exactly right: a wrong value points every printed QR code at the wrong host, and it fails
silently.

**`NEXT_PUBLIC_TIME_ZONE` is the one that will bite you.** It decides the wall clock times
are rendered in. Timestamps are stored as instants so the data is always right, but a Vercel
function runs in UTC, and without this a 19:54 check-in displays as 15:54 to everyone — a
number plausible enough that nobody questions it.

---

## Schema changes after launch

Edit `src/db/schema.ts`, then:

```bash
npm run db:generate        # writes SQL to ./drizzle, review it
npm run db:migrate         # applies anything pending
```

**Read the generated SQL before running it.** Drizzle infers intent from a diff, and a
renamed column looks identical to a dropped one plus an added one. If the migration drops
something you wanted to keep, edit the file — it is ordinary SQL, and a data-moving
statement can be appended by hand. `0002_multi_email.sql` does exactly that: it creates a
table and then backfills it from the old column in the same migration, so a fresh clone and
a live database end up in the same state.

Migrations are committed, so the repo is the record of what production has had done to it.
`db:push` is still in package.json for throwaway local iteration. Do not point it at
production: it applies a diff with no ledger and no review, which is how a column
disappears without anyone deciding it should.

Before anything destructive, take a Neon branch first — a point-in-time copy you can
restore from, and it costs nothing:

```bash
# in the Neon console, or via the API
# branch: "before-<change>"
```

Run `db:migrate` against production **before** the code that needs the new columns ships.
Additive migrations are safe to apply ahead of a deploy — the running app simply ignores
what it does not know about — whereas deploying first leaves the app querying tables that
do not exist yet.

---

## Preview deployments

Vercel builds every branch. Give previews their own Neon branch rather than pointing them at
production data — the Neon Vercel integration can create one per preview automatically, which
also means a preview can run destructive migrations without any risk to a live session.

---

## Access, and what it protects

Two gates, defending different things.

| Screen | Needs | Why |
| --- | --- | --- |
| Court board, check-in, payments, QR | Session PIN **or** an account | A coordinator mid-session cannot be told to go and find their email. On one bar of signal in a sports hall, they will run the night on paper instead. |
| Members, venues, fees, settings, stats | An account, only | A PIN read out at a venue is not a credential for other people's money and history, and the second a group exists here that it does not own, it is guarding someone else's roster too. |

Sign-in emails carry a four-digit code and a clickable link on one token, so using either
burns the other. Codes take five wrong guesses before the token is destroyed, and requests
are capped per address per hour — spent tokens count, so failing does not refill the budget.
Only hashes are stored, for links and sessions alike.

The sign-in form answers identically whether or not an address belongs to anyone. Keep it
that way if you change the copy: the moment it says "no such account", it becomes a way to
test who plays here.

**Rotate the staff PIN when it leaks**, which it will — it gets read out at venues and
pasted into group chats. Organizer → Members. It no longer reaches anything that spans
sessions, so a leak costs you a stranger fiddling with tonight's court board, not your
member list.

---

## What to watch

**Polling.** Live screens call `router.refresh()` every five to six seconds, and each refresh
re-renders the server components — roughly a dozen queries. During a session with 24 phones
open that is a few hundred function invocations a minute. Well inside the free tiers, but it
is the first thing to optimise if cost or latency ever becomes a problem. The cheap wins, in
order: raise the interval on player screens (they do not need five seconds), add a light
version-stamp endpoint the clients poll instead of re-rendering, or move to push.

**Neon scale-to-zero.** The compute suspends when idle, so the first request after a quiet
week pays a cold start of a second or two. Harmless here: the coordinator opens the board
before anyone arrives.

**Backups.** Neon keeps history for the retention window on your plan and can restore to any
point inside it. Worth a look before the first session that actually matters.

---

## Local development

There is no SQLite fallback — one dialect, one schema, no drift. Point `DATABASE_URL` at a
**Neon dev branch** and work against that:

```bash
cp .env.example .env.local     # fill in DATABASE_URL
npm run db:migrate
npm run db:seed                # demo data, dev branch only
npm run dev
```

The seed creates an organizer you can sign in as, at `organizer@example.com` — override it
with `OWNER_EMAIL=you@example.com npm run db:seed`. With no `RESEND_API_KEY` set, the
development build prints the code and the link on the sign-in screen and to the server log
instead of emailing them, so a fresh clone can reach `/admin` before any mail provider
exists. The production build never does that; it says mail is unconfigured instead.
