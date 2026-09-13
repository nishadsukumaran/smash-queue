import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Schema for the Badminton Queue & Game Management Platform.
 *
 * Written in the SQLite dialect so the whole thing runs from a single file
 * with zero infrastructure. Every table maps 1:1 onto the Postgres DDL in
 * docs/MIGRATE-TO-SUPABASE.md, so moving to Supabase later is a swap of the
 * driver plus that one migration file.
 */

const id = () => text("id").primaryKey();
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

/* ------------------------------------------------------------------ users */

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  avatarColor: text("avatar_color").notNull().default("#3DD9A4"),
  /** Doubles Elo. 1200 = a brand new player with no history. */
  rating: real("rating").notNull().default(1200),
  ratingGames: integer("rating_games").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: ts("created_at").notNull(),
});

/* ----------------------------------------------------------------- groups */

export const groups = sqliteTable("groups", {
  id: id(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  location: text("location"),
  defaultFee: real("default_fee").notNull().default(40),
  currency: text("currency").notNull().default("AED"),
  /** JSON: default queue weights, game type, points-to, staff PIN. */
  settings: text("settings", { mode: "json" }).$type<GroupSettings>().notNull(),
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

export const groupMembers = sqliteTable(
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

export const venues = sqliteTable("venues", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id),
  name: text("name").notNull(),
  address: text("address"),
  courtCount: integer("court_count").notNull().default(4),
});

/* --------------------------------------------------------------- sessions */

export const sessions = sqliteTable(
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
    fee: real("fee").notNull().default(40),
    currency: text("currency").notNull().default("AED"),
    notes: text("notes"),
    coordinatorId: text("coordinator_id").references(() => users.id),
    status: text("status").$type<SessionStatus>().notNull().default("scheduled"),
    gameType: text("game_type").$type<GameType>().notNull().default("casual"),
    pointsTo: integer("points_to").notNull().default(30),
    queueMode: text("queue_mode").$type<QueueMode>().notNull().default("assisted"),
    weights: text("weights", { mode: "json" }).$type<QueueWeights>().notNull(),
    createdAt: ts("created_at").notNull(),
    closedAt: ts("closed_at"),
  },
  (t) => [index("sessions_group_idx").on(t.groupId)],
);

export type SessionStatus = "scheduled" | "live" | "closed" | "cancelled";
export type QueueMode = "auto" | "assisted" | "manual";

/* --------------------------------------------------------------- bookings */

export const bookings = sqliteTable(
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

export const checkIns = sqliteTable(
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

export const matches = sqliteTable(
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

export const matchPlayers = sqliteTable(
  "match_players",
  {
    id: id(),
    matchId: text("match_id").notNull().references(() => matches.id),
    userId: text("user_id").notNull().references(() => users.id),
    team: text("team").$type<"A" | "B">().notNull(),
  },
  (t) => [index("mp_match_idx").on(t.matchId), index("mp_user_idx").on(t.userId)],
);

export const matchScores = sqliteTable("match_scores", {
  id: id(),
  matchId: text("match_id").notNull().references(() => matches.id),
  teamAScore: integer("team_a_score").notNull(),
  teamBScore: integer("team_b_score").notNull(),
  winner: text("winner").$type<"A" | "B" | "none">().notNull(),
  enteredBy: text("entered_by").references(() => users.id),
  enteredAt: ts("entered_at").notNull(),
  confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
});

/* --------------------------------------------------------------- payments */

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    userId: text("user_id").notNull().references(() => users.id),
    amount: real("amount").notNull(),
    status: text("status").$type<PaymentStatus>().notNull().default("unpaid"),
    method: text("method").$type<PaymentMethod | null>(),
    paidAt: ts("paid_at"),
    recordedBy: text("recorded_by").references(() => users.id),
  },
  (t) => [uniqueIndex("payments_unique").on(t.sessionId, t.userId)],
);

export type PaymentStatus = "unpaid" | "paid" | "waived";
export type PaymentMethod = "cash" | "transfer" | "online";

export const sessionCosts = sqliteTable("session_costs", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  label: text("label").notNull(),
  amount: real("amount").notNull(),
});

/* ------------------------------------------------- preferences & auditing */

export const preferences = sqliteTable(
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
export const overrides = sqliteTable(
  "overrides",
  {
    id: id(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    matchId: text("match_id").references(() => matches.id),
    recommended: text("recommended", { mode: "json" }).$type<string[]>().notNull(),
    final: text("final", { mode: "json" }).$type<string[]>().notNull(),
    addedIds: text("added_ids", { mode: "json" }).$type<string[]>().notNull(),
    removedIds: text("removed_ids", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("overrides_session_idx").on(t.sessionId)],
);

/** In-app notification feed. Phase 2 swaps the writer for push / WhatsApp. */
export const notifications = sqliteTable(
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

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type Payment = typeof payments.$inferSelect;
