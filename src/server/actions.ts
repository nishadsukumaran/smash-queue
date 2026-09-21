"use server";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  announcementReads, announcements,
  bookings, checkIns, groupMembers, groups, matchPlayers, matchScores, matches,
  notifications, overrides, payments, preferences, sessionCosts, sessions, users, venues,
  type Availability, type GameType, type PaymentMethod, type QueueMode, type QueueWeights,
} from "@/db/schema";
import { newId, sessionCode } from "@/lib/ids";
import { verifyCheckInToken } from "@/lib/qr";
import { updateRatings } from "@/lib/fairness";
import { colorFor } from "@/lib/format";
import type { JoinPolicy } from "@/db/schema";
import { joinPolicyOf } from "@/lib/join-policy";
import { validCoords } from "@/lib/geocode";
import { grantStaff, revokeStaff, setCurrentUserId, clearCurrentUser } from "@/lib/identity";
import { DEFAULT_WEIGHTS, BALANCE_BY_TYPE } from "@/lib/queue-engine";
import { setActiveCommunity } from "@/lib/tenant";

type Result = { ok: boolean; message?: string; id?: string };

function touch(code?: string) {
  revalidatePath("/", "layout");
  if (code) revalidatePath(`/s/${code}`, "layout");
}

async function sessionById(sessionId: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  return rows[0] ?? null;
}

async function notify(userIds: string[], sessionId: string, kind: string, body: string) {
  if (userIds.length === 0) return;
  const now = new Date();
  await db.insert(notifications).values(
    userIds.map((userId) => ({ id: newId("ntf"), sessionId, userId, kind, body, createdAt: now })),
  );
}

/* ------------------------------------------------------------- identity */

export async function selectIdentity(userId: string) {
  await setCurrentUserId(userId);
  touch();
  return { ok: true };
}

export async function signOutIdentity() {
  await clearCurrentUser();
  await revokeStaff();
  touch();
  return { ok: true };
}

export async function unlockStaff(groupId: string, pin: string): Promise<Result> {
  const rows = await db.select().from(groups).where(eq(groups.id, groupId));
  const group = rows[0];
  if (!group) return { ok: false, message: "Group not found" };
  if ((group.settings?.staffPin ?? "") !== pin.trim())
    return { ok: false, message: "That PIN is not right" };
  await grantStaff(groupId);
  touch();
  return { ok: true };
}

export async function lockStaff() {
  await revokeStaff();
  touch();
  return { ok: true };
}

/* --------------------------------------------------------------- members */

export async function addMember(
  groupId: string,
  name: string,
  phone?: string,
  rating = 1200,
): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { ok: false, message: "Name is required" };

  const existing = await db
    .select()
    .from(users)
    .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
    .where(and(eq(groupMembers.groupId, groupId), sql`lower(${users.name}) = lower(${clean})`));
  if (existing.length) return { ok: false, message: `${clean} is already in the group` };

  const userId = newId("usr");
  const now = new Date();
  await db.insert(users).values({
    id: userId,
    name: clean,
    phone: phone?.trim() || null,
    avatarColor: colorFor(clean),
    rating,
    createdAt: now,
  });
  await db.insert(groupMembers).values({
    id: newId("gm"),
    groupId,
    userId,
    role: "player",
    joinedAt: now,
  });
  touch();
  return { ok: true, id: userId };
}

/** Loose match so "arun menon", "Arun  Menon" and "ArunMenon" all collide. */
function nameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type RegisterResult = Result & {
  /** An existing member whose name matches. Offered instead of a duplicate. */
  duplicate?: { id: string; name: string };
  /** The group vets new members, so this one is waiting rather than in. */
  pending?: boolean;
};

/**
 * Self-registration from the session link.
 *
 * A duplicate player would quietly wreck the things that matter here: games
 * played, the fairness score, ratings and history all key off one row per
 * person. So a name that already exists is never created twice - the caller is
 * handed the existing member to claim instead.
 */
