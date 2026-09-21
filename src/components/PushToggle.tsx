"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/server/push-actions";

/**
 * Turning notifications on for this phone.
 *
 * iPhones only allow web notifications for an app added to the home screen,
 * and they say nothing when it isn't — the permission prompt simply never
 * appears. So on an iPhone in a normal Safari tab this explains the one step
 * that works instead of offering a button that silently does nothing.
 */

type State =
  | "checking"
  | "unsupported"
  | "ios-install"
  | "not-configured"
  | "blocked"
  | "off"
  | "on"
  | "working";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (!KEY) return setState("not-configured");
      if (ios && !standalone) return setState("ios-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
        return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");

      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("working");
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(KEY),
        }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await savePushSubscription(json);
      if (!res.ok) {
        setNote("Couldn't save that. Are you still signed in?");
        setState("off");
        return;
      }
      setState("on");
      const test = await sendTestPush();
      setNote(test.ok ? "Sent you a test notification." : "On — the test didn't arrive yet; give it a moment.");
    } catch {
      setNote("This browser wouldn't allow notifications.");
      setState("off");
    }
  }

  async function disable() {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
      setNote(null);
    }
  }

  const copy: Record<State, string> = {
    checking: "Checking this phone…",
    unsupported: "This browser can't show notifications. Chrome on Android or the home-screen app on iPhone can.",
    "ios-install":
      "On iPhone, notifications only work from the home-screen app. In Safari tap Share, then Add to Home Screen, open Smash Queue from there, and come back here.",
    "not-configured": "Notifications aren't switched on for this deployment yet.",
    blocked: "Notifications are blocked for this site. Allow them in your browser settings, then come back.",
    off: "Get a buzz when you're up on court, when a waitlist spot opens, and when your community posts a notice.",
    on: "On for this phone. You'll hear when you're up, when a waitlist spot opens, and when your community posts a notice.",
    working: "One moment…",
  };

  return (
    <div>
      <p className="text-xs text-muted">{copy[state]}</p>
      {(state === "off" || state === "on") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {state === "off" ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={enable}>
              Turn on notifications
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  const r = await sendTestPush();
                  setNote(r.ok ? "Sent." : "Nothing went out — try turning it off and on again.");
                }}
              >
                Send a test
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={disable}>
                Turn off
              </button>
            </>
          )}
        </div>
      )}
      {note && <p className="mt-2 text-xs text-teal">{note}</p>}
    </div>
  );
}
