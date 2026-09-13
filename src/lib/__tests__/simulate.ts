/**
 * Runs whole sessions through the queue engine and reports fairness.
 * npm run sim
 */
import { simulateSession, type SimPlayer } from "../sim";
import { fairnessScore } from "../fairness";

const NAMES = [
  "Arun", "Nikhil", "Ravi", "Faisal", "Mohammed", "Raj", "Ahmed", "John", "Ali",
  "Sanjay", "Vinod", "Deepa", "Sneha", "Priya", "Jomon", "Rakesh", "Shibu",
  "Anoop", "Melvin", "Riya", "Karthik", "Basil", "Hashir", "Maria", "Jerin",
  "Suhail", "Tony", "Neha", "Bijoy", "Nishad",
];

function makePlayers(n: number, seed = 5): SimPlayer[] {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : ""),
    rating: Math.round(1000 + rand() * 550),
  }));
}

type Scenario = {
  label: string;
  players: number;
  courts: number;
  minutes: number;
  lateArrivals?: Record<string, number>;
  /** PRD success metric is a spread of 1. Edge cases carry their own limit. */
  maxSpread: number;
  minFairness: number;
  note?: string;
};

const scenarios: Scenario[] = [
  { label: "24 players, 4 courts, 3 hours", players: 24, courts: 4, minutes: 180, maxSpread: 1, minFairness: 88 },
  { label: "28 players, 4 courts, 3 hours", players: 28, courts: 4, minutes: 180, maxSpread: 1, minFairness: 88 },
  {
    label: "20 players, 3 courts, 2 hours",
    players: 20, courts: 3, minutes: 120, maxSpread: 2, minFairness: 78,
    note: "short session, the final rotation can land one extra game on six people",
  },
  { label: "13 players, 3 courts, 2 hours (awkward number)", players: 13, courts: 3, minutes: 120, maxSpread: 1, minFairness: 88 },
  {
    label: "26 players, 4 courts, 6 arriving 30-70 min late",
    players: 26,
    courts: 4,
    minutes: 180,
    lateArrivals: { p20: 30, p21: 38, p22: 45, p23: 52, p24: 61, p25: 70 },
    maxSpread: 3,
    minFairness: 60,
    note: "someone walking in 70 min late cannot fully catch up; the engine closes the gap as far as the clock allows",
  },
];

let failures = 0;
const startAt = new Date("2026-09-19T19:00:00Z").getTime();

console.log("\n  Queue engine fairness simulation\n  " + "-".repeat(62) + "\n");

for (const sc of scenarios) {
  const players = makePlayers(sc.players);
  const rows: string[] = [];
  let worstSpread = 0;
  let worstScore = 100;
  let totalWait = 0;
  let totalGames = 0;

  for (let run = 0; run < 5; run++) {
    const result = simulateSession(players, {
      courts: sc.courts,
      startAt,
      minutes: sc.minutes,
      gameMinutes: 15,
      seed: 100 + run * 13,
      lateArrivals: sc.lateArrivals,
    });
    const counts = Object.values(result.games);
    const report = fairnessScore(counts);
    worstSpread = Math.max(worstSpread, report.spread);
    worstScore = Math.min(worstScore, report.score);
    totalWait += result.waits.reduce((a, b) => a + b, 0) / Math.max(1, result.waits.length);
    totalGames += result.matches.length;
    rows.push(
      `    run ${run + 1}  games/player ${report.min}-${report.max}  fairness ${report.score}%  matches ${result.matches.length}`,
    );
  }

  const pass = worstSpread <= sc.maxSpread && worstScore >= sc.minFairness;
  if (!pass) failures++;

  console.log(`  ${pass ? "PASS" : "FAIL"}  ${sc.label}`);
  if (sc.note) console.log(`        (${sc.note})`);
  rows.forEach((r) => console.log(r));
  console.log(
    `    worst spread ${worstSpread} (limit ${sc.maxSpread})  worst fairness ${worstScore}% (limit ${sc.minFairness}%)  avg wait ${(totalWait / 5).toFixed(1)} min  avg matches ${(totalGames / 5).toFixed(0)}\n`,
  );
}

console.log("  " + "-".repeat(62));
if (failures) {
  console.error(`\n  ${failures} scenario(s) outside the fairness target.\n`);
  process.exit(1);
}
console.log("\n  All scenarios inside the fairness target.\n");
