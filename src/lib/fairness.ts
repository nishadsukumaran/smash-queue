/** Session fairness + rating maths. Pure functions, no DB. */

export type FairnessReport = {
  score: number;
  spread: number;
  min: number;
  max: number;
  mean: number;
  mad: number;
  verdict: "Excellent" | "Good" | "Uneven" | "Poor";
};

/**
 * Turn the spread of games-per-player into a single number the coordinator can
 * glance at. All-equal = 100. The PRD's success metric is a spread of 1 or less.
 */
export function fairnessScore(gamesPerPlayer: number[]): FairnessReport {
  const n = gamesPerPlayer.length;
  if (n === 0)
    return { score: 100, spread: 0, min: 0, max: 0, mean: 0, mad: 0, verdict: "Excellent" };

  const min = Math.min(...gamesPerPlayer);
  const max = Math.max(...gamesPerPlayer);
  const mean = gamesPerPlayer.reduce((a, b) => a + b, 0) / n;
  const mad = gamesPerPlayer.reduce((a, b) => a + Math.abs(b - mean), 0) / n;
  const spread = max - min;

  const raw = 100 - Math.max(0, spread - 1) * 12 - mad * 20;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const verdict =
    score >= 88 ? "Excellent" : score >= 72 ? "Good" : score >= 50 ? "Uneven" : "Poor";

  return { score, spread, min, max, mean, mad, verdict };
}

/* ------------------------------------------------------------------- elo */

function kFactor(gamesRated: number) {
  if (gamesRated < 10) return 40;
  if (gamesRated < 30) return 28;
  return 18;
}

export type RatingInput = { id: string; rating: number; ratingGames: number; team: "A" | "B" };

/**
 * Doubles Elo. Each side is rated as the average of its two players, and the
 * margin of victory nudges the size of the swing (a 30-4 thrashing moves more
 * than a 30-28 nailbiter).
 */
export function updateRatings(
  players: RatingInput[],
  teamAScore: number,
  teamBScore: number,
  pointsTo = 30,
): Record<string, number> {
  const a = players.filter((p) => p.team === "A");
  const b = players.filter((p) => p.team === "B");
  if (a.length === 0 || b.length === 0) return {};

  const avg = (xs: RatingInput[]) => xs.reduce((s, p) => s + p.rating, 0) / xs.length;
  const ra = avg(a);
  const rb = avg(b);

  const expectedA = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const actualA = teamAScore === teamBScore ? 0.5 : teamAScore > teamBScore ? 1 : 0;

  const margin = Math.abs(teamAScore - teamBScore) / Math.max(1, pointsTo);
  const marginMultiplier = 0.75 + 0.5 * Math.min(1, margin);

  const out: Record<string, number> = {};
  for (const p of players) {
    const expected = p.team === "A" ? expectedA : 1 - expectedA;
    const actual = p.team === "A" ? actualA : 1 - actualA;
    const delta = kFactor(p.ratingGames) * marginMultiplier * (actual - expected);
    out[p.id] = Math.round((p.rating + delta) * 10) / 10;
  }
  return out;
}

export function ratingBand(rating: number) {
  if (rating >= 1600) return { label: "Expert", color: "#D7F75B" };
  if (rating >= 1300) return { label: "Advanced", color: "#3DD9A4" };
  if (rating >= 1000) return { label: "Intermediate", color: "#7FA396" };
  return { label: "Beginner", color: "#FFC24B" };
}
