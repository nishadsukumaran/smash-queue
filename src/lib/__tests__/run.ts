/** Unit tests for the engine and the maths around it. npm test */

import {
  DEFAULT_WEIGHTS, BALANCE_BY_TYPE, NO_CONSTRAINTS, estimateQueuePosition,
  rankPool, recommendMatch, selectCandidates, type PoolPlayer, type RecentMatch,
} from "../queue-engine";
import { fairnessScore, updateRatings, ratingBand } from "../fairness";
import { signCheckInToken, verifyCheckInToken } from "../qr";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
  }
}

const NOW = 1_700_000_000_000;
const MIN = 60_000;

function player(id: string, games: number, waitedMin: number, rating = 1200, consecutive = 0): PoolPlayer {
  return {
    id,
    name: id.toUpperCase(),
    rating,
    gamesPlayed: games,
    availableSince: NOW - waitedMin * MIN,
    consecutiveGames: consecutive,
    availability: "available",
  };
}

const opts = { now: NOW, weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.balanced }, gameType: "balanced" as const };

console.log("\n  Queue engine unit tests\n  " + "-".repeat(58) + "\n");

/* ------------------------------------------------------------ priorities */

{
  const pool = [player("a", 3, 5), player("b", 3, 5), player("c", 2, 5), player("d", 1, 5), player("e", 1, 5), player("f", 1, 5)];
  const ranked = rankPool(pool, opts);
  check("fewer games ranks higher", ranked.slice(0, 3).every((r) => r.player.gamesPlayed === 1), ranked.map((r) => r.player.id));
  check("most games ranks last", ranked[ranked.length - 1].player.gamesPlayed === 3);
}

{
  const pool = [player("a", 2, 25), player("b", 2, 2), player("c", 2, 18), player("d", 2, 9)];
  const ranked = rankPool(pool, opts);
  check("equal games, longest wait first", ranked[0].player.id === "a" && ranked[3].player.id === "b", ranked.map((r) => r.player.id));
}

{
  const pool = [player("a", 2, 20, 1200, 3), player("b", 2, 20, 1200, 0)];
  const ranked = rankPool(pool, opts);
  check("back-to-back games lose priority", ranked[0].player.id === "b");
}

{
  const pool = [player("a", 1, 20), { ...player("b", 0, 20), availability: "left" as const }];
  check("players who left are out of the pool", rankPool(pool, opts).length === 1);
}

/* --------------------------------------------------------------- banding */

{
  const pool = [player("a", 0, 10), player("b", 1, 30), player("c", 1, 29), player("d", 1, 28), player("e", 1, 27), player("f", 2, 40)];
  const { forced, choice } = selectCandidates(rankPool(pool, opts), 4, 10);
  check("lowest band is forced in", forced.map((p) => p.id).includes("a"), forced.map((p) => p.id));
  check("choice band is all the same games played", new Set(choice.map((p) => p.gamesPlayed)).size <= 1);
  check("a higher band never appears while a lower one is unfilled", !choice.some((p) => p.gamesPlayed > 1));
}

/* -------------------------------------------------------- recommendation */

{
  const pool = [
    player("a", 3, 20), player("b", 3, 20), player("c", 3, 20), player("d", 3, 20),
    player("e", 1, 20), player("f", 1, 20), player("g", 1, 20), player("h", 1, 20),
  ];
  const rec = recommendMatch(pool, [], NO_CONSTRAINTS, opts)!;
  check("recommends exactly four players", rec.playerIds.length === 4);
  check("picks the four with fewest games", rec.playerIds.sort().join("") === "efgh", rec.playerIds);
  check("teams are two and two", rec.teamA.length === 2 && rec.teamB.length === 2);
  check("no player appears twice", new Set([...rec.teamA, ...rec.teamB]).size === 4);
}

{
  const pool = [player("a", 0, 20), player("b", 0, 20), player("c", 0, 20)];
  check("fewer than four available returns nothing", recommendMatch(pool, [], NO_CONSTRAINTS, opts) === null);
}

{
  const pool = [
    player("strong1", 1, 20, 1600), player("strong2", 1, 20, 1580),
    player("weak1", 1, 20, 1000), player("weak2", 1, 20, 1010),
  ];
  const rec = recommendMatch(pool, [], NO_CONSTRAINTS, { ...opts, gameType: "balanced", weights: { ...DEFAULT_WEIGHTS, balance: 100 } })!;
  const sameTeam = rec.teamA.includes("strong1") === rec.teamA.includes("strong2");
  check("balanced mode splits the two strong players", !sameTeam, { teamA: rec.teamA, teamB: rec.teamB });
  check("balance gap is small", rec.balanceDiff < 60, rec.balanceDiff);
}

{
  const pool = [player("a", 1, 20), player("b", 1, 20), player("c", 1, 20), player("d", 1, 20), player("e", 1, 20), player("f", 1, 20)];
  const rec = recommendMatch(pool, [], { ...NO_CONSTRAINTS, pairs: [["a", "b"]] }, opts)!;
  const together = (rec.teamA.includes("a") && rec.teamA.includes("b")) || (rec.teamB.includes("a") && rec.teamB.includes("b"));
  check("requested pair ends up on the same team", together, { teamA: rec.teamA, teamB: rec.teamB });
}

{
  const pool = [player("a", 1, 20), player("b", 1, 20), player("c", 1, 20), player("d", 1, 20), player("e", 1, 20), player("f", 1, 20), player("g", 1, 20), player("h", 1, 20)];
  const rec = recommendMatch(pool, [], { ...NO_CONSTRAINTS, separate: [["a", "b"]] }, opts)!;
  check("separated pair is not in the same match", !(rec.playerIds.includes("a") && rec.playerIds.includes("b")), rec.playerIds);
}

