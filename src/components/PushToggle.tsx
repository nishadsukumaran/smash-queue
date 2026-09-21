"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, sendTestPush } from "@/server/push-actions";
import { enablePush, pushSupport } from "@/lib/push-client";

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

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    pushSupport()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("working");
    setNote(null);
    const { result, testSent } = await enablePush();
    if (result === "on") {
      setState("on");
      setNote(testSent ? "Sent you a test notification." : "On — the test didn't arrive yet; give it a moment.");
    } else if (result === "blocked") {
      setState("blocked");
    } else {
      setState("off");
      if (result === "not-saved") setNote("Couldn't save that. Are you still signed in?");
      if (result === "failed") setNote("This browser wouldn't allow notifications.");
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
