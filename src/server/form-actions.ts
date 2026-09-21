"use server";

/**
 * Thin FormData wrappers around the typed actions in ./actions.
 * Keeping them separate means every page can post a plain <form> and still
 * work with JavaScript switched off, which matters in a sports hall.
 */

import { redirect } from "next/navigation";
import { currentUserId, isStaffFor } from "@/lib/identity";
import { canOrganize, canStaff, currentAccount } from "@/lib/auth";
import type { GameType, PaymentMethod, QueueMode } from "@/db/schema";
import * as a from "./actions";
import type { RegisterState } from "./register-types";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  announcements, groupMembers, matches, preferences, sessionCosts, sessions,
} from "@/db/schema";

/* ------------------------------------------------------------ guards */

/*
 * Every action below is a public endpoint: Next will run it for anybody who
 * posts the right form, whether or not they were ever shown the button. So
 * each one resolves the community its target belongs to and checks the caller
 * against *that* community, never against whichever one their screen had
 * open. With more than one community on the deployment, an action that
 * trusted its hidden groupId field would let an organizer of one reach into
 * another.
 */

async function groupOfSession(sessionId: string) {
  const [row] = await db.select({ g: sessions.groupId }).from(sessions).where(eq(sessions.id, sessionId));
  return row?.g ?? null;
}

async function groupOfMatch(matchId: string) {
  const [row] = await db
    .select({ g: sessions.groupId })
    .from(matches)
    .innerJoin(sessions, eq(sessions.id, matches.sessionId))
    .where(eq(matches.id, matchId));
  return row?.g ?? null;
}

async function groupOfMembership(membershipId: string) {
  const [row] = await db
    .select({ g: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.id, membershipId));
  return row?.g ?? null;
}

async function groupOfCost(costId: string) {
  const [row] = await db
    .select({ g: sessions.groupId })
    .from(sessionCosts)
    .innerJoin(sessions, eq(sessions.id, sessionCosts.sessionId))
    .where(eq(sessionCosts.id, costId));
  return row?.g ?? null;
}

async function groupOfPreference(preferenceId: string) {
  const [row] = await db
    .select({ g: sessions.groupId })
    .from(preferences)
    .innerJoin(sessions, eq(sessions.id, preferences.sessionId))
    .where(eq(preferences.id, preferenceId));
  return row?.g ?? null;
}

async function announcementIn(groupId: string, announcementId: string) {
  const [row] = await db
    .select({ g: announcements.groupId })
    .from(announcements)
    .where(eq(announcements.id, announcementId));
  return row?.g === groupId;
}

/** Coordinator-level: a staff account here, or this community's PIN on this phone. */
async function isStaff(groupId: string | null) {
  if (!groupId) return false;
  return canStaff(await currentAccount(), groupId) || (await isStaffFor(groupId));
}

/** Organizer-level: an account that runs this community. The PIN is not enough. */
async function isOrganizer(groupId: string | null) {
  if (!groupId) return false;
  return canOrganize(await currentAccount(), groupId);
}

/** Active member of the community — what booking and self check-in require. */
async function isMember(groupId: string | null, userId: string) {
  if (!groupId) return false;
  const [row] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    );
  return Boolean(row);
}

/**
 * Who a player action is for. Yourself, always; somebody else, only if you
 * are staff for that session's community. Returns null when refused.
 */
async function actingFor(fd: FormData, groupId: string | null): Promise<string | null> {
  const me = await currentUserId();
  const target = str(fd, "userId") || me;
  if (!target) return null;
  if (target !== me && !(await isStaff(groupId))) return null;
  if (!(await isMember(groupId, target))) return null;
  return target;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, fallback = 0) => {
  const v = Number(fd.get(k));
  return Number.isFinite(v) ? v : fallback;
};
const list = (fd: FormData, k: string) => str(fd, k).split(",").filter(Boolean);

export async function identityAction(fd: FormData) {
  await a.selectIdentity(str(fd, "userId"));
  const next = str(fd, "next");
  if (next) redirect(next);
}

