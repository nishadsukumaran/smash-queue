import "server-only";
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  announcementReads, announcements,
  bookings, checkIns, groupInvites, groupMembers, groups, matchPlayers, matchScores, matches,
  overrides, payments, preferences, sessionCosts, sessions, users, venues,
  type Availability, type BookingStatus, type Group, type PaymentStatus,
} from "@/db/schema";
import {
  NO_CONSTRAINTS, estimateQueuePosition, rankPool, recommendMatch,
  type PlayerScore, type PoolPlayer, type RecentMatch, type Recommendation,
} from "@/lib/queue-engine";
import { fairnessScore } from "@/lib/fairness";

/* ----------------------------------------------------------------- basics */

/**
 * One community by id.
 *
 * This used to fall back to "the first row of groups" when called with no
 * argument, which was fine while there was exactly one community and a data
 * leak the day there were two. The argument is required now; screens get
 * their id from lib/tenant.
 */
export async function getGroup(groupId: string) {
  const rows = await db.select().from(groups).where(eq(groups.id, groupId));
  return rows[0] ?? null;
}

export async function getGroupBySlug(slug: string) {
  const rows = await db.select().from(groups).where(eq(groups.slug, slug.toLowerCase()));
  return rows[0] ?? null;
}

export async function getGroupByInviteCode(code: string) {
  const rows = await db.select().from(groups).where(eq(groups.inviteCode, code.toUpperCase()));
  return rows[0] ?? null;
}

export async function getSessionByCode(code: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.code, code.toUpperCase()));
  return rows[0] ?? null;
}

export async function getVenue(venueId: string | null) {
  if (!venueId) return null;
  const rows = await db.select().from(venues).where(eq(venues.id, venueId));
  return rows[0] ?? null;
}

export async function listVenues(groupId: string) {
  return db.select().from(venues).where(eq(venues.groupId, groupId));
}

/**
 * Members who can actually play. Active only, deliberately.
 *
 * This feeds the identity picker, check-in and the leaderboard, so anything
 * it returns is somebody the app will let into a session. A pending join
 * request appearing here would let the requester tap their own name and walk
 * straight past the approval they were supposed to be waiting for.
 */
export async function listMembers(groupId: string) {
  return db
    .select({ membership: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")))
    .orderBy(users.name);
}

/** The organizer's roster: everyone, including deactivated and declined. */
export async function listRoster(groupId: string) {
  return db
    .select({ membership: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        notInArray(groupMembers.status, ["pending", "declined"]),
      ),
    )
    .orderBy(users.name);
}

/** Waiting to be let in, oldest first — the queue the organizer works through. */
export async function listJoinRequests(groupId: string) {
  return db
    .select({ membership: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "pending")))
    .orderBy(groupMembers.requestedAt);
}

export async function listSessions(groupId: string) {
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.groupId, groupId))
    .orderBy(desc(sessions.date), desc(sessions.startTime));
}

/* --------------------------------------------------------- session roster */

export type RosterEntry = {
  userId: string;
  name: string;
  rating: number;
  bookingStatus: BookingStatus | null;
  waitlistPosition: number | null;
  checkedInAt: Date | null;
  availability: Availability | null;
  lastFinishedAt: Date | null;
  consecutiveGames: number;
  gamesPlayed: number;
  wins: number;
  onCourt: number | null;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  amount: number;
};

