import "server-only";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  announcementReads, announcements, authEmails, bookings, checkIns, communityRequests,
  groupInvites, groupMembers, groups, matchPlayers, matchScores, matches, notifications,
  overrides, payments, preferences, roleRequests, sessionCosts, sessions, trustedDevices, users,
  venues,
} from "@/db/schema";

/**
 * Permanent removal of communities their owners deleted more than 30 days ago.
 *
 * Children first, because the foreign keys are real. Every step is an
 * idempotent delete, so if a run dies halfway — the HTTP driver has no
 * transactions — the next run simply carries on from where it stopped.
 *
 * People are not the community's to delete, with one exception: roster
 * entries that never registered and now belong to no community at all. Those
 * were the owner's data (a name they typed in), and leaving them behind would
 * be keeping a deleted community's roster by another name.
 */
export const RECOVERY_DAYS = 30;

export async function purgeExpiredCommunities(now = new Date()) {
  const cutoff = new Date(now.getTime() - RECOVERY_DAYS * 86_400_000);
  const due = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(isNotNull(groups.deletedAt), lt(groups.deletedAt, cutoff)));

  const purged: string[] = [];
  for (const { id } of due) {
    await purgeCommunity(id);
    purged.push(id);
  }
  return purged;
}

export async function purgeCommunity(groupId: string) {
  const sessionIds = (
    await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.groupId, groupId))
  ).map((r) => r.id);
  const matchIds = sessionIds.length
    ? (
        await db.select({ id: matches.id }).from(matches).where(inArray(matches.sessionId, sessionIds))
      ).map((r) => r.id)
    : [];
  const annIds = (
    await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(eq(announcements.groupId, groupId))
  ).map((r) => r.id);
  const memberIds = (
    await db
      .select({ id: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
  ).map((r) => r.id);

  if (annIds.length)
    await db.delete(announcementReads).where(inArray(announcementReads.announcementId, annIds));
  await db.delete(announcements).where(eq(announcements.groupId, groupId));
  await db.delete(groupInvites).where(eq(groupInvites.groupId, groupId));
  await db.delete(roleRequests).where(eq(roleRequests.groupId, groupId));
  await db
    .update(communityRequests)
    .set({ groupId: null })
    .where(eq(communityRequests.groupId, groupId));

  if (sessionIds.length) {
    await db.delete(notifications).where(inArray(notifications.sessionId, sessionIds));
    await db.delete(overrides).where(inArray(overrides.sessionId, sessionIds));
    await db.delete(preferences).where(inArray(preferences.sessionId, sessionIds));
    await db.delete(sessionCosts).where(inArray(sessionCosts.sessionId, sessionIds));
    await db.delete(payments).where(inArray(payments.sessionId, sessionIds));
    if (matchIds.length) {
      await db.delete(matchScores).where(inArray(matchScores.matchId, matchIds));
      await db.delete(matchPlayers).where(inArray(matchPlayers.matchId, matchIds));
      await db.delete(matches).where(inArray(matches.id, matchIds));
    }
    await db.delete(checkIns).where(inArray(checkIns.sessionId, sessionIds));
    await db.delete(bookings).where(inArray(bookings.sessionId, sessionIds));
    await db.delete(sessions).where(inArray(sessions.id, sessionIds));
  }

  await db.delete(venues).where(eq(venues.groupId, groupId));
  await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));

  // groups.owner_id points at a user; the row goes before any user can.
  await db.delete(groups).where(eq(groups.id, groupId));

  await removeOrphanedRosterEntries(memberIds);
}

/**
 * Unregistered names that now belong to no community. Anything still
 * referenced elsewhere is left alone — a failed delete here means somebody
 * else's data points at them, which is a reason to keep them, not an error.
 */
async function removeOrphanedRosterEntries(candidateIds: string[]) {
  if (candidateIds.length === 0) return;
  const stillMembers = (
    await db
      .select({ id: groupMembers.userId })
      .from(groupMembers)
      .where(inArray(groupMembers.userId, candidateIds))
  ).map((r) => r.id);
  const registered = (
    await db
      .select({ id: authEmails.userId })
      .from(authEmails)
      .where(inArray(authEmails.userId, candidateIds))
  ).map((r) => r.id);
  const keep = new Set([...stillMembers, ...registered]);
  const orphans = candidateIds.filter((id) => !keep.has(id));

  for (const id of orphans) {
    try {
      await db.delete(trustedDevices).where(eq(trustedDevices.userId, id));
      await db.delete(users).where(eq(users.id, id));
    } catch {
      // Referenced from somewhere else. Keeping them is the safe answer.
    }
  }
}