export async function registerPlayer(
  groupId: string,
  name: string,
  phone?: string,
  note?: string,
): Promise<RegisterResult> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return { ok: false, message: "Please enter your name" };
  if (clean.length > 40) return { ok: false, message: "That name is too long" };

  const groupRows = await db.select().from(groups).where(eq(groups.id, groupId));
  const group = groupRows[0];
  if (!group) return { ok: false, message: "Group not found" };
  const policy = joinPolicyOf(group.settings);
  if (policy === "closed")
    return { ok: false, message: "The organizer adds members for this group. Ask them for an invite." };

  const existing = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));

  const key = nameKey(clean);
  const match = existing.find((u) => nameKey(u.name) === key);
  if (match)
    return {
      ok: false,
      message: `${match.name} is already on the list.`,
      duplicate: { id: match.id, name: match.name },
    };

  const userId = newId("usr");
  const now = new Date();
  await db.insert(users).values({
    id: userId,
    name: clean,
    phone: phone?.trim() || null,
    avatarColor: colorFor(clean),
    rating: 1200,
    createdAt: now,
  });
  const pending = policy === "approval";
  await db.insert(groupMembers).values({
    id: newId("gm"),
    groupId,
    userId,
    role: "player",
    status: pending ? "pending" : "active",
    note: note?.trim()?.slice(0, 300) || null,
    requestedAt: pending ? now : null,
    joinedAt: now,
  });

  // Remember them on this phone either way. A pending member still needs the
  // app to know who they are, so the waiting screen is theirs rather than a
  // generic one, and so approval does not make them introduce themselves again.
  await setCurrentUserId(userId);
  // Whatever community they came in through is the one they want to see next.
  await setActiveCommunity(groupId);
  touch();

  if (pending)
    return {
      ok: true,
      id: userId,
      pending: true,
      message: `Thanks ${clean.split(" ")[0]}. The organizer will let you in.`,
    };

  return { ok: true, id: userId, message: `Welcome, ${clean.split(" ")[0]}` };
}

export async function setJoinPolicy(groupId: string, policy: JoinPolicy): Promise<Result> {
  if (!["open", "approval", "closed"].includes(policy))
    return { ok: false, message: "Unknown join policy" };
  const rows = await db.select().from(groups).where(eq(groups.id, groupId));
  const group = rows[0];
  if (!group) return { ok: false, message: "Group not found" };
  await db
    .update(groups)
    .set({ settings: { ...group.settings, joinPolicy: policy } })
    .where(eq(groups.id, groupId));
  touch();
  return { ok: true };
}

/**
 * Lets somebody in, or turns them away.
 *
 * Declining keeps the row rather than deleting it: the person has a user
 * record with a name that the duplicate guard needs to keep seeing, and an
 * organizer who declines by mistake can undo it. It also means a second
 * request updates the same row instead of stacking up.
 */
export async function decideJoinRequest(
  membershipId: string,
  decision: "approve" | "decline",
  deciderId: string | null,
): Promise<Result> {
  const rows = await db.select().from(groupMembers).where(eq(groupMembers.id, membershipId));
  const member = rows[0];
  if (!member) return { ok: false, message: "Request not found" };
  if (member.status !== "pending") return { ok: false, message: "Already decided" };

  await db
    .update(groupMembers)
    .set({
      status: decision === "approve" ? "active" : "declined",
      decidedAt: new Date(),
      decidedBy: deciderId,
    })
    .where(eq(groupMembers.id, membershipId));
  touch();
  return { ok: true };
}

export async function updateGroup(
  groupId: string,
  patch: { name?: string; location?: string; defaultFee?: number; staffPin?: string },
): Promise<Result> {
  const rows = await db.select().from(groups).where(eq(groups.id, groupId));
  const group = rows[0];
  if (!group) return { ok: false, message: "Group not found" };

  const next: Record<string, unknown> = {};
  if (patch.name?.trim()) next.name = patch.name.trim();
  if (patch.location !== undefined) next.location = patch.location.trim() || null;
  if (patch.defaultFee !== undefined && Number.isFinite(patch.defaultFee))
    next.defaultFee = Math.max(0, patch.defaultFee);

  if (patch.staffPin) {
    const pin = patch.staffPin.trim();
    if (!/^\d{4,8}$/.test(pin)) return { ok: false, message: "PIN must be 4 to 8 digits" };
    next.settings = { ...group.settings, staffPin: pin };
  }

  if (Object.keys(next).length) await db.update(groups).set(next).where(eq(groups.id, groupId));
  touch();
  return { ok: true };
}