export async function getRoster(sessionId: string): Promise<RosterEntry[]> {
  const [bookingRows, checkInRows, paymentRows, completed, live] = await Promise.all([
    db
      .select({ b: bookings, u: users })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.userId))
      .where(eq(bookings.sessionId, sessionId)),
    db.select().from(checkIns).where(eq(checkIns.sessionId, sessionId)),
    db.select().from(payments).where(eq(payments.sessionId, sessionId)),
    db
      .select({ userId: matchPlayers.userId, team: matchPlayers.team, matchId: matches.id })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(and(eq(matches.sessionId, sessionId), eq(matches.status, "completed"))),
    db
      .select({ userId: matchPlayers.userId, court: matches.court })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(and(eq(matches.sessionId, sessionId), inArray(matches.status, ["playing", "pending"]))),
  ]);

  const scoreRows = completed.length
    ? await db
        .select()
        .from(matchScores)
        .where(inArray(matchScores.matchId, Array.from(new Set(completed.map((c) => c.matchId)))))
    : [];
  const winnerByMatch = new Map(scoreRows.map((s) => [s.matchId, s.winner]));

  const gamesByUser = new Map<string, number>();
  const winsByUser = new Map<string, number>();
  for (const row of completed) {
    gamesByUser.set(row.userId, (gamesByUser.get(row.userId) ?? 0) + 1);
    if (winnerByMatch.get(row.matchId) === row.team)
      winsByUser.set(row.userId, (winsByUser.get(row.userId) ?? 0) + 1);
  }

  const courtByUser = new Map(live.map((l) => [l.userId, l.court]));
  const checkInByUser = new Map(checkInRows.map((c) => [c.userId, c]));
  const paymentByUser = new Map(paymentRows.map((p) => [p.userId, p]));

  return bookingRows
    .map(({ b, u }) => {
      const ci = checkInByUser.get(u.id) ?? null;
      const pay = paymentByUser.get(u.id);
      return {
        userId: u.id,
        name: u.name,
        rating: u.rating,
        bookingStatus: b.status,
        waitlistPosition: b.waitlistPosition,
        checkedInAt: ci?.checkedInAt ?? null,
        availability: ci?.availability ?? null,
        lastFinishedAt: ci?.lastFinishedAt ?? null,
        consecutiveGames: ci?.consecutiveGames ?? 0,
        gamesPlayed: gamesByUser.get(u.id) ?? 0,
        wins: winsByUser.get(u.id) ?? 0,
        onCourt: courtByUser.get(u.id) ?? null,
        paymentStatus: pay?.status ?? "unpaid",
        paymentMethod: pay?.method ?? null,
        amount: pay?.amount ?? 0,
      } satisfies RosterEntry;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------------------------------------------------------------- matches */

export type MatchView = {
  id: string;
  court: number;
  status: "pending" | "playing" | "completed" | "cancelled";
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  mode: string;
  teamA: { id: string; name: string; rating: number }[];
  teamB: { id: string; name: string; rating: number }[];
  score: { a: number; b: number; winner: "A" | "B" | "none"; confirmed: boolean } | null;
};

export async function getMatches(sessionId: string): Promise<MatchView[]> {
  const rows = await db
    .select()
    .from(matches)
    .where(eq(matches.sessionId, sessionId))
    .orderBy(desc(matches.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((m) => m.id);
  const [mps, scores] = await Promise.all([
    db
      .select({ mp: matchPlayers, u: users })
      .from(matchPlayers)
      .innerJoin(users, eq(users.id, matchPlayers.userId))
      .where(inArray(matchPlayers.matchId, ids)),
    db.select().from(matchScores).where(inArray(matchScores.matchId, ids)),
  ]);

  const scoreByMatch = new Map(scores.map((s) => [s.matchId, s]));
  return rows.map((m) => {
    const players = mps.filter((x) => x.mp.matchId === m.id);
    const s = scoreByMatch.get(m.id);
    const pick = (team: "A" | "B") =>
      players
        .filter((x) => x.mp.team === team)
        .map((x) => ({ id: x.u.id, name: x.u.name, rating: x.u.rating }));
    return {
      id: m.id,
      court: m.court,
      status: m.status,
      startedAt: m.startedAt,
      finishedAt: m.finishedAt,
      createdAt: m.createdAt,
      mode: m.mode,
      teamA: pick("A"),
      teamB: pick("B"),
      score: s ? { a: s.teamAScore, b: s.teamBScore, winner: s.winner, confirmed: s.confirmed } : null,
    };
  });
}

/* ------------------------------------------------------------- the board */

export type CourtView = {
  court: number;
  match: MatchView | null;
  recommendation: Recommendation | null;
};

export type BoardData = {
  session: typeof sessions.$inferSelect;
  venue: Awaited<ReturnType<typeof getVenue>>;
  roster: RosterEntry[];
  matches: MatchView[];
  courts: CourtView[];
  ranked: PlayerScore[];
  checkedInCount: number;
  availableCount: number;
  fairness: ReturnType<typeof fairnessScore>;
  totals: { expected: number; collected: number; outstanding: number; unpaid: string[] };
  prefs: (typeof preferences.$inferSelect)[];
  now: number;
};

function buildPool(roster: RosterEntry[], now: number): PoolPlayer[] {
  return roster
    .filter((r) => r.checkedInAt && r.availability && r.availability !== "left")
    .map((r) => ({
      id: r.userId,
      name: r.name,
      rating: r.rating,
      gamesPlayed: r.gamesPlayed,
      availableSince: (r.lastFinishedAt ?? r.checkedInAt ?? new Date(now)).getTime(),
      consecutiveGames: r.consecutiveGames,
      availability: r.onCourt !== null ? ("resting" as const) : (r.availability as Availability),
    }));
}

function buildHistory(all: MatchView[]): RecentMatch[] {
  return all
    .filter((m) => m.status === "completed")
    .sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0))
    .map((m) => ({
      finishedAt: m.finishedAt?.getTime() ?? 0,
      teamA: m.teamA.map((p) => p.id),
      teamB: m.teamB.map((p) => p.id),
    }));
}

export async function getBoard(sessionId: string, now = Date.now()): Promise<BoardData | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  const session = rows[0];
  if (!session) return null;

  const [venue, roster, allMatches, prefs] = await Promise.all([
    getVenue(session.venueId),
    getRoster(sessionId),
    getMatches(sessionId),
    db.select().from(preferences).where(eq(preferences.sessionId, sessionId)),
  ]);

  const pool = buildPool(roster, now);
  const history = buildHistory(allMatches);
  const opts = {
    now,
    weights: session.weights,
    gameType: session.gameType,
  };
  const ranked = rankPool(pool, opts);

  const constraints = {
    ...NO_CONSTRAINTS,
    pairs: prefs.filter((p) => p.kind === "pair").map((p) => [p.userAId, p.userBId] as [string, string]),
    separate: prefs
      .filter((p) => p.kind === "separate")
      .map((p) => [p.userAId, p.userBId] as [string, string]),
  };

  const courts: CourtView[] = [];
  const claimed = new Set<string>();
  for (let c = 1; c <= session.courtCount; c++) {
    const match =
      allMatches.find((m) => m.court === c && (m.status === "playing" || m.status === "pending")) ??
      null;
    let recommendation: Recommendation | null = null;
    if (!match && session.status === "live") {
      recommendation = recommendMatch(
        pool,
        history,
        { ...constraints, excludedIds: [...constraints.excludedIds, ...claimed] },
        opts,
      );
      recommendation?.playerIds.forEach((id) => claimed.add(id));
    }
    courts.push({ court: c, match, recommendation });
  }

  const checkedIn = roster.filter((r) => r.checkedInAt && r.availability !== "left");
  const played = checkedIn.map((r) => r.gamesPlayed);
  const expected = roster.filter((r) => r.bookingStatus === "confirmed").length * session.fee;
  const collected = roster
    .filter((r) => r.paymentStatus === "paid")
    .reduce((s, r) => s + (r.amount || session.fee), 0);
  const unpaid = roster
    .filter((r) => r.checkedInAt && r.paymentStatus === "unpaid")
    .map((r) => r.name);

  return {
    session,
    venue,
    roster,
    matches: allMatches,
    courts,
    ranked,
    checkedInCount: checkedIn.length,
    availableCount: ranked.length,
    fairness: fairnessScore(played),
    totals: { expected, collected, outstanding: Math.max(0, expected - collected), unpaid },
    prefs,
    now,
  };
}

/* --------------------------------------------------------- player-facing */

export type PlayerView = {
  session: typeof sessions.$inferSelect;
  me: RosterEntry | null;
  currentMatch: MatchView | null;
  nextMatch: MatchView | null;
  recentMatches: MatchView[];
  queue: ReturnType<typeof estimateQueuePosition>;
  playersWithFewerGames: number;
  freeCourts: number;
  fairness: ReturnType<typeof fairnessScore>;
  checkedInCount: number;
};

export async function getPlayerView(
  sessionId: string,
  userId: string | null,
  now = Date.now(),
): Promise<PlayerView | null> {
  const board = await getBoard(sessionId, now);
  if (!board) return null;

  const me = board.roster.find((r) => r.userId === userId) ?? null;
  const mine = board.matches.filter((m) => [...m.teamA, ...m.teamB].some((p) => p.id === userId));

  const currentMatch = mine.find((m) => m.status === "playing") ?? null;
  const nextMatch = mine.find((m) => m.status === "pending") ?? null;
  const recentMatches = mine.filter((m) => m.status === "completed").slice(0, 12);

  const freeCourts = board.courts.filter((c) => !c.match).length;
  const queue = userId
    ? estimateQueuePosition(userId, board.ranked, freeCourts)
    : { position: 0, aheadCount: 0, label: "Not in the queue" };

  const playersWithFewerGames = me
    ? board.roster.filter(
        (r) => r.checkedInAt && r.availability !== "left" && r.gamesPlayed < me.gamesPlayed,
      ).length
    : 0;

  return {
    session: board.session,
    me,
    currentMatch,
    nextMatch,
    recentMatches,
    queue,
    playersWithFewerGames,
    freeCourts,
    fairness: board.fairness,
    checkedInCount: board.checkedInCount,
  };
}

/* ------------------------------------------------------------- summaries */

export type SessionSummary = {
  session: typeof sessions.$inferSelect;
  venue: Awaited<ReturnType<typeof getVenue>>;
  players: number;
  gamesPlayed: number;
  avgGames: number;
  maxGames: number;
  minGames: number;
  avgWaitMinutes: number;
  fairness: ReturnType<typeof fairnessScore>;
  revenue: number;
  collected: number;
  pending: number;
  costs: { label: string; amount: number }[];
  costTotal: number;
  balance: number;
  roster: RosterEntry[];
  matches: MatchView[];
  overrideCount: number;
  noShows: string[];
};

export async function getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
  const board = await getBoard(sessionId);
  if (!board) return null;

  const [costs, overrideRows] = await Promise.all([
    db.select().from(sessionCosts).where(eq(sessionCosts.sessionId, sessionId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(overrides)
      .where(eq(overrides.sessionId, sessionId)),
  ]);

  const checkedIn = board.roster.filter((r) => r.checkedInAt);
  const games = checkedIn.map((r) => r.gamesPlayed);
  const completed = board.matches.filter((m) => m.status === "completed");

  const waits: number[] = [];
  for (const r of checkedIn) {
    const mine = completed
      .filter((m) => [...m.teamA, ...m.teamB].some((p) => p.id === r.userId))
      .sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
    let cursor = r.checkedInAt?.getTime() ?? 0;
    for (const m of mine) {
      if (m.startedAt) waits.push(Math.max(0, m.startedAt.getTime() - cursor) / 60000);
      cursor = m.finishedAt?.getTime() ?? cursor;
    }
  }

  const costTotal = costs.reduce((s, c) => s + c.amount, 0);

  return {
    session: board.session,
    venue: board.venue,
    players: checkedIn.length,
    gamesPlayed: completed.length,
    avgGames: games.length ? games.reduce((a, b) => a + b, 0) / games.length : 0,
    maxGames: games.length ? Math.max(...games) : 0,
    minGames: games.length ? Math.min(...games) : 0,
    avgWaitMinutes: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0,
    fairness: board.fairness,
    revenue: board.totals.expected,
    collected: board.totals.collected,
    pending: board.totals.outstanding,
    costs: costs.map((c) => ({ label: c.label, amount: c.amount })),
    costTotal,
    balance: board.totals.collected - costTotal,
    roster: board.roster,
    matches: board.matches,
    overrideCount: Number(overrideRows[0]?.n ?? 0),
    noShows: board.roster.filter((r) => r.bookingStatus === "no_show").map((r) => r.name),
  };
}

/* ----------------------------------------------------------- player stats */

export type PlayerStats = {
  user: typeof users.$inferSelect;
  sessionsAttended: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  avgGamesPerSession: number;
  favouritePartner: { name: string; games: number } | null;
  frequentOpponent: { name: string; games: number } | null;
  recentForm: ("W" | "L" | "-")[];
};

export async function getPlayerStats(userId: string): Promise<PlayerStats | null> {
  const userRows = await db.select().from(users).where(eq(users.id, userId));
  const user = userRows[0];
  if (!user) return null;

  const mine = await db
    .select({ mp: matchPlayers, m: matches })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matchPlayers.userId, userId), eq(matches.status, "completed")));

  const matchIds = mine.map((r) => r.m.id);
  const [others, scores, attendance] = await Promise.all([
    matchIds.length
      ? db
          .select({ mp: matchPlayers, u: users })
          .from(matchPlayers)
          .innerJoin(users, eq(users.id, matchPlayers.userId))
          .where(inArray(matchPlayers.matchId, matchIds))
      : Promise.resolve([]),
    matchIds.length
      ? db.select().from(matchScores).where(inArray(matchScores.matchId, matchIds))
      : Promise.resolve([]),
    db.select().from(checkIns).where(eq(checkIns.userId, userId)),
  ]);

  const winnerByMatch = new Map(scores.map((s) => [s.matchId, s.winner]));
  const teamByMatch = new Map(mine.map((r) => [r.m.id, r.mp.team]));

  let wins = 0;
  let losses = 0;
  for (const id of matchIds) {
    const w = winnerByMatch.get(id);
    if (!w || w === "none") continue;
    if (w === teamByMatch.get(id)) wins++;
    else losses++;
  }

  const partners = new Map<string, { name: string; games: number }>();
  const opponents = new Map<string, { name: string; games: number }>();
  for (const row of others) {
    if (row.u.id === userId) continue;
    const myTeam = teamByMatch.get(row.mp.matchId);
    if (!myTeam) continue;
    const bucket = row.mp.team === myTeam ? partners : opponents;
    const cur = bucket.get(row.u.id) ?? { name: row.u.name, games: 0 };
    cur.games++;
    bucket.set(row.u.id, cur);
  }
  const top = (m: Map<string, { name: string; games: number }>) =>
    Array.from(m.values()).sort((a, b) => b.games - a.games)[0] ?? null;

  const sessionsAttended = attendance.length;
  const recent = mine
    .sort((a, b) => (b.m.finishedAt?.getTime() ?? 0) - (a.m.finishedAt?.getTime() ?? 0))
    .slice(0, 8)
    .map((r) => {
      const w = winnerByMatch.get(r.m.id);
      if (!w || w === "none") return "-" as const;
      return w === r.mp.team ? ("W" as const) : ("L" as const);
    });

  return {
    user,
    sessionsAttended,
    games: matchIds.length,
    wins,
    losses,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
    avgGamesPerSession: sessionsAttended ? matchIds.length / sessionsAttended : 0,
    favouritePartner: top(partners),
    frequentOpponent: top(opponents),
    recentForm: recent,
  };
}

