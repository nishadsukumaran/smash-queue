import {
  pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Schema for the Badminton Queue & Game Management Platform.
 *
 * Postgres, served by Neon over HTTP so it works the same in a Vercel function
 * and in a local script. Timestamps are timestamptz: the database stores the
 * instant, and src/lib/format.ts decides which wall clock to render it in.
 */

const id = () => text("id").primaryKey();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    phone: text("phone"),
    /** Lowercased on write. Nullable: most players never give one. */
    email: text("email"),
    avatarColor: text("avatar_color").notNull().default("#3DD9A4"),
    /** Doubles Elo. 1200 = a brand new player with no history. */
    rating: doublePrecision("rating").notNull().default(1200),
    ratingGames: integer("rating_games").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull(),
  },
  // Postgres allows many NULLs under a unique index, so players without an
  // email are unaffected. It is sign-in identity, so it has to resolve to one row.
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/* ----------------------------------------------------------------- groups */

export const groups = pgTable("groups", {
  id: id(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  location: text("location"),
  defaultFee: doublePrecision("default_fee").notNull().default(40),
  currency: text("currency").notNull().default("AED"),
  /** JSON: default queue weights, game type, points-to, staff PIN. */
  settings: jsonb("settings").$type<GroupSettings>().notNull(),
  createdAt: ts("created_at").notNull(),
});

export type GroupSettings = {
  staffPin: string;
  pointsTo: number;
  defaultGameType: GameType;
  weights: QueueWeights;
  /** Ask players to confirm a score entered by someone else. */
  requireScoreConfirmation: boolean;
  /**
   * Let someone who opens the session link add themselves to the group.
   * Undefined counts as allowed, so groups created before this existed keep
   * working. Turn it off and the organizer adds every member by hand.
   */
  allowSelfSignup?: boolean;
};

export type QueueWeights = {
  gamesFairness: number;
  waitingTime: number;
  rest: number;
  diversity: number;
  /** Only used by the balanced / competitive game types. */
  balance: number;
};

export type GameType = "casual" | "balanced" | "competitive" | "social";

export const groupMembers = pgTable(
  "group_members",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => groups.id),
    userId: text("user_id").notNull().references(() => users.id),
    role: text("role").$type<MemberRole>().notNull().default("player"),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    joinedAt: ts("joined_at").notNull(),
  },
  (t) => [index("gm_group_idx").on(t.groupId), index("gm_user_idx").on(t.userId)],
);

export type MemberRole = "player" | "coordinator" | "organizer";

/* ----------------------------------------------------------------- venues */

export const venues = pgTable("venues", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id),
  name: text("name").notNull(),
  address: text("address"),
  courtCount: integer("court_count").notNull().default(4),
});

/* --------------------------------------------------------------- sessions */

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => groups.id),
    venueId: text("venue_id").references(() => venues.id),
    /** Short human-shareable code used in /s/<code>. */
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    /** ISO date, e.g. 2026-09-19. */
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    courtCount: integer("court_count").notNull().default(4),
    capacity: integer("capacity").notNull().default(24),
    fee: doublePrecision("fee").notNull().default(40),
    currency: text("currency").notNull().default("AED"),
    notes: text("notes"),
    coordinatorId: text("coordinator_id").references(() => users.id),
    status: text("status").$type<SessionStatus>().notNull().default("scheduled"),
    gameType: text("game_type").$type<GameType>().notNull().default("casual"),
    pointsTo: integer("points_to").notNull().default(30),
    queueMode: text("queue_mode").$type<QueueMode>().notNull().default("assisted"),
    weights: jsonb("weights").$type<QueueWeights>().notNull(),
    createdAt: ts("created_at").notNull(),
    closedAt: ts("closed_at"),
  },
  (t) => [index("sessions_group_idx").on(t.groupId)],
);

export type SessionStatus = "scheduled" | "live" | "closed" | "cancelled";
export type QueueMode = "auto" | "assisted" | "manual";

/* --------------------------------------------------------------- bookings */

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    userId: text("user_id").notNull().references(() => users.id),
    status: text("status").$type<BookingStatus>().notNull().default("confirmed"),
    waitlistPosition: integer("waitlist_position"),
    bookedAt: ts("booked_at").notNull(),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [uniqueIndex("bookings_unique").on(t.sessionId, t.userId)],
);

export type BookingStatus = "confirmed" | "waitlisted" | "cancelled" | "no_show";

/* --------------------------------------------------------------- check-in */

export const checkIns = pgTable(
  "check_ins",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    userId: text("user_id").notNull().references(() => users.id),
    checkedInAt: ts("checked_in_at").notNull(),
    method: text("method").$type<"qr" | "manual" | "self">().notNull().default("qr"),
    /** available = in the pool, resting = sitting out, left = gone home. */
    availability: text("availability").$type<Availability>().notNull().default("available"),
    leftAt: ts("left_at"),
    /** Set when a match starts, cleared when it finishes. Drives wait time. */
    lastFinishedAt: ts("last_finished_at"),
    consecutiveGames: integer("consecutive_games").notNull().default(0),
  },
  (t) => [uniqueIndex("checkins_unique").on(t.sessionId, t.userId)],
);