export async function setSelfSignup(groupId: string, allow: boolean) {
  const rows = await db.select().from(groups).where(eq(groups.id, groupId));
  const group = rows[0];
  if (!group) return { ok: false, message: "Group not found" };
  await db
    .update(groups)
    .set({ settings: { ...group.settings, allowSelfSignup: allow } })
    .where(eq(groups.id, groupId));
  touch();
  return { ok: true };
}

export async function setMemberRole(
  membershipId: string,
  role: "player" | "coordinator" | "organizer",
) {
  await db.update(groupMembers).set({ role }).where(eq(groupMembers.id, membershipId));
  touch();
  return { ok: true };
}

export async function setMemberActive(membershipId: string, active: boolean) {
  await db
    .update(groupMembers)
    .set({ status: active ? "active" : "inactive" })
    .where(eq(groupMembers.id, membershipId));
  touch();
  return { ok: true };
}

export async function addVenue(
  groupId: string,
  name: string,
  address: string,
  courtCount: number,
  latitude?: unknown,
  longitude?: unknown,
) {
  if (!name.trim()) return { ok: false, message: "Venue name is required" };

  // Coordinates are optional and validated rather than trusted: the form lets
  // them be typed by hand, and a half-typed "24." must not be stored as a
  // location that then renders a pin in the wrong country.
  const coords = validCoords(latitude, longitude);

  await db.insert(venues).values({
    id: newId("ven"),
    groupId,
    name: name.trim(),
    address: address.trim() || null,
    latitude: coords?.[0] ?? null,
    longitude: coords?.[1] ?? null,
    courtCount: Math.max(1, courtCount),
  });
  touch();
  return { ok: true };
}

/* -------------------------------------------------------------- sessions */

export async function createSession(input: {
  groupId: string;
  venueId: string | null;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  courtCount: number;
  capacity: number;
  fee: number;
  notes?: string;
  gameType?: GameType;
  pointsTo?: number;
  coordinatorId?: string | null;
}): Promise<Result> {
  const groupRows = await db.select().from(groups).where(eq(groups.id, input.groupId));
  const group = groupRows[0];
  if (!group) return { ok: false, message: "Group not found" };
  if (!input.name.trim()) return { ok: false, message: "Session name is required" };

  const gameType = input.gameType ?? group.settings.defaultGameType ?? "balanced";
  const weights: QueueWeights = {
    ...(group.settings.weights ?? DEFAULT_WEIGHTS),
    balance: BALANCE_BY_TYPE[gameType],
  };

  const id = newId("ses");
  await db.insert(sessions).values({
    id,
    groupId: input.groupId,
    venueId: input.venueId,
    code: sessionCode(),
    name: input.name.trim(),
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    courtCount: Math.max(1, input.courtCount),
    capacity: Math.max(4, input.capacity),
    fee: Math.max(0, input.fee),
    currency: group.currency,
    notes: input.notes?.trim() || null,
    coordinatorId: input.coordinatorId ?? group.ownerId,
    status: "scheduled",
    gameType,
    pointsTo: input.pointsTo ?? group.settings.pointsTo ?? 30,
    queueMode: "assisted",
    weights,
    createdAt: new Date(),
  });
  touch();
  return { ok: true, id };
}