export async function getLeaderboard(groupId: string) {
  const members = await listMembers(groupId);
  const stats = await Promise.all(members.map((m) => getPlayerStats(m.user.id)));
  return stats
    .filter((s): s is PlayerStats => Boolean(s))
    .sort((a, b) => b.user.rating - a.user.rating || b.games - a.games);
}

/* ---------------------------------------------------------- announcements */

export type AnnouncementRow = {
  announcement: typeof announcements.$inferSelect;
  author: { id: string; name: string };
  unread: boolean;
};

/**
 * Announcements for a group, newest first, with pinned ones held at the top.
 *
 * `sessionId` widens rather than narrows: a session page shows the notices
 * pinned to that night *and* the group-wide ones, because "the venue moved"
 * matters just as much whether or not somebody remembered to attach it to a
 * session.
 */
export async function listAnnouncements(
  groupId: string,
  opts: { sessionId?: string | null; viewerId?: string | null; limit?: number } = {},
): Promise<AnnouncementRow[]> {
  const { sessionId, viewerId, limit = 20 } = opts;

  const where = sessionId
    ? and(
        eq(announcements.groupId, groupId),
        or(eq(announcements.sessionId, sessionId), isNull(announcements.sessionId)),
      )
    : and(eq(announcements.groupId, groupId), isNull(announcements.sessionId));

  const rows = await db
    .select({ announcement: announcements, author: users })
    .from(announcements)
    .innerJoin(users, eq(users.id, announcements.authorId))
    .where(where)
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // One query for the viewer's read receipts rather than one per row.
  const seen = viewerId
    ? new Set(
        (
          await db
            .select({ id: announcementReads.announcementId })
            .from(announcementReads)
            .where(
              and(
                eq(announcementReads.userId, viewerId),
                inArray(
                  announcementReads.announcementId,
                  rows.map((r) => r.announcement.id),
                ),
              ),
            )
        ).map((r) => r.id),
      )
    : new Set<string>();

  return rows.map((r) => ({
    announcement: r.announcement,
    author: { id: r.author.id, name: r.author.name },
    // Your own post is never "unread" — you wrote it.
    unread: Boolean(viewerId) && r.author.id !== viewerId && !seen.has(r.announcement.id),
  }));
}

