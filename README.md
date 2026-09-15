# Smash Queue

**Book. Check in. Queue. Play.**

`v1.0.0-beta.1` &middot; built by [AIOps](https://aiops.ae) &middot; support: **hello@aiops.ae** A mobile-first badminton session manager for a real
WhatsApp badminton group: fair rotation across multiple courts, QR check-in, payment
tracking, and a session summary that tells you whether the night was actually fair.

Built to PRD v1.0. Next.js on Vercel, Postgres on Neon.

---

## Run it

Needs Node 22 or newer (tested on 22 and 26) and a Postgres connection string. Neon's free
tier is the path of least resistance, and a dev branch keeps your work off production data.

```bash
npm install
cp .env.example .env.local     # set DATABASE_URL
npm run setup                  # push the schema, then seed demo data
npm run dev                    # http://localhost:3000
                               # port busy? PORT=3210 npm run dev
```

`npm run setup` seeds **30 players, 6 sessions and ~160 played games** so every screen
has something real in it. For a real group use `npm run db:bootstrap` instead — see
`docs/DEPLOYING.md`.

| What | Where |
| --- | --- |
| Live session (mid-flight, 24 checked in) | `/s/TONITE` |
| Coordinator court board | `/s/TONITE/board` |
| Open for booking | `/s/NEXTSA` |
| Full, with a waitlist | `/s/MIDWK` |
| Organizer | `/admin` |
| **Staff PIN** | **1234** |

Start at `/who` and tap a name. There is no signup: players identify themselves once
per phone, and coordinator/organizer screens sit behind the group PIN.

`npm run db:reset` wipes and reseeds when the demo data gets messy.

**New to it?** `docs/USER-GUIDE.md` is the non-technical guide, written for the players and
the coordinator rather than for whoever is reading this file.

---

## The three people using it

**Player** opens the WhatsApp link, taps their name (or adds themselves if they're new),
taps *Join session*, gets waitlisted if it's full,
scans the QR at the door, and from then on their phone answers the only questions they
ever ask the coordinator: am I checked in, how many games have I had, when am I next,
which court, who with.

**Coordinator** lives on one screen: `/s/<code>/board`. Each open court shows the four
players the engine picked, already split into teams, with a line explaining why. Tap
*Start game*. Tap *Finish game*, enter a score or don't. That's the whole loop. Swapping
a player is two taps and is recorded silently for later analysis.

**Organizer** creates sessions, manages members and venues, sets the fee, and sees the
money: expected, collected, outstanding, minus court hire and shuttles.

---

## The queue engine

`src/lib/queue-engine.ts`. No database, no framework, pure functions — which is why it
can be tested properly and why a whole three-hour session simulates in milliseconds.

**Fairness is structural, not a weight.** Players are banded by games played. The engine
walks the bands from fewest games upward: every band it can take whole it takes whole,
and only the band where it runs out of slots becomes a real choice. Inside that band
everyone has played the same number of games, so waiting time, rest, pairing history and
team balance decide freely — without anyone jumping the queue.

That distinction is the whole thing. In the first draft, fairness was a 50% weight
competing with team balance, and the simulator showed games-per-player drifting to a
spread of four over a three-hour session. Making it a band walk instead pinned it at one.

Within a band, the ranking is the PRD's priority list:

| Priority | Weight | What it does |
| --- | --- | --- |
| Games played | 50 | banding above; also breaks ties |
| Waiting time | 30 | longest wait in the pool scores 1 |
| Rest | 15 | back-to-back games decay; a 4-minute breather after walking off court |
| Partner/opponent diversity | 5 | avoids the same four, weighted by recency |
| Team balance | per game type | splits the four into the evenest two pairs |

Weights live on the session row and are editable per session. Game types (`casual`,
`balanced`, `competitive`, `social`) only change how hard balance and mixing push.

**Coordinator preferences** — *put these two together*, *keep these two apart* — are
session-scoped and honoured as far as they can be without breaking fairness. If a
"keep apart" makes a game impossible to field, the engine relaxes it rather than leaving
a court empty, and flags that it did.

### Prove it yourself

```bash
npm test    # 38 unit tests: priorities, banding, constraints, Elo, QR signing
npm run sim # five session shapes x five runs, reports games-per-player spread
```

The simulator is the interesting one. Current output:

```
PASS  24 players, 4 courts, 3 hours     spread 1   fairness 91-94%   avg wait 6.9 min
PASS  28 players, 4 courts, 3 hours     spread 1   fairness 92-100%  avg wait 10.3 min
PASS  20 players, 3 courts, 2 hours     spread 2   fairness 80-100%  avg wait 8.7 min
PASS  13 players, 3 courts, 2 hours     spread 1   fairness 91%      avg wait 1.1 min
PASS  26 players, 6 arriving 30-70 late spread 3   fairness 63-79%   avg wait 7.1 min
```

The PRD's success metric is a spread of ≤ 1 game. Two scenarios carry a looser limit and
say why: a two-hour session can land one extra game on the final rotation, and somebody
walking in 70 minutes late genuinely cannot catch up — the engine closes the gap as far
as the clock allows and no further.

---

## What's in the box

Everything in PRD §31 (MVP scope):

- Player profiles and group membership, no passwords
- Self sign-up from the session link, with a duplicate-name guard, and an organizer switch
  to turn it off
- Session creation with shareable code, courts, capacity, fee, notes
- Booking, cancellation, capacity limit, waitlist with automatic promotion and renumbering
- Signed QR check-in (24-hour expiry, session-scoped) plus manual and walk-in check-in
- Multiple courts, live queue, games-played and waiting-time tracking
- Automatic recommendation with assisted and manual override, all modes tracked
- Start game, finish game, optional score, optional player confirmation
- Payment tracking (cash / transfer / waive) and a payment dashboard
- Session costs, revenue vs cost balance
- Session close with no-show marking, session summary, **fairness score**
- Player history, personal stats, doubles Elo leaderboard
- Silent coordinator override audit
- Installable PWA, no external CDN or font dependencies

Deliberately left for Phase 2: push/WhatsApp notifications, online payments, tournament
mode, recurring sessions, multiple groups.

---

## Architecture

```
src/
  db/         schema.ts (Drizzle), seed.ts, connections
  lib/        queue-engine.ts   the matchmaking engine (pure)
              fairness.ts       fairness score + doubles Elo
              sim.ts            in-memory session simulator
              qr.ts             HMAC-signed check-in tokens
              identity.ts       cookie identity + staff PIN
  server/     queries.ts        read models
              actions.ts        typed server actions
              form-actions.ts   FormData wrappers, so every form works without JS
  components/ shared UI
  app/        routes
```

Next.js 16 App Router, TypeScript strict, Tailwind v4, Drizzle over Neon Postgres (HTTP
driver, so no connection pool to exhaust from serverless functions). Every mutation is a
server action posted from a plain `<form>`, so the app keeps working on a phone with one
bar of signal in a sports hall. Live screens poll every 5-6 seconds.

---

## Hosting

`docs/DEPLOYING.md` covers the Vercel and Neon setup, the two environment variables that
fail quietly when wrong, how to handle schema changes after launch, and what to watch as
usage grows.

---

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | none | Neon Postgres connection string, required |
| `QR_SECRET` | dev fallback | **set this before sharing a real session** |
| `APP_BASE_URL` | derived from the request | optional override; QR codes normally follow the domain they are served from |
| `NEXT_PUBLIC_TIME_ZONE` | `Asia/Dubai` | wall clock times render in; a UTC server shows Gulf check-ins four hours early without it |
| `PORT` | `3000` | `PORT=3210 npm run dev` when 3000 is taken |

---

## Beta

This is `1.0.0-beta.1`. Everything in the MVP scope works and is tested, but it has not yet
run a real Saturday night with thirty people and patchy venue wifi, which is the only test
that really counts. Expect the queue weights to want tuning after the first few sessions.

Known limits, stated plainly:

- The staff PIN is the only access control. Fine for one trusted group, not fine for anything
  public. Proper logins are the first thing on the list after Supabase.
- Live screens poll every 5-6 seconds rather than pushing. You notice it if you stare at the
  board; you don't notice it while running a session.
- Score confirmation by players exists in the data model but is switched off by default.
- No interactive transactions over the Neon HTTP driver. Every write today is a single
  statement, so this costs nothing — but check before adding a multi-statement write that
  must be atomic.

Found something wrong, or want a weight changed? **hello@aiops.ae**

---

<sub>Smash Queue is built and maintained by [AIOps](https://aiops.ae) — vendor-independent
forward deployed engineering for the GCC. &copy; 2026 AIOps. All rights reserved.</sub>