export async function updateSessionSettings(
  sessionId: string,
  patch: Partial<{
    courtCount: number;
    capacity: number;
    fee: number;
    gameType: GameType;
    queueMode: QueueMode;
    pointsTo: number;
    weights: QueueWeights;
    endTime: string;
    notes: string;
  }>,
) {
  const s = await sessionById(sessionId);
  if (!s) return { ok: false, message: "Session not found" };

  const next: Record<string, unknown> = { ...patch };
  if (patch.gameType && !patch.weights)
    next.weights = { ...s.weights, balance: BALANCE_BY_TYPE[patch.gameType] };

  await db.update(sessions).set(next).where(eq(sessions.id, sessionId));
  touch(s.code);
  return { ok: true };
}

export async function startSession(sessionId: string) {
  const s = await sessionById(sessionId);
  if (!s) return { ok: false, message: "Session not found" };
  await db.update(sessions).set({ status: "live" }).where(eq(sessions.id, sessionId));
  touch(s.code);
  return { ok: true };
}

export async function closeSession(sessionId: string) {
  const s = await sessionById(sessionId);
  if (!s) return { ok: false, message: "Session not found" };

  const live = await db
    .select()
    .from(matches)
    .where(and(eq(matches.sessionId, sessionId), inArray(matches.status, ["playing", "pending"])));
  if (live.length)
    return { ok: false, message: `Finish or cancel ${live.length} live game(s) first` };

  // Anyone who booked but never scanned in is recorded as a no-show.
  const checked = await db.select().from(checkIns).where(eq(checkIns.sessionId, sessionId));
  const checkedIds = new Set(checked.map((c) => c.userId));
  const booked = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), eq(bookings.status, "confirmed")));
  const ghosts = booked.filter((b) => !checkedIds.has(b.userId)).map((b) => b.id);
  if (ghosts.length)
    await db.update(bookings).set({ status: "no_show" }).where(inArray(bookings.id, ghosts));

  await db
    .update(sessions)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(sessions.id, sessionId));
  touch(s.code);
  return { ok: true };
}

export async function addSessionCost(sessionId: string, label: string, amount: number) {
  if (!label.trim()) return { ok: false, message: "Label is required" };
  await db
    .insert(sessionCosts)
    .values({ id: newId("cst"), sessionId, label: label.trim(), amount });
  const s = await sessionById(sessionId);
  touch(s?.code);
  return { ok: true };
}

export async function removeSessionCost(costId: string) {
  await db.delete(sessionCosts).where(eq(sessionCosts.id, costId));
  touch();
  return { ok: true };
}

/* -------------------------------------------------------------- bookings */

async function nextWaitlistPosition(sessionId: string) {
  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), eq(bookings.status, "waitlisted")));
  return rows.length + 1;
}

export async function bookSlot(sessionId: string, userId: string): Promise<Result> {
  const s = await sessionById(sessionId);
  if (!s) return { ok: false, message: "Session not found" };
  if (s.status === "closed" || s.status === "cancelled")
    return { ok: false, message: "This session is closed" };

  const existing = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), eq(bookings.userId, userId)));

  const confirmed = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), eq(bookings.status, "confirmed")));

  const full = confirmed.length >= s.capacity;
  const status = full ? "waitlisted" : "confirmed";
  const waitlistPosition = full ? await nextWaitlistPosition(sessionId) : null;

  if (existing.length) {
    const current = existing[0];
    if (current.status === "confirmed" || current.status === "waitlisted")
      return { ok: false, message: "You are already on the list" };
    await db
      .update(bookings)
      .set({ status, waitlistPosition, bookedAt: new Date(), cancelledAt: null })
      .where(eq(bookings.id, current.id));
  } else {
    await db.insert(bookings).values({
      id: newId("bkg"),
      sessionId,
      userId,
      status,
      waitlistPosition,
      bookedAt: new Date(),
    });
  }

  if (status === "confirmed")
    await db
      .insert(payments)
      .values({
        id: newId("pay"),
        sessionId,
        userId,
        amount: s.fee,
        status: "unpaid",
      })
      .onConflictDoNothing();

  touch(s.code);
  return {
    ok: true,
    message: full ? `You are number ${waitlistPosition} on the waitlist` : "You are in",
  };
}

