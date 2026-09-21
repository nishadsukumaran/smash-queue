import "server-only";
import webpush from "web-push";
import { after } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

/**
 * Push notifications: the reason a phone buzzes when it's your turn.
 *
 * Sent with `after()`, so a coordinator tapping "Start game" never waits on
 * four push services on the other side of the world. And every failure is
 * swallowed: a notification that doesn't arrive is a shame, an action that
 * fails because of one is a bug.
 *
 * Only ever sent about things a member asked for or their community's
 * organizers did — a session they booked, a court they were put on, a notice
 * posted to their community, an invitation addressed to them. That is the
 * promise in the ownership notice, and this module is where it would be
 * easiest to break.
 */

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping it goes. Same-site path. */
  url?: string;
  /** Same tag replaces an earlier notification instead of stacking another. */
  tag?: string;
};

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@aiops.ae";

export const pushConfigured = () => Boolean(PUBLIC && PRIVATE);

let ready = false;
function configure() {
  if (ready || !pushConfigured()) return ready;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  ready = true;
  return ready;
}

/** Sends now. Callers inside a request should use `pushLater` instead. */
export async function pushNow(userIds: string[], message: PushMessage) {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0 || !configure()) return { sent: 0 };

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, ids));

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url && message.url.startsWith("/") ? message.url : "/",
    tag: message.tag,
  });

  let sent = 0;
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60, timeout: 8000, urgency: "high" },
        );
        sent++;
        await db
          .update(pushSubscriptions)
          .set({ lastSentAt: new Date() })
          .where(eq(pushSubscriptions.id, s.id));
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Gone for good: the browser unsubscribed or the app was removed.
        if (code === 404 || code === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        }
      }
    }),
  );
  return { sent };
}

/** Queues a push to go out after the response. Never throws, never waits. */
export function pushLater(userIds: string[], message: PushMessage) {
  if (!pushConfigured() || userIds.length === 0) return;
  try {
    after(async () => {
      try {
        await pushNow(userIds, message);
      } catch {
        // A lost notification must never become a failed action.
      }
    });
  } catch {
    // Outside a request (scripts, tests): nothing to defer to, so skip.
  }
}
