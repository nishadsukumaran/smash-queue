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

Create a project (Frankfurt is a good pick for the Gulf), then push the schema:

```bash
export DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
npm run db:push
```

### 2. Create the group

```bash
GROUP_NAME="Abu Dhabi Smashers" \
OWNER_NAME="Your Name" \
VENUE_NAME="Zayed Sports City, Hall 2" \
GROUP_LOCATION="Abu Dhabi, UAE" \
DEFAULT_FEE=40 COURT_COUNT=4 \
STAFF_PIN=<4 to 8 digits> \
npm run db:bootstrap
```

This creates the group, its first venue and you as organizer. Nothing else — no demo players,
no fake match history. It refuses to run twice.

`npm run db:seed` is the opposite: thirty invented players and a hundred and fifty fake
matches, for local development. **Never point it at production.**

### 3. Vercel

Import the GitHub repo and set these environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `QR_SECRET` | `openssl rand -base64 32` |
| `APP_BASE_URL` | *leave unset* — see below |
| `NEXT_PUBLIC_TIME_ZONE` | `Asia/Dubai` |

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

`npm run db:push` compares the schema to the database and applies the difference. It is fine
for additive changes. Before anything that drops or renames a column, take a Neon branch
first — that's a point-in-time copy you can restore from, and it costs nothing:

```bash
# in the Neon console, or via the API
# branch: "before-<change>"
```

For a change that needs care, generate a migration instead of pushing:

```bash
npx drizzle-kit generate   # writes SQL to ./drizzle
npx drizzle-kit migrate    # applies it
```

---

## Preview deployments

Vercel builds every branch. Give previews their own Neon branch rather than pointing them at
production data — the Neon Vercel integration can create one per preview automatically, which
also means a preview can run destructive migrations without any risk to a live session.

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
npm run db:push
npm run db:seed                # demo data, dev branch only
npm run dev
```