export async function cancelBooking(sessionId: string, userId: string): Promise<Result> {
  const s = await sessionById(sessionId);
  if (!s) return { ok: false, message: "Session not found" };

  await db
    .update(bookings)
    .set({ status: "cancelled", waitlistPosition: null, cancelledAt: new Date() })
    .where(and(eq(bookings.sessionId, sessionId), eq(bookings.userId, userId)));
  await db
    .delete(payments)
    .where(and(eq(payments.sessionId, sessionId), eq(payments.userId, userId)));

  await promoteWaitlist(sessionId);
  touch(s.code);
  return { ok: true, message: "Booking cancelled" };
}

/** Pull the top of the waitlist into any free slot and renumber the rest. */
export async function promoteWaitlist(sessionId: string) {
  const s = await sessionById(sessionId);
  if (!s) return { ok: false };

  const all = await db.select().from(bookings).where(eq(bookings.sessionId, sessionId));
  const confirmed = all.filter((b) => b.status === "confirmed");
  const waiting = all
    .filter((b) => b.status === "waitlisted")
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));

  let free = s.capacity - confirmed.length;
  const promoted: string[] = [];
  for (const b of waiting) {
    if (free <= 0) break;
    await db
      .update(bookings)
      .set({ status: "confirmed", waitlistPosition: null })
      .where(eq(bookings.id, b.id));
    await db
      .insert(payments)
      .values({ id: newId("pay"), sessionId, userId: b.userId, amount: s.fee, status: "unpaid" })
      .onConflictDoNothing();
    promoted.push(b.userId);
    free--;
  }

  const stillWaiting = waiting.filter((b) => !promoted.includes(b.userId));
  for (let i = 0; i < stillWaiting.length; i++)
    await db
      .update(bookings)
      .set({ waitlistPosition: i + 1 })
      .where(eq(bookings.id, stillWaiting[i].id));

  if (promoted.length)
    await notify(
      promoted,
      sessionId,
      "waitlist",
      `A slot opened up. You are confirmed for ${s.name}.`,
    );

  touch(s.code);
  return { ok: true, message: promoted.length ? `${promoted.length} promoted` : undefined };
}

export async function markNoShow(sessionId: string, userId: string) {
  await db
    .update(bookings)
    .set({ status: "no_show" })
    .where(and(eq(bookings.sessionId, sessionId), eq(bookings.userId, userId)));
  await promoteWaitlist(sessionId);
  touch();
  return { ok: true };
}

/* -------------------------------------------------------------- check-in */

export async function checkInPlayer(
  sessionId: string,
  userId: string,
  method: "qr" | "manual" | "self" = "manual",
  token?: string,
): Promise<Result> {
  const s = await sessionById(sessionId);
  if (!s) return { ok: false, message: "Session not found" };
  if (method === "qr" && (!token || !verifyCheckInToken(token, sessionId)))
    return { ok: false, message: "That QR code is not valid for this session" };

  const existing = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.sessionId, sessionId), eq(checkIns.userId, userId)));
  if (existing.length) {
    await db
      .update(checkIns)
      .set({ availability: "available", leftAt: null })
      .where(eq(checkIns.id, existing[0].id));
    touch(s.code);
    return { ok: true, message: "Already checked in" };
  }

  const now = new Date();

  // A walk-in who never booked still gets a booking row so the roster is whole.
  const booking = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), eq(bookings.userId, userId)));
  if (booking.length === 0) {
    await db.insert(bookings).values({
      id: newId("bkg"),
      sessionId,
      userId,
      status: "confirmed",
      bookedAt: now,
    });
  } else if (booking[0].status !== "confirmed") {
    await db
      .update(bookings)
      .set({ status: "confirmed", waitlistPosition: null })
      .where(eq(bookings.id, booking[0].id));
  }

  await db
    .insert(payments)
    .values({ id: newId("pay"), sessionId, userId, amount: s.fee, status: "unpaid" })
    .onConflictDoNothing();

  await db.insert(checkIns).values({
    id: newId("chk"),
    sessionId,
    userId,
    checkedInAt: now,
    method,
    availability: "available",
    consecutiveGames: 0,
  });

  if (s.status === "scheduled")
    await db.update(sessions).set({ status: "live" }).where(eq(sessions.id, sessionId));

  touch(s.code);
  return { ok: true, message: "Checked in" };
}

