import {
  pgTable, pgSequence, text, integer, doublePrecision, boolean, timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

/**
 * Player numbers: 1001, 1002, ... A name tag for the door, never a key.
 *
 * Sequential on purpose so they are short and easy to say out loud, which
 * also makes them guessable — so nothing is ever looked up or unlocked by
 * number alone. No fixed width either: after 9999 they simply carry on.
 */
export const playerNoSeq = pgSequence("player_no_seq", { startWith: 1001 });

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
    /**
     * Runs the platform itself: creates communities and appoints their
     * organizers. Deliberately a column rather than a role in `group_members`,
     * because it is precisely the permission that is not scoped to a
     * community — a row in one group's membership table has no business
     * granting rights over another group's.
     */
    platformAdmin: boolean("platform_admin").notNull().default(false),
    /** See playerNoSeq. Assigned by the database, never by the app. */
    playerNo: integer("player_no").notNull().default(sql`nextval('player_no_seq')`),
    /**
     * When the person themselves confirmed their name and profile after
     * registering. Null for roster entries an organizer typed in and for
     * accounts that have not finished setting up.
     */
    onboardedAt: ts("onboarded_at"),
    createdAt: ts("created_at").notNull(),
  },
  // Postgres allows many NULLs under a unique index, so players without an
  // email are unaffected. It is sign-in identity, so it has to resolve to one row.
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_player_no_idx").on(t.playerNo),
  ],
);

/* ----------------------------------------------------------------- groups */

/**
 * A community: one badminton crowd, its venues, its sessions, its money.
 *
 * Still called `groups` in the database because renaming a table that eight
 * others point at buys nothing but risk. The interface says "community"
 * because that is the word the people using it use.
 *
 * Everything below hangs off a community. Nothing is global except the
 * platform admin who creates them.
 */
export const groups = pgTable(
  "groups",
  {
    id: id(),
    name: text("name").notNull(),
    /** Lowercase, hyphenated, unique. The community's address: /c/<slug>. */
    slug: text("slug").notNull(),
    ownerId: text("owner_id").notNull().references(() => users.id),
    location: text("location"),
    description: text("description"),
    /**
     * public  — listed in the directory; anyone can find it and ask to join
     * private — reachable only by invite link or code
     *
     * Orthogonal to joinPolicy, which decides what happens once somebody has
     * found it. A public community can still vet every request; a private one
     * can still let invited people straight in.
     */
    visibility: text("visibility").$type<Visibility>().notNull().default("private"),
    /**
     * The shareable half of an invite: short, uppercase, pasted into WhatsApp
     * or typed off a poster. Rotatable, because a code that has leaked is only
     * a problem until it is replaced.
     */
    inviteCode: text("invite_code").notNull(),
    defaultFee: doublePrecision("default_fee").notNull().default(40),
    currency: text("currency").notNull().default("AED"),
    /** JSON: default queue weights, game type, points-to, staff PIN. */
    settings: jsonb("settings").$type<GroupSettings>().notNull(),
    /**
     * Set rather than deleted. A community with a season of match history,
     * ratings and payments behind it should never be removable by one click,
     * and an archived one still has to render its own past.
     */
    archivedAt: ts("archived_at"),
    /**
     * When the owner read and accepted the ownership notice. Recorded rather
     * than just shown, so there is evidence of what they were told.
     */
    ownerAcceptedAt: ts("owner_accepted_at"),
    /**
     * The owner deleted it. Hidden from everyone at once; recoverable by an
     * owner for 30 days; then purged for good. Distinct from archivedAt, which
     * is the platform suspending a community for abuse.
     */
    deletedAt: ts("deleted_at"),
    deletedBy: text("deleted_by"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("groups_slug_idx").on(t.slug),
    uniqueIndex("groups_invite_code_idx").on(t.inviteCode),
  ],
);

export type Visibility = "public" | "private";

export type GroupSettings = {
  staffPin: string;
  pointsTo: number;
  defaultGameType: GameType;
  weights: QueueWeights;
  /** Ask players to confirm a score entered by someone else. */
  requireScoreConfirmation: boolean;
  /**
   * Superseded by joinPolicy. Kept so groups created before that existed keep
   * behaving the way their organizer set them, and read only as a fallback.
   */
  allowSelfSignup?: boolean;
  /**
   * How somebody new gets in.
   *   open     — they add themselves and are in straight away
   *   approval — they ask, and an organizer says yes
   *   closed   — the organizer adds everyone by hand
   */
  joinPolicy?: JoinPolicy;
  /**
   * For a public community: whether people who have not joined can see when
   * and where it plays (never who). Defaults to yes — a join button with
   * nothing behind it gives nobody a reason to press it.
   */
  previewSchedule?: boolean;
  /**
   * The owner can switch off the shared coordinator PIN once everyone who runs
   * the court has an account. Off means every court action is attributed to a
   * named person instead of "whoever had the PIN".
   */
  pinDisabled?: boolean;
  /** Wrong coordinator-PIN guesses in the current window, for the lockout. */
  pinFailures?: { count: number; since: string };
};

export type JoinPolicy = "open" | "approval" | "closed";

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
    /**
     * A join request is a membership that has not been agreed to yet, rather
     * than a row in a separate table. Approving flips one field, and there is
     * never a moment where two tables disagree about who is in the group.
     */
    status: text("status").$type<MemberStatus>().notNull().default("active"),
    /** What they typed when asking to join. Helps the organizer place a name. */
    note: text("note"),
    requestedAt: ts("requested_at"),
    decidedAt: ts("decided_at"),
    decidedBy: text("decided_by"),
    joinedAt: ts("joined_at").notNull(),
    /**
     * Rating inside this community only. Built from this community's games and
     * never shown to another, which is what lets the app promise owners that
     * their members' data stays theirs.
     */
    rating: doublePrecision("rating").notNull().default(1200),
    ratingGames: integer("rating_games").notNull().default(0),
  },
  (t) => [
    index("gm_group_idx").on(t.groupId),
    index("gm_user_idx").on(t.userId),
    index("gm_status_idx").on(t.groupId, t.status),
  ],
);

