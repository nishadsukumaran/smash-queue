import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { isRegistered, sessionUserId } from "@/lib/auth";

const UID = "bq_uid";
const STAFF = "bq_staff";
const YEAR = 60 * 60 * 24 * 365;

/**
 * The player this browser is acting as.
 *
 * A signed-in account always wins. Without one, the phone's `bq_uid` cookie
 * still identifies players who have never registered — roster entries and
 * walk-ins — exactly as before.
 *
 * But a cookie naming a *registered* player is ignored unless that player is
 * signed in. That single rule is the name lock: once somebody registers, you
 * cannot book, cancel or score as them by tapping their name any more.
 */
export async function currentUserId(): Promise<string | null> {
  const signedIn = await sessionUserId();
  if (signedIn) return signedIn;

  const jar = await cookies();
  const uid = jar.get(UID)?.value ?? null;
  if (!uid) return null;
  if (await isRegistered(uid)) return null;
  return uid;
}

export async function setCurrentUserId(userId: string) {
  const jar = await cookies();
  jar.set(UID, userId, { path: "/", maxAge: YEAR, sameSite: "lax" });
}

export async function clearCurrentUser() {
  const jar = await cookies();
  jar.delete(UID);
}

export async function staffGroups(): Promise<string[]> {
  const jar = await cookies();
  return (jar.get(STAFF)?.value ?? "").split(",").filter(Boolean);
}

/**
 * Unlocked with the community's shared coordinator PIN on this phone — and
 * that PIN is still switched on. An owner turning the PIN off revokes every
 * phone unlocked with it at once, without anyone having to find those phones.
 */
export async function isStaffFor(groupId: string) {
  if (!(await staffGroups()).includes(groupId)) return false;
  const [group] = await db
    .select({ settings: groups.settings })
    .from(groups)
    .where(eq(groups.id, groupId));
  return Boolean(group) && group.settings?.pinDisabled !== true;
}

export async function grantStaff(groupId: string) {
  const jar = await cookies();
  const next = Array.from(new Set([...(await staffGroups()), groupId]));
  jar.set(STAFF, next.join(","), { path: "/", maxAge: YEAR, sameSite: "lax" });
}

export async function revokeStaff() {
  const jar = await cookies();
  jar.delete(STAFF);
}