export async function setAvailability(
  sessionId: string,
  userId: string,
  availability: Availability,
) {
  const s = await sessionById(sessionId);
  const patch: Record<string, unknown> = {
    availability,
    leftAt: availability === "left" ? new Date() : null,
  };
  // Sitting out resets the back-to-back counter, which is the point of it.
  if (availability === "available") patch.consecutiveGames = 0;
  await db
    .update(checkIns)
    .set(patch)
    .where(and(eq(checkIns.sessionId, sessionId), eq(checkIns.userId, userId)));
  touch(s?.code);
  return { ok: true };
}

/* --------------------------------------------------------------- matches */

export async function assignCourt(input: {
  sessionId: string;
  court: number;
  teamA: string[];
  teamB: string[];
  mode: QueueMode;
  recommendedIds?: string[];
  autoStart?: boolean;
}): Promise<Result> {
  const s = await sessionById(input.sessionId);
  if (!s) return { ok: false, message: "Session not found" };

  const ids = [...input.teamA, ...input.teamB];
  if (ids.length !== 4) return { ok: false, message: "A doubles game needs exactly four players" };
  if (new Set(ids).size !== 4) return { ok: false, message: "A player cannot be on court twice" };

  const busy = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(
      and(
        eq(matches.sessionId, input.sessionId),
        inArray(matches.status, ["playing", "pending"]),
        inArray(matchPlayers.userId, ids),
      ),
    );
  if (busy.length) return { ok: false, message: "One of those players is already on a court" };

  const occupied = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.sessionId, input.sessionId),
        eq(matches.court, input.court),
        inArray(matches.status, ["playing", "pending"]),
      ),
    );
  if (occupied.length) return { ok: false, message: `Court ${input.court} is still busy` };

  const now = new Date();
  const matchId = newId("mtc");
  await db.insert(matches).values({
    id: matchId,
    sessionId: input.sessionId,
    court: input.court,
    status: input.autoStart ? "playing" : "pending",
    mode: input.mode,
    gameType: s.gameType,
    createdAt: now,
    startedAt: input.autoStart ? now : null,
  });
  await db.insert(matchPlayers).values([
    ...input.teamA.map((userId) => ({ id: newId("mp"), matchId, userId, team: "A" as const })),
    ...input.teamB.map((userId) => ({ id: newId("mp"), matchId, userId, team: "B" as const })),
  ]);

  // Silent override audit: what did the engine say, what did the coordinator do.
  const rec = input.recommendedIds ?? [];
  if (rec.length === 4) {
    const added = ids.filter((id) => !rec.includes(id));
    const removed = rec.filter((id) => !ids.includes(id));
    if (added.length || removed.length)
      await db.insert(overrides).values({
        id: newId("ovr"),
        sessionId: input.sessionId,
        matchId,
        recommended: rec,
        final: ids,
        addedIds: added,
        removedIds: removed,
        createdAt: now,
      });
  }

  await notify(ids, input.sessionId, "assigned", `You're up on Court ${input.court}.`);
  touch(s.code);
  return { ok: true, id: matchId };
}

export async function startMatch(matchId: string): Promise<Result> {
  const rows = await db.select().from(matches).where(eq(matches.id, matchId));
  const match = rows[0];
  if (!match) return { ok: false, message: "Match not found" };

  await db
    .update(matches)
    .set({ status: "playing", startedAt: new Date() })
    .where(eq(matches.id, matchId));

  const players = await db.select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
  await notify(
    players.map((p) => p.userId),
    match.sessionId,
    "started",
    `Your game on Court ${match.court} has started.`,
  );

  const s = await sessionById(match.sessionId);
  touch(s?.code);
  return { ok: true };
}

