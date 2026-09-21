"use server";

/**
 * Registering a browser for notifications. Tied to the signed-in account:
 * notifications are about your bookings, your court, your communities, so
 * there has to be a "you" for them to be about.
 */

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { newId } from "@/lib/ids";
import { sessionUserId } from "@/lib/auth";
import { pushNow } from "@/lib/push";

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

const isPushEndpoint = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && u.length < 1024;
  } catch {
    return false;
  }
};

export async function savePushSubscription(sub: Subscription): Promise<{ ok: boolean }> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false };
  if (!sub?.endpoint || !isPushEndpoint(sub.endpoint)) return { ok: false };
  if (!sub.keys?.p256dh || !sub.keys?.auth) return { ok: false };
  if (sub.keys.p256dh.length > 200 || sub.keys.auth.length > 100) return { ok: false };

  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, sub.endpoint));

  if (existing) {
    // Same browser, maybe a different person signed in on it now: it belongs
    // to whoever is signed in, never to both.
    await db
      .update(pushSubscriptions)
      .set({ userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: ua })
      .where(eq(pushSubscriptions.id, existing.id));
  } else {
    await db.insert(pushSubscriptions).values({
      id: newId("psh"),
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: ua,
      createdAt: new Date(),
    });
  }
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const userId = await sessionUserId();
  if (!userId || !endpoint) return { ok: false };
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
  return { ok: true };
}

/** "Send me a test" — the only way to know it works before Saturday. */
export async function sendTestPush(): Promise<{ ok: boolean; sent: number }> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, sent: 0 };
  const { sent } = await pushNow([userId], {
    title: "Notifications are on",
    body: "This is what it looks like when you're up next.",
    url: "/me",
    tag: "test",
  });
  return { ok: sent > 0, sent };
}
