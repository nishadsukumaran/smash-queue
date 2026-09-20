Smash Queue is a badminton session manager for real WhatsApp groups: players book from a link, scan a QR at the door, and their phone answers "when am I next?" so the coordinator stops being asked. Feature-complete against PRD §31, tested, and running in production at **[smashq.aiopsgroup.ai](https://smashq.aiopsgroup.ai)**.

## What it does

| | |
| :--- | :--- |
| **Fair rotation** | A queue engine that bands players by games played and walks the bands, so fairness is structural rather than a weight that team balance can outbid |
| **QR check-in** | HMAC-signed, session-scoped, 24-hour expiry, plus manual and walk-in |
| **Live court board** | Each open court shows the recommended four, already split into teams, with a plain-English line explaining why |
| **Money** | Cash / transfer / waive, expected vs collected vs outstanding, minus court hire and shuttles |
| **Close-out** | No-show marking, session summary, and a single fairness score for the night |
| **Stats** | Player history, personal stats, doubles Elo with a margin multiplier |

No passwords, no signup. Players identify themselves once per phone; coordinator and organizer screens sit behind a group PIN.

## Fairness, measured

The PRD's success metric is a games-played spread of ≤ 1. Current simulator output across five session shapes, five runs each:

| Scenario | Spread | Fairness | Avg wait |
| :--- | :---: | :---: | :---: |
| 24 players, 4 courts, 3 hours | 1 | 91–94% | 6.9 min |
| 28 players, 4 courts, 3 hours | 1 | 92–100% | 10.3 min |
| 20 players, 3 courts, 2 hours | 2 | 80–100% | 8.7 min |
| 13 players, 3 courts, 2 hours | 1 | 91% | 1.1 min |
| 26 players, 6 arriving 30–70 min late | 3 | 63–79% | 7.1 min |

The two looser limits are declared rather than hidden: a two-hour session can land one extra game on the final rotation, and somebody arriving 70 minutes late cannot catch up — the engine closes the gap as far as the clock allows and no further.

Reproduce with `npm test` (38 tests) and `npm run sim`.

## Since 1.0.0-beta.1

- Moved to its own domain, **smashq.aiopsgroup.ai**. QR codes needed no change: they are built from the request origin rather than from configuration, so they follow whichever domain serves the page
- The user guide now ships inside the app at `/guide`, generated from `docs/USER-GUIDE.md` at build time so the two cannot drift
- Open sourced under Apache 2.0, with a `NOTICE` file carrying the visible-attribution requirement
- Seeded demo sessions take their name from the weekday they actually land on
- Dropped the beta label: `RELEASE_CHANNEL` is now nullable, so a future prerelease sets one string and the label returns everywhere at once

## What v1.0.0 does not mean

It has not yet run thirty people on a Saturday night with patchy venue wifi, which is the only test that really counts. Expect the queue weights to want tuning after the first few real sessions — that is tuning, not repair. A weight change that widens the spread shows up in the simulator before it reaches a court.

Known limits are listed plainly in the README: the staff PIN is the only access control, live screens poll rather than push, and the Neon HTTP driver has no interactive transactions (which costs nothing today, since every write is a single statement).

## Install

```bash
npm install
cp .env.example .env.local     # set DATABASE_URL
npm run setup                  # schema + demo data
npm run dev
```

Needs Node 22+ and a Postgres connection string. `docs/DEPLOYING.md` covers Vercel and Neon.

---

Apache 2.0 — commercial use, forks and modification all fine. Keep the copyright notice and the **Built by AIOps** credit visible in the running app; see [`NOTICE`](https://github.com/nishadsukumaran/smash-queue/blob/main/NOTICE). Different terms are a conversation: **hello@aiops.ae**