/**
 * owner       — the community is theirs: appoints organizers and co-owners,
 *               decides visibility, can delete it. Nobody outside can override.
 * organizer   — runs it day to day: sessions, venues, members, money.
 * coordinator — runs the court on the night.
 * player      — plays.
 */
export type MemberRole = "player" | "coordinator" | "organizer" | "owner";
export type MemberStatus = "active" | "inactive" | "pending" | "declined";

/**
 * An invitation addressed to one person, as opposed to the community's
 * shareable code.
 *
 * The difference matters. A code in a WhatsApp group is a door anyone who
 * scrolls up can walk through, so it hands the newcomer whatever the join
 * policy says — usually a request an organizer still has to approve. An
 * invitation is the organizer naming somebody in advance, so accepting it is
 * the approval and there is nothing left to wait for.
 *
 * Only the SHA-256 of the token is stored, for the same reason as sign-in
 * links: the thing in the email is a bearer credential, and a database dump
 * should not contain working ones.
 */
export const groupInvites = pgTable(
  "group_invites",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => groups.id),
    /** Lowercased. Null for a link the organizer hands over in person. */
    email: text("email"),
    /** What to call them before they have typed a name themselves. */
    name: text("name"),
    tokenHash: text("token_hash").notNull(),
    /** Invites can appoint coordinators and organizers, not only players. */
    role: text("role").$type<MemberRole>().notNull().default("player"),
    invitedBy: text("invited_by").references(() => users.id),
    /**
     * Set when the invitation is addressed to an existing account (by player
     * number). It then appears in that person's own inbox in the app, and only
     * they can accept it.
     */
    userId: text("user_id").references(() => users.id),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    acceptedBy: text("accepted_by").references(() => users.id),
    /** Withdrawn before it was used. Kept so the organizer can see it happened. */
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("invite_token_idx").on(t.tokenHash),
    index("invite_group_idx").on(t.groupId),
  ],
);

/* ----------------------------------------------------------------- venues */

export const venues = pgTable("venues", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id),
  name: text("name").notNull(),
  address: text("address"),
  /**
   * Nullable on purpose. A venue is useful with just a name — the address was
   * free text for months — and an organizer setting one up on a phone should
   * not be blocked by a map that will not load.
   */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
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

/* ---------------------------------------------------------- announcements */

/**
 * Something the organizer wants everyone to know.
 *
 * One row read by many, rather than a copy fanned out per member. Thirty
 * copies of "shuttles are on me tonight" would mean thirty rows to edit when
 * it turns out they are not, and thirty to delete when it was posted to the
 * wrong session.
 *
 * `sessionId` is what makes it useful rather than just another feed: an
 * announcement pinned to a session shows up on the page the people attending
 * already have open, at the time it matters, instead of scrolling away in a
 * chat thread.
 */
