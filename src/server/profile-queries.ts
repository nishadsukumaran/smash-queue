import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { preferredPartners, users } from "@/db/schema";

export async function getProfile(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return u ?? null;
}

/** The player's own partner list, oldest first. Only ever shown to them. */
export async function myPreferredPartners(userId: string) {
  return db
    .select({ id: users.id, name: users.name, playerNo: users.playerNo, gender: users.gender, level: users.level })
    .from(preferredPartners)
    .innerJoin(users, eq(users.id, preferredPartners.partnerId))
    .where(eq(preferredPartners.userId, userId))
    .orderBy(asc(preferredPartners.createdAt));
}