/** How many group-wide announcements this person has not opened yet. */
export async function unreadAnnouncementCount(groupId: string, viewerId: string | null) {
  if (!viewerId) return 0;
  const rows = await listAnnouncements(groupId, { viewerId, limit: 50 });
  return rows.filter((r) => r.unread).length;
}

/* ----------------------------------------------------------- communities */

export type CommunityCard = {
  group: Group;
  members: number;
  pending: number;
  sessions: number;
  organizers: Array<{ id: string; name: string; email: string | null }>;
};

/**
 * Every community with the four numbers the platform console needs to tell
 * a thriving one from an abandoned one at a glance.
 *
 * Four queries stitched in JavaScript rather than one clever join. Over the
 * HTTP driver each round trip costs the same whatever it returns, and four
 * readable ones beat a single query nobody will dare change later.
 */
export async function listCommunities(): Promise<CommunityCard[]> {
  const [all, memberCounts, sessionCounts, organizerRows] = await Promise.all([
    db.select().from(groups).orderBy(groups.name),
    db
      .select({
        groupId: groupMembers.groupId,
        status: groupMembers.status,
        n: sql<number>`count(*)::int`,
      })
      .from(groupMembers)
      .groupBy(groupMembers.groupId, groupMembers.status),
    db
      .select({ groupId: sessions.groupId, n: sql<number>`count(*)::int` })
      .from(sessions)
      .groupBy(sessions.groupId),
    db
      .select({ groupId: groupMembers.groupId, user: users })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.role, "organizer"), eq(groupMembers.status, "active")))
      .orderBy(users.name),
  ]);

  const active = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const row of memberCounts) {
    if (row.status === "active") active.set(row.groupId, row.n);
    if (row.status === "pending") pending.set(row.groupId, row.n);
  }
  const held = new Map(sessionCounts.map((r) => [r.groupId, r.n]));
  const organizers = new Map<string, CommunityCard["organizers"]>();
  for (const row of organizerRows) {
    const list = organizers.get(row.groupId) ?? [];
    list.push({ id: row.user.id, name: row.user.name, email: row.user.email });
    organizers.set(row.groupId, list);
  }

  return all.map((group) => ({
    group,
    members: active.get(group.id) ?? 0,
    pending: pending.get(group.id) ?? 0,
    sessions: held.get(group.id) ?? 0,
    organizers: organizers.get(group.id) ?? [],
  }));
}

