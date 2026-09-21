"use client";

import { useEffect, useState } from "react";
import { Confetti } from "@/components/motion/Confetti";
import { Shuttle } from "@/components/Shuttle";
import { buzz } from "@/lib/haptics";
import type { FinishedMatch } from "@/components/motion/last-finished";

export type { FinishedMatch };

/**
 * When a game ends, every phone looking at that session celebrates.
 *
 * The board polls, so the same finished match arrives on screen again every
 * few seconds. The id is parked in sessionStorage the moment it fires, which
 * makes the celebration exactly once per game per device — and keeps it out of
 * localStorage, so a player who comes back next week gets a clean slate rather
 * than a list of last month's games they have already cheered.
 */
export function WinBurst({ match }: { match: FinishedMatch | null }) {
  const [showing, setShowing] = useState<FinishedMatch | null>(null);

  useEffect(() => {
    if (!match) return;
    const key = `sq:cheered:${match.id}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode, or storage disabled. Cheer once and move on.
    }
    if (seen) return;

    setShowing(match);
    buzz("win");
    const t = setTimeout(() => setShowing(null), 3400);
    return () => clearTimeout(t);
  }, [match]);

  if (!showing) return null;

  return (
    <>
      <Confetti />
      <div
        className="below-safe-top fixed inset-x-0 z-50 flex justify-center px-4"
        role="status"
        aria-live="polite"
      >
        <div className="celebrate pop w-full max-w-sm overflow-hidden rounded-card border border-shuttle/45 p-4 text-center shadow-2xl">
          <div className="relative">
            <div className="mx-auto w-fit text-shuttle shuttle-drop">
              <Shuttle size={34} />
            </div>
            <p className="mt-2 text-[.62rem] uppercase tracking-[.22em] text-shuttle">
              Court {showing.court} &middot; Game over
            </p>
            <p className="mt-1 text-lg font-extrabold leading-tight text-chalk">
              {showing.winners.join(" & ")}
            </p>
            {showing.scoreWin !== null && showing.scoreLose !== null && (
              <p className="mt-1 text-3xl font-extrabold tabular text-shuttle">
                {showing.scoreWin}
                <span className="mx-2 text-base font-bold text-muted">-</span>
                {showing.scoreLose}
              </p>
            )}
            <p className="mt-1 text-xs text-muted">
              {showing.losers.length > 0 ? `beat ${showing.losers.join(" & ")}` : "game complete"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