export type Availability = "available" | "resting" | "left";

/* ---------------------------------------------------------------- matches */

export const matches = pgTable(
  "matches",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    court: integer("court").notNull(),
    status: text("status").$type<MatchStatus>().notNull().default("pending"),
    mode: text("mode").$type<QueueMode>().notNull().default("assisted"),
    gameType: text("game_type").$type<GameType>().notNull().default("casual"),
    createdAt: ts("created_at").notNull(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("matches_session_idx").on(t.sessionId)],
);

export type MatchStatus = "pending" | "playing" | "completed" | "cancelled";

export const matchPlayers = pgTable(
  "match_players",
  {
    id: id(),
    matchId: text("match_id").notNull().references(() => matches.id),
    userId: text("user_id").notNull().references(() => users.id),
    team: text("team").$type<"A" | "B">().notNull(),
  },
  (t) => [index("mp_match_idx").on(t.matchId), index("mp_user_idx").on(t.userId)],
);

export const matchScores = pgTable("match_scores", {
  id: id(),
  matchId: text("match_id").notNull().references(() => matches.id),
  teamAScore: integer("team_a_score").notNull(),
  teamBScore: integer("team_b_score").notNull(),
  winner: text("winner").$type<"A" | "B" | "none">().notNull(),
  enteredBy: text("entered_by").references(() => users.id),
  enteredAt: ts("entered_at").notNull(),
  confirmed: boolean("confirmed").notNull().default(false),
});

/* --------------------------------------------------------------- payments */

export const payments = pgTable(
  "payments",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    userId: text("user_id").notNull().references(() => users.id),
    amount: doublePrecision("amount").notNull(),
    status: text("status").$type<PaymentStatus>().notNull().default("unpaid"),
    method: text("method").$type<PaymentMethod | null>(),
    paidAt: ts("paid_at"),
    recordedBy: text("recorded_by").references(() => users.id),
  },
  (t) => [uniqueIndex("payments_unique").on(t.sessionId, t.userId)],
);

export type PaymentStatus = "unpaid" | "paid" | "waived";
export type PaymentMethod = "cash" | "transfer" | "online";

export const sessionCosts = pgTable("session_costs", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  label: text("label").notNull(),
  amount: doublePrecision("amount").notNull(),
});

/* ------------------------------------------------- preferences & auditing */

export const preferences = pgTable(
  "preferences",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    kind: text("kind").$type<"pair" | "separate">().notNull(),
    userAId: text("user_a_id").notNull().references(() => users.id),
    userBId: text("user_b_id").notNull().references(() => users.id),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("prefs_session_idx").on(t.sessionId)],
);

/** Silent record of every time a coordinator changed what the engine suggested. */
export const overrides = pgTable(
  "overrides",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    matchId: text("match_id").references(() => matches.id),
    recommended: jsonb("recommended").$type<string[]>().notNull(),
    final: jsonb("final").$type<string[]>().notNull(),
    addedIds: jsonb("added_ids").$type<string[]>().notNull(),
    removedIds: jsonb("removed_ids").$type<string[]>().notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("overrides_session_idx").on(t.sessionId)],
);

/** In-app notification feed. Phase 2 swaps the writer for push / WhatsApp. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    sessionId: text("session_id").references(() => sessions.id),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("notif_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------- auth */

/**
 * Sign-in addresses for an account. One row per address, many per user.
 *
 * A person is one row in `users` — their Elo, games played, partner history
 * and fairness record all hang off that single id, and a duplicate quietly
 * corrupts every one of them. But an organizer reasonably wants to sign in
 * from a personal address and a work one. So identity is one user, and the
 * addresses that reach it live here.
 *
 * `users.email` stays as the contact address shown in the UI. This table is
 * the only thing sign-in consults, so there is exactly one place to look when
 * asking "can this address get in".
 */
export const authEmails = pgTable(
  "auth_emails",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    /** Lowercased on write. */
    email: text("email").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("auth_email_idx").on(t.email),
    index("auth_email_user_idx").on(t.userId),
  ],
);

/**
 * A magic link that has been emailed but not yet clicked.
 *
 * Only the SHA-256 of the token is stored, so a database leak hands an attacker
 * nothing usable: they would have to invert the hash to forge a link. Same
 * reasoning as never storing a password. Single-use and short-lived, because a
 * magic link sitting in an inbox is a bearer credential.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    email: text("email").notNull(),
    /** The long random token behind the clickable link. */
    tokenHash: text("token_hash").notNull(),
    /**
     * The six digits printed in the same email. One row, two ways in, so
     * whichever gets used burns the other — there is never a spare credential
     * left alive in an inbox.
     */
    codeHash: text("code_hash"),
    /**
     * Wrong guesses against the code. Six digits is a million combinations,
     * which is only safe while the number of tries is small and finite.
     */
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("auth_token_hash_idx").on(t.tokenHash),
    index("auth_token_email_idx").on(t.email),
  ],
);

/** A signed-in browser. Hashed for the same reason as the token above. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("auth_session_hash_idx").on(t.tokenHash),
    index("auth_session_user_idx").on(t.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type AuthEmail = typeof authEmails.$inferSelect;