export async function finishMatch(
  matchId: string,
  score?: { a: number; b: number },
  enteredBy?: string,
): Promise<Result> {
  const rows = await db.select().from(matches).where(eq(matches.id, matchId));
  const match = rows[0];
  if (!match) return { ok: false, message: "Match not found" };

  const s = await sessionById(match.sessionId);
  if (!s) return { ok: false, message: "Session not found" };

  const now = new Date();
  await db
    .update(matches)
    .set({ status: "completed", finishedAt: now, startedAt: match.startedAt ?? now })
    .where(eq(matches.id, matchId));

  const players = await db.select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
  const playerIds = players.map((p) => p.userId);

  if (score) {
    const winner = score.a === score.b ? "none" : score.a > score.b ? "A" : "B";
    await db.insert(matchScores).values({
      id: newId("scr"),
      matchId,
      teamAScore: score.a,
      teamBScore: score.b,
      winner,
      enteredBy: enteredBy ?? null,
      enteredAt: now,
      confirmed: !(await requiresConfirmation(s.groupId)),
    });

    const userRows = await db.select().from(users).where(inArray(users.id, playerIds));
    const ratingInput = players.map((p) => {
      const u = userRows.find((x) => x.id === p.userId)!;
      return { id: u.id, rating: u.rating, ratingGames: u.ratingGames, team: p.team };
    });
    const next = updateRatings(ratingInput, score.a, score.b, s.pointsTo);
    for (const [id, rating] of Object.entries(next)) {
      const u = userRows.find((x) => x.id === id)!;
      await db
        .update(users)
        .set({ rating, ratingGames: u.ratingGames + 1 })
        .where(eq(users.id, id));
    }
  }

  // Players who just came off court: bump the back-to-back counter.
  await db
    .update(checkIns)
    .set({ lastFinishedAt: now, consecutiveGames: sql`${checkIns.consecutiveGames} + 1` })
    .where(and(eq(checkIns.sessionId, match.sessionId), inArray(checkIns.userId, playerIds)));

  // Everyone who sat this one out gets their counter walked back down.
  await db
    .update(checkIns)
    .set({ consecutiveGames: sql`greatest(0, ${checkIns.consecutiveGames} - 1)` })
    .where(
      and(
        eq(checkIns.sessionId, match.sessionId),
        eq(checkIns.availability, "available"),
        notInArray(checkIns.userId, playerIds),
      ),
    );

  touch(s.code);
  return { ok: true };
}

async function requiresConfirmation(groupId: string) {
  const rows = await db.select().from(groups).where(eq(groups.id, groupId));
  return Boolean(rows[0]?.settings?.requireScoreConfirmation);
}

export async function confirmScore(matchId: string) {
  await db.update(matchScores).set({ confirmed: true }).where(eq(matchScores.matchId, matchId));
  touch();
  return { ok: true };
}

export async function recordScore(matchId: string, a: number, b: number, enteredBy?: string) {
  const rows = await db.select().from(matchScores).where(eq(matchScores.matchId, matchId));
  const winner = a === b ? "none" : a > b ? "A" : "B";
  if (rows.length) {
    await db
      .update(matchScores)
      .set({ teamAScore: a, teamBScore: b, winner, enteredAt: new Date() })
      .where(eq(matchScores.id, rows[0].id));
  } else {
    await db.insert(matchScores).values({
      id: newId("scr"),
      matchId,
      teamAScore: a,
      teamBScore: b,
      winner,
      enteredBy: enteredBy ?? null,
      enteredAt: new Date(),
      confirmed: false,
    });
  }
  touch();
  return { ok: true };
}

export async function cancelMatch(matchId: string) {
  const rows = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!rows[0]) return { ok: false, message: "Match not found" };
  await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, matchId));
  const s = await sessionById(rows[0].sessionId);
  touch(s?.code);
  return { ok: true };
}