export async function signOutAction() {
  await a.signOutIdentity();
  redirect("/");
}

export async function pinAction(fd: FormData) {
  const res = await a.unlockStaff(str(fd, "groupId"), str(fd, "pin"));
  const next = str(fd, "next");
  if (res.ok && next) redirect(next);
}

export async function lockAction() {
  await a.lockStaff();
  redirect("/");
}

export async function joinAction(fd: FormData) {
  const sessionId = str(fd, "sessionId");
  const userId = await actingFor(fd, await groupOfSession(sessionId));
  if (userId) await a.bookSlot(sessionId, userId);
}

export async function cancelAction(fd: FormData) {
  const sessionId = str(fd, "sessionId");
  const userId = await actingFor(fd, await groupOfSession(sessionId));
  if (userId) await a.cancelBooking(sessionId, userId);
}

export async function checkInAction(fd: FormData) {
  const userId = await actingFor(fd, await groupOfSession(str(fd, "sessionId")));
  if (!userId) return;
  const method = (str(fd, "method") || "manual") as "qr" | "manual" | "self";
  await a.checkInPlayer(str(fd, "sessionId"), userId, method, str(fd, "token") || undefined);
}

export async function availabilityAction(fd: FormData) {
  const userId = await actingFor(fd, await groupOfSession(str(fd, "sessionId")));
  if (!userId) return;
  await a.setAvailability(
    str(fd, "sessionId"),
    userId,
    str(fd, "availability") as "available" | "resting" | "left",
  );
}

export async function noShowAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  await a.markNoShow(str(fd, "sessionId"), str(fd, "userId"));
}

export async function promoteAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  await a.promoteWaitlist(str(fd, "sessionId"));
}

export async function assignCourtAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  await a.assignCourt({
    sessionId: str(fd, "sessionId"),
    court: num(fd, "court", 1),
    teamA: list(fd, "teamA"),
    teamB: list(fd, "teamB"),
    mode: (str(fd, "mode") || "assisted") as QueueMode,
    recommendedIds: list(fd, "recommended"),
    autoStart: str(fd, "autoStart") === "1",
  });
}

export async function startMatchAction(fd: FormData) {
  if (!(await isStaff(await groupOfMatch(str(fd, "matchId"))))) return;
  await a.startMatch(str(fd, "matchId"));
}

export async function finishMatchAction(fd: FormData) {
  {
    const g = await groupOfMatch(str(fd, "matchId"));
    const me = await currentUserId();
    if (!(await isStaff(g)) && !(me && (await isMember(g, me)))) return;
  }
  const rawA = str(fd, "scoreA");
  const rawB = str(fd, "scoreB");
  const score = rawA !== "" && rawB !== "" ? { a: Number(rawA), b: Number(rawB) } : undefined;
  await a.finishMatch(str(fd, "matchId"), score, (await currentUserId()) ?? undefined);
}

export async function cancelMatchAction(fd: FormData) {
  if (!(await isStaff(await groupOfMatch(str(fd, "matchId"))))) return;
  await a.cancelMatch(str(fd, "matchId"));
}

export async function swapPlayerAction(fd: FormData) {
  if (!(await isStaff(await groupOfMatch(str(fd, "matchId"))))) return;
  await a.swapMatchPlayer(str(fd, "matchId"), str(fd, "outUserId"), str(fd, "inUserId"));
}

export async function scoreAction(fd: FormData) {
  {
    const g = await groupOfMatch(str(fd, "matchId"));
    const me = await currentUserId();
    if (!(await isStaff(g)) && !(me && (await isMember(g, me)))) return;
  }
  await a.recordScore(
    str(fd, "matchId"),
    num(fd, "scoreA"),
    num(fd, "scoreB"),
    (await currentUserId()) ?? undefined,
  );
}

export async function confirmScoreAction(fd: FormData) {
  if (!(await isStaff(await groupOfMatch(str(fd, "matchId"))))) return;
  await a.confirmScore(str(fd, "matchId"));
}

