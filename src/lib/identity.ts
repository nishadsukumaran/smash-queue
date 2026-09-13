import "server-only";
import { cookies } from "next/headers";

const UID = "bq_uid";
const STAFF = "bq_staff";
const YEAR = 60 * 60 * 24 * 365;

export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(UID)?.value ?? null;
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

export async function isStaffFor(groupId: string) {
  return (await staffGroups()).includes(groupId);
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
