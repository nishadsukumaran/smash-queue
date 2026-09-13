# Moving from SQLite to Supabase Postgres

The engine, queries, server actions and UI are all driver-agnostic. Migration is three
things: a new Drizzle dialect, a connection swap, and this DDL.

## 1. Packages

```bash
npm remove better-sqlite3 @types/better-sqlite3
npm install postgres
```

## 2. `drizzle.config.ts`

```ts
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

## 3. `src/db/index.ts`

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });
```

Drop `serverExternalPackages: ["better-sqlite3"]` from `next.config.ts`.

## 4. `src/db/schema.ts`

Swap the imports and the column helpers. The table shapes, names and relationships do not
change.

| SQLite | Postgres |
| --- | --- |
| `sqliteTable` | `pgTable` |
| `text("id").primaryKey()` | `text("id").primaryKey()` |
| `integer(x, { mode: "timestamp_ms" })` | `timestamp(x, { withTimezone: true })` |
| `integer(x, { mode: "boolean" })` | `boolean(x)` |
| `text(x, { mode: "json" })` | `jsonb(x)` |
| `real(x)` | `doublePrecision(x)` |
| `integer(x)` | `integer(x)` |

Two query details to fix afterwards, both in `src/server/actions.ts`:

- `sql\`max(0, ...)\`` becomes `GREATEST(0, ...)`.
- `sql\`lower(name) = lower(?)\`` works as-is, but `ilike` is nicer.

## 5. Schema

```sql
create table users (
  id            text primary key,
  name          text not null,
  phone         text,
  email         text,
  avatar_color  text not null default '#3DD9A4',
  rating        double precision not null default 1200,
  rating_games  integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null
);

create table groups (
  id           text primary key,
  name         text not null,
  owner_id     text not null references users(id),
  location     text,
  default_fee  double precision not null default 40,
  currency     text not null default 'AED',
  settings     jsonb not null,
  created_at   timestamptz not null
);

create table group_members (
  id        text primary key,
  group_id  text not null references groups(id),
  user_id   text not null references users(id),
  role      text not null default 'player',
  status    text not null default 'active',
  joined_at timestamptz not null
);
create index gm_group_idx on group_members(group_id);
create index gm_user_idx  on group_members(user_id);

create table venues (
  id          text primary key,
  group_id    text not null references groups(id),
  name        text not null,
  address     text,
  court_count integer not null default 4
);

create table sessions (
  id             text primary key,
  group_id       text not null references groups(id),
  venue_id       text references venues(id),
  code           text not null unique,
  name           text not null,
  date           text not null,
  start_time     text not null,
  end_time       text not null,
  court_count    integer not null default 4,
  capacity       integer not null default 24,
  fee            double precision not null default 40,
  currency       text not null default 'AED',
  notes          text,
  coordinator_id text references users(id),
  status         text not null default 'scheduled',
  game_type      text not null default 'casual',
  points_to      integer not null default 30,
  queue_mode     text not null default 'assisted',
  weights        jsonb not null,
  created_at     timestamptz not null,
  closed_at      timestamptz
);
create index sessions_group_idx on sessions(group_id);

create table bookings (
  id                text primary key,
  session_id        text not null references sessions(id),
  user_id           text not null references users(id),
  status            text not null default 'confirmed',
  waitlist_position integer,
  booked_at         timestamptz not null,
  cancelled_at      timestamptz
);
create unique index bookings_unique on bookings(session_id, user_id);

create table check_ins (
  id                text primary key,
  session_id        text not null references sessions(id),
  user_id           text not null references users(id),
  checked_in_at     timestamptz not null,
  method            text not null default 'qr',
  availability      text not null default 'available',
  left_at           timestamptz,
  last_finished_at  timestamptz,
  consecutive_games integer not null default 0
);
create unique index checkins_unique on check_ins(session_id, user_id);

create table matches (
  id          text primary key,
  session_id  text not null references sessions(id),
  court       integer not null,
  status      text not null default 'pending',
  mode        text not null default 'assisted',
  game_type   text not null default 'casual',
  created_at  timestamptz not null,
  started_at  timestamptz,
  finished_at timestamptz
);
create index matches_session_idx on matches(session_id);

create table match_players (
  id       text primary key,
  match_id text not null references matches(id),
  user_id  text not null references users(id),
  team     text not null
);
create index mp_match_idx on match_players(match_id);
create index mp_user_idx  on match_players(user_id);

create table match_scores (
  id           text primary key,
  match_id     text not null references matches(id),
  team_a_score integer not null,
  team_b_score integer not null,
  winner       text not null,
  entered_by   text references users(id),
  entered_at   timestamptz not null,
  confirmed    boolean not null default false
);

create table payments (
  id          text primary key,
  session_id  text not null references sessions(id),
  user_id     text not null references users(id),
  amount      double precision not null,
  status      text not null default 'unpaid',
  method      text,
  paid_at     timestamptz,
  recorded_by text references users(id)
);
create unique index payments_unique on payments(session_id, user_id);

create table session_costs (
  id         text primary key,
  session_id text not null references sessions(id),
  label      text not null,
  amount     double precision not null
);

create table preferences (
  id          text primary key,
  session_id  text not null references sessions(id),
  kind        text not null,
  user_a_id   text not null references users(id),
  user_b_id   text not null references users(id),
  created_at  timestamptz not null
);
create index prefs_session_idx on preferences(session_id);

create table overrides (
  id          text primary key,
  session_id  text not null references sessions(id),
  match_id    text references matches(id),
  recommended jsonb not null,
  final       jsonb not null,
  added_ids   jsonb not null,
  removed_ids jsonb not null,
  created_at  timestamptz not null
);
create index overrides_session_idx on overrides(session_id);

create table notifications (
  id         text primary key,
  session_id text references sessions(id),
  user_id    text not null references users(id),
  kind       text not null,
  body       text not null,
  read_at    timestamptz,
  created_at timestamptz not null
);
create index notif_user_idx on notifications(user_id);
```

## 6. Replace polling with Realtime

`src/components/LiveRefresh.tsx` currently calls `router.refresh()` on a timer. Once on
Supabase, subscribe to `matches`, `check_ins` and `bookings` for the session and refresh
on change instead. Nothing else needs to know.

## 7. Vercel

```
DATABASE_URL=<supabase pooled connection string>
QR_SECRET=<a long random string>
NEXT_PUBLIC_BASE_URL=https://<your-domain>
```

The QR secret matters: it is what stops last week's screenshot from checking somebody in.

## 8. Row Level Security

Once players have real accounts (magic link, phone OTP), the natural policy set is:

- `users`, `groups`, `venues`, `sessions` readable by group members.
- `bookings`, `check_ins`, `payments`: a player can read their own rows and insert their
  own booking; coordinators and organizers can write any row for sessions in their group.
- `matches`, `match_players`, `match_scores`: readable by group members, writable by
  coordinators (plus score entry by the four players in that match).
- `overrides` and `notifications`: writable by the server only.

Until then the staff PIN is the only gate, which is fine for one trusted WhatsApp group
and not fine for anything public.