export async function swapMatchPlayer(matchId: string, outUserId: string, inUserId: string) {
  const rows = await db
    .select()
    .from(matchPlayers)
    .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, outUserId)));
  if (!rows[0]) return { ok: false, message: "Player is not in this game" };
  await db.update(matchPlayers).set({ userId: inUserId }).where(eq(matchPlayers.id, rows[0].id));
  touch();
  return { ok: true };
}

/* -------------------------------------------------------------- payments */

export async function recordPayment(
  sessionId: string,
  userId: string,
  status: "unpaid" | "paid" | "waived",
  method: PaymentMethod | null,
  recordedBy?: string,
): Promise<Result> {
  const s = await sessionById(sessionId);
  if (!s) return { ok: false, message: "Session not found" };

  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.sessionId, sessionId), eq(payments.userId, userId)));

  const patch = {
    status,
    method: status === "paid" ? method : null,
    paidAt: status === "unpaid" ? null : new Date(),
    recordedBy: recordedBy ?? null,
    amount: status === "waived" ? 0 : s.fee,
  };

  if (rows.length) await db.update(payments).set(patch).where(eq(payments.id, rows[0].id));
  else
    await db
      .insert(payments)
      .values({ id: newId("pay"), sessionId, userId, ...patch, amount: patch.amount });

  touch(s.code);
  return { ok: true };
}

/* ----------------------------------------------------------- preferences */

export async function addPreference(
  sessionId: string,
  kind: "pair" | "separate",
  userAId: string,
  userBId: string,
) {
  if (userAId === userBId) return { ok: false, message: "Pick two different players" };
  await db.insert(preferences).values({
    id: newId("prf"),
    sessionId,
    kind,
    userAId,
    userBId,
    createdAt: new Date(),
  });
  touch();
  return { ok: true };
}

export async function removePreference(preferenceId: string) {
  await db.delete(preferences).where(eq(preferences.id, preferenceId));
  touch();
  return { ok: true };
}

/* ---------------------------------------------------------- announcements */

const MAX_ANNOUNCEMENT = 1000;

/**
 * Posts a notice to the group, or to one session.
 *
 * Authorisation is the caller's job and is checked in the form action: this
 * takes an author id it trusts. Body length is capped here rather than only in
 * the form, because a server action is reachable without the form.
 */
export async function postAnnouncement(
  groupId: string,
  authorId: string,
  body: string,
  opts: { sessionId?: string | null; pinned?: boolean } = {},
): Promise<Result> {
  const text = body.trim();
  if (text.length < 2) return { ok: false, message: "Nothing to post" };
  if (text.length > MAX_ANNOUNCEMENT)
    return { ok: false, message: `Keep it under ${MAX_ANNOUNCEMENT} characters` };

  await db.insert(announcements).values({
    id: newId("ann"),
    groupId,
    sessionId: opts.sessionId || null,
    authorId,
    body: text,
    pinned: Boolean(opts.pinned),
    createdAt: new Date(),
  });
  touch();
  return { ok: true };
}

export async function deleteAnnouncement(announcementId: string): Promise<Result> {
  // Read receipts reference the announcement, so they go first — the HTTP
  // driver has no interactive transactions, and a stranded receipt would
  // block the delete rather than being cleaned up later.
  await db.delete(announcementReads).where(eq(announcementReads.announcementId, announcementId));
  await db.delete(announcements).where(eq(announcements.id, announcementId));
  touch();
  return { ok: true };
}

export async function setAnnouncementPinned(announcementId: string, pinned: boolean) {
  await db.update(announcements).set({ pinned }).where(eq(announcements.id, announcementId));
  touch();
  return { ok: true };
}

/**
 * Records that somebody has seen these.
 *
 * Idempotent by way of the unique index: opening the same page twice inserts
 * nothing the second time rather than erroring or double-counting.
 */
export async function markAnnouncementsRead(ids: string[], userId: string) {
  if (!ids.length || !userId) return { ok: true };
  const now = new Date();
  await db
    .insert(announcementReads)
    .values(ids.map((announcementId) => ({ id: newId("anr"), announcementId, userId, readAt: now })))
    .onConflictDoNothing();
  return { ok: true };
}
