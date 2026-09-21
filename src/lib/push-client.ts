/**
 * Browser side of push, shared by the switch on /me and the nudges.
 * Only ever imported from client components.
 */
import { savePushSubscription, sendTestPush } from "@/server/push-actions";

export const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushSupport =
  | "unsupported"
  | "ios-install"
  | "not-configured"
  | "blocked"
  | "off"
  | "on";

export function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Where this phone stands, without asking the person anything. */
export async function pushSupport(): Promise<PushSupport> {
  if (!VAPID_KEY) return "not-configured";
  if (isIos() && !isStandalone()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type EnableResult = "on" | "blocked" | "dismissed" | "not-saved" | "failed";

/** Must run from a tap: browsers only show the permission prompt for one. */
export async function enablePush(): Promise<{ result: EnableResult; testSent: boolean }> {
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      return { result: permission === "denied" ? "blocked" : "dismissed", testSent: false };
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const saved = await savePushSubscription(json);
    if (!saved.ok) return { result: "not-saved", testSent: false };
    const test = await sendTestPush();
    return { result: "on", testSent: test.ok };
  } catch {
    return { result: "failed", testSent: false };
  }
}

/* ------------------------------------------------ "not now", remembered --- */

const SNOOZE_KEY = "bq_push_nudge_until";
const SNOOZE_DAYS = 14;

export function nudgeSnoozed() {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

export function snoozeNudge(days = SNOOZE_DAYS) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 864e5));
  } catch {
    // Private mode: it asks again next time, which is the lesser evil.
  }
}
