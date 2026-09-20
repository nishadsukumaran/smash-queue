/**
 * A phone in a sports hall is competing with noise, gloves and a racket in the
 * other hand. A 12ms tick on a successful tap is the one piece of feedback
 * that survives all three.
 *
 * Vibration is Android-only in practice — iOS Safari still does not implement
 * it — so this is a bonus, never the only confirmation of anything.
 */

type Pattern = "tap" | "confirm" | "win" | "error";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 12,
  confirm: [18, 40, 18],
  win: [24, 50, 24, 50, 60],
  error: [40, 60, 40],
};

export function buzz(pattern: Pattern = "tap") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* Some browsers throw when the page has never been interacted with. */
  }
}