{
  const pool = [player("a", 1, 20), player("b", 1, 20), player("c", 1, 20), player("d", 1, 20), player("e", 1, 20), player("f", 1, 20)];
  const rec = recommendMatch(pool, [], { ...NO_CONSTRAINTS, lockedIds: ["e", "f"] }, opts)!;
  check("coordinator-pinned players always appear", rec.playerIds.includes("e") && rec.playerIds.includes("f"), rec.playerIds);
}

{
  const pool = [player("a", 1, 20), player("b", 1, 20), player("c", 1, 20), player("d", 1, 20), player("e", 1, 20), player("f", 1, 20), player("g", 1, 20), player("h", 1, 20)];
  const rec = recommendMatch(pool, [], { ...NO_CONSTRAINTS, excludedIds: ["a", "b"] }, opts)!;
  check("excluded players never appear", !rec.playerIds.some((id) => ["a", "b"].includes(id)), rec.playerIds);
}

{
  const history: RecentMatch[] = [
    { finishedAt: NOW - 2 * MIN, teamA: ["a", "b"], teamB: ["c", "d"] },
    { finishedAt: NOW - 18 * MIN, teamA: ["a", "b"], teamB: ["e", "f"] },
  ];
  const pool = [player("a", 1, 20), player("b", 1, 20), player("c", 1, 20), player("d", 1, 20), player("e", 1, 20), player("f", 1, 20), player("g", 1, 20), player("h", 1, 20)];
  const rec = recommendMatch(pool, history, NO_CONSTRAINTS, { ...opts, gameType: "social" })!;
  const abTogether = (rec.teamA.includes("a") && rec.teamA.includes("b")) || (rec.teamB.includes("a") && rec.teamB.includes("b"));
  check("social mode avoids repeating a recent partnership", !abTogether, { teamA: rec.teamA, teamB: rec.teamB });
}

{
  const pool = [player("just-off", 1, 0), player("a", 1, 20), player("b", 1, 20), player("c", 1, 20), player("d", 1, 20)];
  const rec = recommendMatch(pool, [], NO_CONSTRAINTS, opts)!;
  check("someone who just walked off court gets a breather", !rec.playerIds.includes("just-off"), rec.playerIds);
}

/* ----------------------------------------------------------------- queue */

{
  const pool = Array.from({ length: 12 }, (_, i) => player(`p${i}`, i < 4 ? 1 : 2, 10));
  const ranked = rankPool(pool, opts);
  check("next four get told they are up", estimateQueuePosition(ranked[0].player.id, ranked, 1).position === 1);
  check("player eight of twelve is a rotation or two away", estimateQueuePosition(ranked[8].player.id, ranked, 1).position >= 2);
  check("unknown player is not in the queue", estimateQueuePosition("nobody", ranked, 1).aheadCount === 0);
}

/* -------------------------------------------------------------- fairness */

check("all equal scores 100", fairnessScore([5, 5, 5, 5, 5]).score === 100);
check("spread of one still reads excellent", fairnessScore([5, 5, 5, 4, 4]).verdict === "Excellent", fairnessScore([5, 5, 5, 4, 4]));
check("a lopsided session scores badly", fairnessScore([7, 7, 3]).score < 45, fairnessScore([7, 7, 3]));
check("empty session does not divide by zero", fairnessScore([]).score === 100);

/* ------------------------------------------------------------------ elo */

{
  const input = [
    { id: "a", rating: 1200, ratingGames: 5, team: "A" as const },
    { id: "b", rating: 1200, ratingGames: 5, team: "A" as const },
    { id: "c", rating: 1200, ratingGames: 5, team: "B" as const },
    { id: "d", rating: 1200, ratingGames: 5, team: "B" as const },
  ];
  const out = updateRatings(input, 30, 20, 30);
  check("winners gain rating", out.a > 1200 && out.b > 1200, out);
  check("losers lose rating", out.c < 1200 && out.d < 1200, out);
  check("rating is zero sum between equal teams", Math.abs(out.a - 1200 - (1200 - out.c)) < 0.2, out);
}

{
  const input = [
    { id: "a", rating: 1600, ratingGames: 50, team: "A" as const },
    { id: "b", rating: 1600, ratingGames: 50, team: "A" as const },
    { id: "c", rating: 1000, ratingGames: 50, team: "B" as const },
    { id: "d", rating: 1000, ratingGames: 50, team: "B" as const },
  ];
  const expected = updateRatings(input, 30, 15, 30);
  const upset = updateRatings(input, 15, 30, 30);
  check("beating a much weaker team barely moves you", expected.a - 1600 < 2, expected.a - 1600);
  check("an upset moves a lot", 1000 - upset.c < -10 || upset.c - 1000 > 10, upset);
}

check("rating bands line up with the PRD", ratingBand(900).label === "Beginner" && ratingBand(1100).label === "Intermediate" && ratingBand(1400).label === "Advanced" && ratingBand(1700).label === "Expert");

/* --------------------------------------------------------------- qr code */

{
  process.env.QR_SECRET = "test-secret";
  const token = signCheckInToken("ses_1");
  check("a valid token verifies", verifyCheckInToken(token, "ses_1"));
  check("a token from another session is rejected", !verifyCheckInToken(token, "ses_2"));
  check("a tampered token is rejected", !verifyCheckInToken(token.slice(0, -1) + "x", "ses_1"));
  check("last week's token is rejected", !verifyCheckInToken(signCheckInToken("ses_1", Date.now() - 48 * 3600_000), "ses_1"));
}

console.log("\n  " + "-".repeat(58));
if (failures.length) {
  console.error(`\n  ${failures.length} failed, ${passed} passed\n`);
  process.exit(1);
}
console.log(`\n  ${passed} tests passed\n`);
