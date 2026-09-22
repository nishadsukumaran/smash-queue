import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateEvents } from "@/db/schema";
import { newId } from "@/lib/ids";

/**
 * Counting misses so short codes can't be guessed.
 *
 * An invite code is four characters. That is fine for a person reading it
 * off a WhatsApp message and hopeless against a script, so every wrong code
 * an account types is written down, and past a handful an hour the door
 * stops answering for that account.
 */

export const JOIN_MISSES_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;

export const joinKey = (userId: string) => `join:${userId}`;

export async function overLimit(key: string, limit: number, windowMs = HOUR) {
  const since = new Date(Date.now() - windowMs);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateEvents)
    .where(and(eq(rateEvents.key, key), gte(rateEvents.createdAt, since)));
  return (row?.n ?? 0) >= limit;
}

export async function recordMiss(key: string) {
  await db.insert(rateEvents).values({ id: newId("rte"), key, createdAt: new Date() });
}

/** Daily purge: nothing here matters after a day. */
export async function pruneRateEvents(now = new Date()) {
  await db.delete(rateEvents).where(lt(rateEvents.createdAt, new Date(now.getTime() - 24 * HOUR)));
}
