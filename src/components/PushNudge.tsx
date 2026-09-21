"use client";

import { useEffect, useState } from "react";
import {
  enablePush,
  isIos,
  isStandalone,
  nudgeSnoozed,
  pushSupport,
  snoozeNudge,
} from "@/lib/push-client";
import { buzz } from "@/lib/haptics";

/**
 * Asks for notifications at the moment they obviously help, instead of
 * leaving the switch buried on /me.
 *
 * "booked": on a session page, once you're booked in — the moment "tell me
 * when I'm up" makes sense.
 * "app": the first time the home-screen app opens, which on iPhone is the
 * only place notifications work at all.
 *
 * Browsers only allow the permission prompt from a tap, so this is a card
 * with a button, never an automatic prompt. "Not now" keeps it away for two
 * weeks, and one card per page at most.
 */

type Reason = "booked" | "app";
type View = "hidden" | "ask" | "ios-install" | "working" | "done" | "blocked";

let claimed = false; // one nudge per page, whichever mounts first

export function PushNudge({ reason }: { reason: Reason }) {
  const [view, setView] = useState<View>("hidden");

  useEffect(() => {
    let mine = false;
    (async () => {
      if (claimed || nudgeSnoozed()) return;
      if (reason === "app" && (!isStandalone() || location.pathname === "/me")) return;
      const support = await pushSupport();
      if (claimed) return;
      if (support === "off") {
        claimed = mine = true;
        setView("ask");
      } else if (support === "ios-install" && reason === "booked" && isIos()) {
        claimed = mine = true;
        setView("ios-install");
      }
    })().catch(() => {});
    return () => {
      if (mine) claimed = false;
    };
  }, [reason]);

  if (view === "hidden") return null;

  const later = () => {
    snoozeNudge();
    setView("hidden");
  };

  if (view === "done")
    return (
      <div className="card rise border-teal/40 p-4">
        <p className="text-sm font-semibold text-teal">You&apos;re set.</p>
        <p className="mt-1 text-xs text-muted">
          This phone will buzz when you&apos;re up. Switch it off any time under Me.
        </p>
      </div>
    );

  if (view === "blocked")
    return (
      <div className="card rise p-4">
        <p className="text-sm font-semibold">Notifications are blocked for this site</p>
        <p className="mt-1 text-xs text-muted">
          Allow them in your browser&apos;s site settings, then turn them on under Me.
        </p>
        <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={later}>
          OK
        </button>
      </div>
    );

  if (view === "ios-install")
    return (
      <div className="card rise border-shuttle/40 p-4">
        <p className="text-sm font-semibold">Want a buzz when you&apos;re up on court?</p>
        <p className="mt-1 text-xs text-muted">
          On iPhone that needs the app on your home screen: tap <b>Share</b>, then{" "}
          <b>Add to Home Screen</b>, and open Smash Queue from there. It&apos;ll offer
          notifications the first time.
        </p>
        <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={later}>
          Not now
        </button>
      </div>
    );

  return (
    <div className="card rise border-shuttle/40 p-4">
      <p className="text-sm font-semibold">
        {reason === "booked"
          ? "Want a buzz when you're up on court?"
          : "Turn on notifications for this phone?"}
      </p>
      <p className="mt-1 text-xs text-muted">
        Your turn on court, a waitlist spot opening, notices from your community. Nothing else.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={view === "working"}
          onClick={async () => {
            buzz("tap");
            setView("working");
            const { result } = await enablePush();
            if (result === "on") setView("done");
            else if (result === "blocked") setView("blocked");
            else later();
          }}
        >
          {view === "working" ? "One moment…" : "Turn on"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={later}>
          Not now
        </button>
      </div>
    </div>
  );
}