/**
 * The public directory: communities that chose to be findable.
 *
 * Deliberately returns no sessions, no rosters and no fees — only what a
 * stranger needs to decide whether to knock. Membership is what opens the
 * rest, and a directory that leaked tonight's attendance would make the
 * membership gate decorative.
 */
export async function listPublicCommunities() {
  const [all, counts] = await Promise.all([
    db
      .select()
      .from(groups)
      .where(and(eq(groups.visibility, "public"), isNull(groups.archivedAt)))
      .orderBy(groups.name),
    db
      .select({ groupId: groupMembers.groupId, n: sql<number>`count(*)::int` })
      .from(groupMembers)
      .where(eq(groupMembers.status, "active"))
      .groupBy(groupMembers.groupId),
  ]);
  const members = new Map(counts.map((c) => [c.groupId, c.n]));
  return all.map((group) => ({ group, members: members.get(group.id) ?? 0 }));
}

/** Who runs this community, for the "ask them" line a newcomer sees. */
export async function listOrganizers(groupId: string) {
  return db
    .select({ membership: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.status, "active"),
        inArray(groupMembers.role, ["organizer", "coordinator"]),
      ),
    )
    .orderBy(desc(groupMembers.role), users.name);
}

/** Invitations sent but not yet used, newest first. */
export async function listInvites(groupId: string) {
  return db
    .select()
    .from(groupInvites)
    .where(and(eq(groupInvites.groupId, groupId), isNull(groupInvites.acceptedAt)))
    .orderBy(desc(groupInvites.createdAt))
    .limit(50);
}

/** How busy a community looks from outside: enough to decide whether to join. */
export async function communitySummary(groupId: string) {
  const [members, upcoming, venueRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)
      .where(
        and(eq(sessions.groupId, groupId), inArray(sessions.status, ["scheduled", "live"])),
      ),
    db.select({ name: venues.name }).from(venues).where(eq(venues.groupId, groupId)).limit(4),
  ]);
  return {
    members: members[0]?.n ?? 0,
    upcoming: upcoming[0]?.n ?? 0,
    venues: venueRows.map((v) => v.name),
  };
}