export const announcements = pgTable(
  "announcements",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => groups.id),
    /** Null means it concerns the whole group rather than one night. */
    sessionId: text("session_id").references(() => sessions.id),
    authorId: text("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    /** Keeps it at the top of the session page until taken down. */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: ts("created_at").notNull(),
    editedAt: ts("edited_at"),
  },
  (t) => [
    index("ann_group_idx").on(t.groupId, t.createdAt),
    index("ann_session_idx").on(t.sessionId),
  ],
);

/**
 * Who has seen what. Absence of a row means unread, so posting an
 * announcement costs one insert rather than one per member.
 */
export const announcementReads = pgTable(
  "announcement_reads",
  {
    id: id(),
    announcementId: text("announcement_id").notNull().references(() => announcements.id),
    userId: text("user_id").notNull().references(() => users.id),
    readAt: ts("read_at").notNull(),
  },
  (t) => [
    uniqueIndex("ann_read_once_idx").on(t.announcementId, t.userId),
    index("ann_read_user_idx").on(t.userId),
  ],
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
     * The four digits printed in the same email. One row, two ways in, so
     * whichever gets used burns the other — there is never a spare credential
     * left alive in an inbox.
     */
    codeHash: text("code_hash"),
    /**
     * Wrong guesses against the code. Four digits is ten thousand
     * combinations, safe only because tries are capped per token, per hour
     * and per day (see lib/auth).
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

/* -------------------------------------------------------- trusted devices */

/**
 * A phone that has proved itself once by email, and can now be unlocked with
 * a short PIN.
 *
 * The PIN is only half of the credential; the other half is the long random
 * token in this device's cookie. So a four-digit PIN is guessable only by
 * somebody already holding the phone, and five wrong tries revoke the device
 * back to email. Both halves are stored hashed.
 */
export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    /** scrypt of the PIN with this row's salt. Null until a PIN is chosen. */
    pinHash: text("pin_hash"),
    pinSalt: text("pin_salt"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("device_token_idx").on(t.tokenHash),
    index("device_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------ push notifications */

/**
 * Things worth counting for a while and then forgetting: wrong invite codes
 * typed by an account, for now. One row per event, keyed by what is being
 * limited ("join:<userId>"), read back as "how many in the last hour".
 * Old rows are deleted by the daily purge.
 */
export const rateEvents = pgTable(
  "rate_events",
  {
    id: id(),
    key: text("key").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("rate_events_key_idx").on(t.key, t.createdAt)],
);

/**
 * One browser that agreed to receive notifications for one person.
 *
 * A person can have several (phone, laptop). The endpoint is the push
 * service's address for that browser; p256dh and auth are the keys the
 * payload is encrypted with, so the push service itself can't read it.
 * Subscriptions the push service reports as gone (404/410) are deleted, so
 * this table only ever holds ones that still work.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull(),
    lastSentAt: ts("last_sent_at"),
  },
  (t) => [
    uniqueIndex("push_endpoint_idx").on(t.endpoint),
    index("push_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------- requests */

/**
 * Somebody asking to start a community. The platform admin approves or
 * declines; on approval the requester becomes its owner. That is the whole of
 * the platform's say over a community.
 */
export const communityRequests = pgTable(
  "community_requests",
  {
    id: id(),
    requesterId: text("requester_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    location: text("location"),
    description: text("description"),
    /** Free text: where and when they play, roughly how many. */
    details: text("details"),
    status: text("status").$type<RequestStatus>().notNull().default("pending"),
    decisionNote: text("decision_note"),
    decidedBy: text("decided_by").references(() => users.id),
    decidedAt: ts("decided_at"),
    groupId: text("group_id").references(() => groups.id),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("creq_status_idx").on(t.status), index("creq_requester_idx").on(t.requesterId)],
);

/**
 * A member asking for more responsibility inside their community. Only the
 * community's owners can grant it — not other organizers, and not the
 * platform.
 */
export const roleRequests = pgTable(
  "role_requests",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => groups.id),
    userId: text("user_id").notNull().references(() => users.id),
    role: text("role").$type<MemberRole>().notNull(),
    note: text("note"),
    status: text("status").$type<RequestStatus>().notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id),
    decidedAt: ts("decided_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("rreq_group_idx").on(t.groupId, t.status)],
);

export type RequestStatus = "pending" | "approved" | "declined" | "withdrawn";

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type AuthEmail = typeof authEmails.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupInvite = typeof groupInvites.$inferSelect;
export type TrustedDevice = typeof trustedDevices.$inferSelect;
export type CommunityRequest = typeof communityRequests.$inferSelect;
export type RoleRequest = typeof roleRequests.$inferSelect;