export async function paymentAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  await a.recordPayment(
    str(fd, "sessionId"),
    str(fd, "userId"),
    str(fd, "status") as "unpaid" | "paid" | "waived",
    (str(fd, "method") || null) as PaymentMethod | null,
    (await currentUserId()) ?? undefined,
  );
}

export async function preferenceAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  await a.addPreference(
    str(fd, "sessionId"),
    str(fd, "kind") as "pair" | "separate",
    str(fd, "userAId"),
    str(fd, "userBId"),
  );
}

export async function removePreferenceAction(fd: FormData) {
  if (!(await isStaff(await groupOfPreference(str(fd, "preferenceId"))))) return;
  await a.removePreference(str(fd, "preferenceId"));
}

export async function createSessionAction(fd: FormData) {
  if (!(await isOrganizer(str(fd, "groupId")))) return;
  const res = await a.createSession({
    groupId: str(fd, "groupId"),
    venueId: str(fd, "venueId") || null,
    name: str(fd, "name"),
    date: str(fd, "date"),
    startTime: str(fd, "startTime"),
    endTime: str(fd, "endTime"),
    courtCount: num(fd, "courtCount", 4),
    capacity: num(fd, "capacity", 24),
    fee: num(fd, "fee", 40),
    notes: str(fd, "notes"),
    gameType: (str(fd, "gameType") || "balanced") as GameType,
    pointsTo: num(fd, "pointsTo", 30),
  });
  if (res.ok) redirect("/admin");
}

export async function sessionSettingsAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  const patch: Record<string, unknown> = {};
  if (fd.get("courtCount")) patch.courtCount = num(fd, "courtCount", 4);
  if (fd.get("capacity")) patch.capacity = num(fd, "capacity", 24);
  if (fd.get("fee") !== null) patch.fee = num(fd, "fee", 0);
  if (fd.get("gameType")) patch.gameType = str(fd, "gameType") as GameType;
  if (fd.get("queueMode")) patch.queueMode = str(fd, "queueMode") as QueueMode;
  if (fd.get("endTime")) patch.endTime = str(fd, "endTime");
  await a.updateSessionSettings(str(fd, "sessionId"), patch);
}

export async function startSessionAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  await a.startSession(str(fd, "sessionId"));
}

export async function closeSessionAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  const res = await a.closeSession(str(fd, "sessionId"));
  if (res.ok) redirect(`/s/${str(fd, "code")}/summary`);
}

export async function addCostAction(fd: FormData) {
  if (!(await isStaff(await groupOfSession(str(fd, "sessionId"))))) return;
  await a.addSessionCost(str(fd, "sessionId"), str(fd, "label"), num(fd, "amount"));
}

export async function removeCostAction(fd: FormData) {
  if (!(await isStaff(await groupOfCost(str(fd, "costId"))))) return;
  await a.removeSessionCost(str(fd, "costId"));
}

export async function registerPlayerAction(
  _prev: RegisterState,
  fd: FormData,
): Promise<RegisterState> {
  const res = await a.registerPlayer(
    str(fd, "groupId"),
    str(fd, "name"),
    str(fd, "phone"),
    str(fd, "note"),
  );
  // A pending request must not bounce them into the session — they are not in
  // it yet. Hold them on the form so it can say what happens next.
  if (res.ok && !res.pending) redirect(str(fd, "next") || "/");
  if (res.ok && res.pending) return { ok: true, pending: true, message: res.message };
  return { ok: false, message: res.message, duplicate: res.duplicate };
}

export async function decideJoinAction(fd: FormData) {
  const account = await currentAccount();
  const groupId = str(fd, "groupId");
  // Only an organizer of this group decides who is in it. Without this the
  // action is reachable by anyone who can post a form.
  if (!canOrganize(account, groupId)) return;
  if ((await groupOfMembership(str(fd, "membershipId"))) !== groupId) return;
  await a.decideJoinRequest(
    str(fd, "membershipId"),
    str(fd, "decision") === "approve" ? "approve" : "decline",
    account?.id ?? null,
  );
}

