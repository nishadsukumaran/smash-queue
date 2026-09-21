/**
 * Plain server-side helper for WinBurst. It lives outside WinBurst.tsx because
 * that file is "use client": a function exported from a client module can only
 * be rendered, not called, on the server.
 */

export type FinishedMatch = {
  id: string;
  court: number;
  winners: string[];
  losers: string[];
  scoreWin: number | null;
  scoreLose: number | null;
};

/** Pulls the newest completed match out of a board into the shape above. */
export function lastFinished(
  matches: {
    id: string;
    court: number;
    status: string;
    finishedAt: Date | null;
    teamA: { name: string }[];
    teamB: { name: string }[];
    score: { a: number; b: number; winner: "A" | "B" | "none" } | null;
  }[],
  withinMs = 90_000,
): FinishedMatch | null {
  const done = matches
    .filter((m) => m.status === "completed" && m.finishedAt)
    .sort((a, b) => (b.finishedAt!.getTime() ?? 0) - (a.finishedAt!.getTime() ?? 0));
  const m = done[0];
  if (!m) return null;
  // Only celebrate something that just happened. Opening the board an hour
  // later should not replay the evening.
  if (Date.now() - m.finishedAt!.getTime() > withinMs) return null;

  const aWon = m.score?.winner === "A";
  const bWon = m.score?.winner === "B";
  const winners = (aWon ? m.teamA : bWon ? m.teamB : m.teamA).map((p) => p.name);
  const losers = aWon ? m.teamB.map((p) => p.name) : bWon ? m.teamA.map((p) => p.name) : [];

  return {
    id: m.id,
    court: m.court,
    winners,
    losers,
    scoreWin: m.score ? (aWon ? m.score.a : bWon ? m.score.b : null) : null,
    scoreLose: m.score ? (aWon ? m.score.b : bWon ? m.score.a : null) : null,
  };
}
