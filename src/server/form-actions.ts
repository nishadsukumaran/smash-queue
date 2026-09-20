"use server";

/**
 * Thin FormData wrappers around the typed actions in ./actions.
 * Keeping them separate means every page can post a plain <form> and still
 * work with JavaScript switched off, which matters in a sports hall.
 */

import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/identity";
import type { GameType, PaymentMethod, QueueMode } from "@/db/schema";
import * as a from "./actions";
import type { RegisterState } from "./register-types";

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
  const userId = str(fd, "userId") || (await currentUserId());
  if (userId) await a.bookSlot(str(fd, "sessionId"), userId);
}

export async function cancelAction(fd: FormData) {
  const userId = str(fd, "userId") || (await currentUserId());
  if (userId) await a.cancelBooking(str(fd, "sessionId"), userId);
}

export async function checkInAction(fd: FormData) {
  const userId = str(fd, "userId") || (await currentUserId());
  if (!userId) return;
  const method = (str(fd, "method") || "manual") as "qr" | "manual" | "self";
  await a.checkInPlayer(str(fd, "sessionId"), userId, method, str(fd, "token") || undefined);
}

export async function availabilityAction(fd: FormData) {
  const userId = str(fd, "userId") || (await currentUserId());
  if (!userId) return;
  await a.setAvailability(
    str(fd, "sessionId"),
    userId,
    str(fd, "availability") as "available" | "resting" | "left",
  );
}

export async function noShowAction(fd: FormData) {
  await a.markNoShow(str(fd, "sessionId"), str(fd, "userId"));
}

export async function promoteAction(fd: FormData) {
  await a.promoteWaitlist(str(fd, "sessionId"));
}

export async function assignCourtAction(fd: FormData) {
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
  await a.startMatch(str(fd, "matchId"));
}

export async function finishMatchAction(fd: FormData) {
  const rawA = str(fd, "scoreA");
  const rawB = str(fd, "scoreB");
  const score = rawA !== "" && rawB !== "" ? { a: Number(rawA), b: Number(rawB) } : undefined;
  await a.finishMatch(str(fd, "matchId"), score, (await currentUserId()) ?? undefined);
}

export async function cancelMatchAction(fd: FormData) {
  await a.cancelMatch(str(fd, "matchId"));
}

export async function swapPlayerAction(fd: FormData) {
  await a.swapMatchPlayer(str(fd, "matchId"), str(fd, "outUserId"), str(fd, "inUserId"));
}

export async function scoreAction(fd: FormData) {
  await a.recordScore(
    str(fd, "matchId"),
    num(fd, "scoreA"),
    num(fd, "scoreB"),
    (await currentUserId()) ?? undefined,
  );
}

export async function confirmScoreAction(fd: FormData) {
  await a.confirmScore(str(fd, "matchId"));
}

export async function paymentAction(fd: FormData) {
  await a.recordPayment(
    str(fd, "sessionId"),
    str(fd, "userId"),
    str(fd, "status") as "unpaid" | "paid" | "waived",
    (str(fd, "method") || null) as PaymentMethod | null,
    (await currentUserId()) ?? undefined,
  );
}

export async function preferenceAction(fd: FormData) {
  await a.addPreference(
    str(fd, "sessionId"),
    str(fd, "kind") as "pair" | "separate",
    str(fd, "userAId"),
    str(fd, "userBId"),
  );
}

export async function removePreferenceAction(fd: FormData) {
  await a.removePreference(str(fd, "preferenceId"));
}

export async function createSessionAction(fd: FormData) {
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
  await a.startSession(str(fd, "sessionId"));
}

export async function closeSessionAction(fd: FormData) {
  const res = await a.closeSession(str(fd, "sessionId"));
  if (res.ok) redirect(`/s/${str(fd, "code")}/summary`);
}

export async function addCostAction(fd: FormData) {
  await a.addSessionCost(str(fd, "sessionId"), str(fd, "label"), num(fd, "amount"));
}

export async function removeCostAction(fd: FormData) {
  await a.removeSessionCost(str(fd, "costId"));
}

export async function registerPlayerAction(
  _prev: RegisterState,
  fd: FormData,
): Promise<RegisterState> {
  const res = await a.registerPlayer(str(fd, "groupId"), str(fd, "name"), str(fd, "phone"));
  if (res.ok) redirect(str(fd, "next") || "/");
  return { ok: false, message: res.message, duplicate: res.duplicate };
}

export async function updateGroupAction(fd: FormData) {
  await a.updateGroup(str(fd, "groupId"), {
    name: str(fd, "name"),
    location: str(fd, "location"),
    defaultFee: fd.get("defaultFee") !== null ? num(fd, "defaultFee", 0) : undefined,
    staffPin: str(fd, "staffPin") || undefined,
  });
}

export async function selfSignupAction(fd: FormData) {
  await a.setSelfSignup(str(fd, "groupId"), str(fd, "allow") === "1");
}

export async function addMemberAction(fd: FormData) {
  await a.addMember(str(fd, "groupId"), str(fd, "name"), str(fd, "phone"), num(fd, "rating", 1200));
}

export async function memberRoleAction(fd: FormData) {
  await a.setMemberRole(
    str(fd, "membershipId"),
    str(fd, "role") as "player" | "coordinator" | "organizer",
  );
}

export async function memberActiveAction(fd: FormData) {
  await a.setMemberActive(str(fd, "membershipId"), str(fd, "active") === "1");
}

export async function addVenueAction(fd: FormData) {
  await a.addVenue(
    str(fd, "groupId"),
    str(fd, "name"),
    str(fd, "address"),
    num(fd, "courtCount", 4),
    str(fd, "latitude") || undefined,
    str(fd, "longitude") || undefined,
  );
}