export async function setJoinPolicyAction(fd: FormData) {
  const groupId = str(fd, "groupId");
  if (!canOrganize(await currentAccount(), groupId)) return;
  await a.setJoinPolicy(groupId, str(fd, "policy") as "open" | "approval" | "closed");
}

export async function updateGroupAction(fd: FormData) {
  if (!(await isOrganizer(str(fd, "groupId")))) return;
  await a.updateGroup(str(fd, "groupId"), {
    name: str(fd, "name"),
    location: str(fd, "location"),
    defaultFee: fd.get("defaultFee") !== null ? num(fd, "defaultFee", 0) : undefined,
    staffPin: str(fd, "staffPin") || undefined,
  });
}

export async function selfSignupAction(fd: FormData) {
  if (!(await isOrganizer(str(fd, "groupId")))) return;
  await a.setSelfSignup(str(fd, "groupId"), str(fd, "allow") === "1");
}

export async function addMemberAction(fd: FormData) {
  if (!(await isOrganizer(str(fd, "groupId")))) return;
  await a.addMember(str(fd, "groupId"), str(fd, "name"), str(fd, "phone"), num(fd, "rating", 1200));
}

export async function memberRoleAction(fd: FormData) {
  if (!(await isOrganizer(await groupOfMembership(str(fd, "membershipId"))))) return;
  await a.setMemberRole(
    str(fd, "membershipId"),
    str(fd, "role") as "player" | "coordinator" | "organizer",
  );
}

export async function memberActiveAction(fd: FormData) {
  if (!(await isOrganizer(await groupOfMembership(str(fd, "membershipId"))))) return;
  await a.setMemberActive(str(fd, "membershipId"), str(fd, "active") === "1");
}

export async function addVenueAction(fd: FormData) {
  if (!(await isOrganizer(str(fd, "groupId")))) return;
  await a.addVenue(
    str(fd, "groupId"),
    str(fd, "name"),
    str(fd, "address"),
    num(fd, "courtCount", 4),
    str(fd, "latitude") || undefined,
    str(fd, "longitude") || undefined,
  );
}

/* ---------------------------------------------------------- announcements */

/**
 * Only staff for that group may post. The check is here rather than in the
 * action because this is the reachable surface: a server action can be
 * invoked without ever rendering the form that hides the button.
 */
export async function postAnnouncementAction(fd: FormData) {
  const groupId = str(fd, "groupId");
  const account = await currentAccount();

  // A coordinator running tonight may be on the PIN rather than an account,
  // so either proves they are staff. The author recorded is whoever we can
  // actually name: an account if there is one, else the identity on the phone.
  const staff = canStaff(account, groupId) || (await isStaffFor(groupId));
  if (!staff) return;

  const authorId = account?.id ?? (await currentUserId());
  if (!authorId) return;

  // A session id from another community would pin this notice to a night
  // this author has no say over.
  const sessionId = str(fd, "sessionId");
  if (sessionId && (await groupOfSession(sessionId)) !== groupId) return;

  await a.postAnnouncement(groupId, authorId, str(fd, "body"), {
    sessionId: str(fd, "sessionId") || null,
    pinned: str(fd, "pinned") === "1",
  });
}

export async function deleteAnnouncementAction(fd: FormData) {
  const groupId = str(fd, "groupId");
  if (!canStaff(await currentAccount(), groupId) && !(await isStaffFor(groupId))) return;
  if (!(await announcementIn(groupId, str(fd, "announcementId")))) return;
  await a.deleteAnnouncement(str(fd, "announcementId"));
}

export async function pinAnnouncementAction(fd: FormData) {
  const groupId = str(fd, "groupId");
  if (!canStaff(await currentAccount(), groupId) && !(await isStaffFor(groupId))) return;
  if (!(await announcementIn(groupId, str(fd, "announcementId")))) return;
  await a.setAnnouncementPinned(str(fd, "announcementId"), str(fd, "pinned") === "1");
}
