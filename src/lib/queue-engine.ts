/**
 * The queue / matchmaking engine.
 *
 * Pure functions only: no database, no React, no clock of its own. Everything
 * it needs arrives as arguments, which is what makes it testable and what lets
 * src/lib/__tests__/simulate.ts run a whole three-hour session in a few
 * milliseconds to check fairness before a single real player shows up.
 *
 * Design rule from the PRD: the engine RECOMMENDS. The coordinator decides.
 */

import type { GameType, QueueWeights } from "@/db/schema";

/* ------------------------------------------------------------------ types */

export type PoolPlayer = {
  id: string;
  name: string;
  rating: number;
  gamesPlayed: number;
  /** ms epoch: when this player last became available (check-in, or last finish). */
  availableSince: number;
  /** Games played back-to-back without sitting out. */
  consecutiveGames: number;
  availability: "available" | "resting" | "left";
};

export type RecentMatch = {
  /** Most recent first. */
  finishedAt: number;
  teamA: string[];
  teamB: string[];
};

export type Constraints = {
  /** Try hard to put these two on the same team. */
  pairs: Array<[string, string]>;
  /** Try hard to keep these two out of the same match. */
  separate: Array<[string, string]>;
  /** Must appear in the recommendation (coordinator pinned them). */
  lockedIds: string[];
  /** Never select (already on court, resting, gone home). */
  excludedIds: string[];
};

export const NO_CONSTRAINTS: Constraints = {
  pairs: [],
  separate: [],
  lockedIds: [],
  excludedIds: [],
};

export type EngineOptions = {
  now: number;
  weights: QueueWeights;
  gameType: GameType;
  /** How many recent matches count toward partner/opponent diversity. */
  historyDepth?: number;
  /** How many top-ranked players get considered for combinations. */
  poolDepth?: number;
  /** A player who just walked off court gets a grace period before re-picking. */
  cooldownMs?: number;
};

export type PlayerScore = {
  player: PoolPlayer;
  total: number;
  fairness: number;
  waiting: number;
  rest: number;
  waitedMs: number;
};

export type Recommendation = {
  playerIds: string[];
  teamA: [string, string];
  teamB: [string, string];
  score: number;
  balanceDiff: number;
  diversity: number;
  reasons: string[];
  ranked: PlayerScore[];
  /** True when constraints had to be relaxed to field four players. */
  relaxed: boolean;
};

export const DEFAULT_WEIGHTS: QueueWeights = {
  gamesFairness: 50,
  waitingTime: 30,
  rest: 15,
  diversity: 5,
  balance: 60,
};

/** How hard each game type pushes teams toward equal strength. */
export const BALANCE_BY_TYPE: Record<GameType, number> = {
  casual: 20,
  balanced: 60,
  competitive: 100,
  social: 5,
};

/** How hard each game type pushes toward fresh partner/opponent combinations. */
export const MIXING_BY_TYPE: Record<GameType, number> = {
  casual: 1,
  balanced: 1,
  competitive: 0.5,
  social: 2.5,
};

const DEFAULT_HISTORY_DEPTH = 12;
const DEFAULT_POOL_DEPTH = 10;
const DEFAULT_COOLDOWN_MS = 4 * 60 * 1000;

/* ------------------------------------------------------- individual scores */

/**
 * Rank every available player by how much they deserve the next court.
 * Priority 1 games played, priority 2 waiting time, priority 3 rest.
 * Diversity and balance are combination-level and handled further down.
 */
export function rankPool(pool: PoolPlayer[], opts: EngineOptions): PlayerScore[] {
  const cooldown = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const available = pool.filter((p) => p.availability === "available");
  if (available.length === 0) return [];

  const games = available.map((p) => p.gamesPlayed);
  const minGames = Math.min(...games);
  const maxGames = Math.max(...games);
  const gameSpread = Math.max(1, maxGames - minGames);

  const waits = available.map((p) => Math.max(0, opts.now - p.availableSince));
  const maxWait = Math.max(1, ...waits);

  const w = opts.weights;
  const denom = Math.max(1, w.gamesFairness + w.waitingTime + w.rest);

  const scored = available.map((p) => {
    const waitedMs = Math.max(0, opts.now - p.availableSince);

    // Fewest games = 1. Most games = 0.
    const fairness = (maxGames - p.gamesPlayed) / gameSpread;

    // Longest wait in the pool = 1.
    const waiting = waitedMs / maxWait;

    // Back-to-back games decay this; so does having only just walked off court.
    const streakRest = 1 / (1 + p.consecutiveGames);
    const cooldownRest = cooldown > 0 ? Math.min(1, waitedMs / cooldown) : 1;
    const rest = streakRest * cooldownRest;

    const total =
      (w.gamesFairness * fairness + w.waitingTime * waiting + w.rest * rest) / denom;

    return { player: p, total, fairness, waiting, rest, waitedMs };
  });

  // Ties broken by fewer games, then longer wait, then name for stability.
  scored.sort(
    (a, b) =>
      b.total - a.total ||
      a.player.gamesPlayed - b.player.gamesPlayed ||
      b.waitedMs - a.waitedMs ||
      a.player.name.localeCompare(b.player.name),
  );
  return scored;
}

/**
 * How much room the cosmetic criteria (team balance, fresh pairings) get to
 * move a decision. Deliberately tiny: they reorder equals, they never let a
 * player with more games jump the queue.
 */
const TIEBREAK_ROOM = 0.08;

export type CandidateSet = {
  /** Must be in the match. Fewer games than anyone else still waiting. */
  forced: PoolPlayer[];
  /** Equal on games played. The engine picks between these. */
  choice: PoolPlayer[];
};

/**
 * Fairness as a structural rule, not a weight.
 *
 * Players are banded by games played. The engine walks the bands from fewest
 * games upward: every band it can take whole is taken whole, and only the band
 * where it runs out of slots becomes a genuine choice. Inside that band
 * everyone has played the same number of games, so waiting time, rest,
 * pairing history and team balance decide freely without anyone jumping the
 * queue. This is what holds the games-per-player spread at or under one.
 */
export function selectCandidates(
  scores: PlayerScore[],
  need: number,
  poolDepth: number,
): CandidateSet {
  if (scores.length <= need) return { forced: scores.map((s) => s.player), choice: [] };

  const bands = new Map<number, PlayerScore[]>();
  for (const s of scores) {
    const key = s.player.gamesPlayed;
    const list = bands.get(key);
    if (list) list.push(s);
    else bands.set(key, [s]);
  }

  const forced: PoolPlayer[] = [];
  for (const games of Array.from(bands.keys()).sort((a, b) => a - b)) {
    const remaining = need - forced.length;
    if (remaining <= 0) break;

    const band = bands.get(games)!.slice().sort((a, b) => b.total - a.total);
    if (band.length <= remaining) {
      forced.push(...band.map((s) => s.player));
      continue;
    }
    return {
      forced,
      choice: band.slice(0, Math.max(remaining, poolDepth)).map((s) => s.player),
    };
  }
  return { forced: forced.slice(0, need), choice: [] };
}

/* ------------------------------------------------------------- combination */

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * How recently each pair of players shared a court. 1 = last match together,
 * decaying to 0 at the end of the history window.
 */
function buildRecency(history: RecentMatch[], depth: number) {
  const partner = new Map<string, number>();
  const opponent = new Map<string, number>();
  const window = history.slice(0, depth);

  window.forEach((m, i) => {
    const weight = 1 - i / depth;
    const bump = (map: Map<string, number>, a: string, b: string) => {
      const k = pairKey(a, b);
      map.set(k, Math.max(map.get(k) ?? 0, weight));
    };
    for (const team of [m.teamA, m.teamB]) {
      for (let x = 0; x < team.length; x++)
        for (let y = x + 1; y < team.length; y++) bump(partner, team[x], team[y]);
    }
    for (const a of m.teamA) for (const b of m.teamB) bump(opponent, a, b);
  });

  return { partner, opponent };
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i <= items.length - (k - acc.length); i++) {
      acc.push(items[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

type Split = { teamA: [string, string]; teamB: [string, string]; diff: number; repeat: number };

/** The three ways four players can be split into two doubles pairs. */
function splits(
  four: PoolPlayer[],
  partnerRecency: Map<string, number>,
  pairs: Array<[string, string]>,
): Split[] {
  const [p0, p1, p2, p3] = four;
  const layouts: Array<[PoolPlayer, PoolPlayer, PoolPlayer, PoolPlayer]> = [
    [p0, p1, p2, p3],
    [p0, p2, p1, p3],
    [p0, p3, p1, p2],
  ];
  const wanted = new Set(pairs.map(([a, b]) => pairKey(a, b)));

  return layouts.map(([a1, a2, b1, b2]) => {
    const diff = Math.abs(a1.rating + a2.rating - (b1.rating + b2.rating));
    let repeat =
      (partnerRecency.get(pairKey(a1.id, a2.id)) ?? 0) +
      (partnerRecency.get(pairKey(b1.id, b2.id)) ?? 0);
    // A requested pairing is worth a lot; a broken one is heavily penalised.
    if (wanted.has(pairKey(a1.id, a2.id))) repeat -= 3;
    if (wanted.has(pairKey(b1.id, b2.id))) repeat -= 3;
    return {
      teamA: [a1.id, a2.id] as [string, string],
      teamB: [b1.id, b2.id] as [string, string],
      diff,
      repeat,
    };
  });
}

function chooseSplit(candidates: Split[], balanceWeight: number): Split {
  return candidates.reduce((best, s) => {
    const cost = (x: Split) => (balanceWeight / 100) * (x.diff / 200) + x.repeat * 0.6;
    return cost(s) < cost(best) ? s : best;
  });
}

/**
 * Recommend the next four players for an open court.
 *
 * Returns null only when fewer than four players are genuinely available.
 */
export function recommendMatch(
  pool: PoolPlayer[],
  history: RecentMatch[],
  constraints: Constraints,
  opts: EngineOptions,
): Recommendation | null {
  const historyDepth = opts.historyDepth ?? DEFAULT_HISTORY_DEPTH;
  const poolDepth = opts.poolDepth ?? DEFAULT_POOL_DEPTH;
  const excluded = new Set(constraints.excludedIds);

  const eligible = pool.filter((p) => !excluded.has(p.id));
  const ranked = rankPool(eligible, opts);
  if (ranked.length < 4) return null;

  const byId = new Map(eligible.map((p) => [p.id, p]));
  const scoreById = new Map(ranked.map((r) => [r.player.id, r.total]));
  const { partner, opponent } = buildRecency(history, historyDepth);

  const locked = constraints.lockedIds
    .map((id) => byId.get(id))
    .filter((p): p is PoolPlayer => Boolean(p))
    .slice(0, 4);
  const lockedIds = new Set(locked.map((p) => p.id));

  if (locked.length === 4) {
    return finalise(locked, ranked, partner, opponent, constraints, opts, false, [
      "All four players were picked by the coordinator.",
    ]);
  }

  const need = 4 - locked.length;
  const cooldown = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  // Anyone who walked off court seconds ago gets a breather, as long as there
  // are still enough rested players to field a game without them.
  const queued = ranked.filter((r) => !lockedIds.has(r.player.id));
  const rested = queued.filter((r) => r.waitedMs >= cooldown);
  const readyPool = rested.length >= need ? rested : queued;

  const { forced, choice } = selectCandidates(readyPool, need, poolDepth);

  const separate = new Set(constraints.separate.map(([a, b]) => pairKey(a, b)));
  const balanceWeight = opts.weights.balance ?? BALANCE_BY_TYPE[opts.gameType];
  const mixing = MIXING_BY_TYPE[opts.gameType] ?? 1;
  const diversityWeight = ((opts.weights.diversity ?? 5) / 100) * mixing;

  const evaluate = (combo: PoolPlayer[], honourSeparate: boolean) => {
    const ids = combo.map((p) => p.id);
    if (honourSeparate) {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          if (separate.has(pairKey(ids[i], ids[j]))) return null;
    }

    const base = combo.reduce((s, p) => s + (scoreById.get(p.id) ?? 0), 0) / 4;

    let repeatLoad = 0;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = pairKey(ids[i], ids[j]);
        repeatLoad += (partner.get(k) ?? 0) * 1.4 + (opponent.get(k) ?? 0) * 0.6;
      }
    const diversity = Math.max(0, 1 - repeatLoad / 6);

    const split = chooseSplit(splits(combo, partner, constraints.pairs), balanceWeight);
    const balance = Math.max(0, 1 - Math.min(1, split.diff / 300));

    // Diversity and balance only break near-ties. Fairness is enforced by the
    // games gate above, and must never be bought back by a prettier matchup.
    const score =
      base + diversityWeight * TIEBREAK_ROOM * diversity +
      (balanceWeight / 100) * TIEBREAK_ROOM * balance;

    return { combo, score, diversity, split };
  };

  const fixed = [...locked, ...forced];
  const slotsLeft = 4 - fixed.length;
  if (slotsLeft < 0) return null;

  let best: ReturnType<typeof evaluate> = null;
  let relaxed = false;

  for (const honourSeparate of [true, false]) {
    for (const rest of combinations(choice, slotsLeft)) {
      const result = evaluate([...fixed, ...rest], honourSeparate);
      if (result && (!best || result.score > best.score)) best = result;
    }
    if (best) {
      relaxed = !honourSeparate;
      break;
    }
  }
  if (!best) return null;

  return finalise(
    best.combo,
    ranked,
    partner,
    opponent,
    constraints,
    opts,
    relaxed,
    explain(best.combo, ranked, best.diversity, best.split, opts),
  );
}

function finalise(
  combo: PoolPlayer[],
  ranked: PlayerScore[],
  partner: Map<string, number>,
  opponent: Map<string, number>,
  constraints: Constraints,
  opts: EngineOptions,
  relaxed: boolean,
  reasons: string[],
): Recommendation {
  const balanceWeight = opts.weights.balance ?? BALANCE_BY_TYPE[opts.gameType];
  const split = chooseSplit(splits(combo, partner, constraints.pairs), balanceWeight);
  const ids = combo.map((p) => p.id);

  let repeatLoad = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const k = pairKey(ids[i], ids[j]);
      repeatLoad += (partner.get(k) ?? 0) * 1.4 + (opponent.get(k) ?? 0) * 0.6;
    }

  const scoreById = new Map(ranked.map((r) => [r.player.id, r.total]));
  return {
    playerIds: ids,
    teamA: split.teamA,
    teamB: split.teamB,
    score: combo.reduce((s, p) => s + (scoreById.get(p.id) ?? 0), 0) / 4,
    balanceDiff: Math.round(split.diff),
    diversity: Math.max(0, 1 - repeatLoad / 6),
    reasons,
    ranked,
    relaxed,
  };
}

function explain(
  combo: PoolPlayer[],
  ranked: PlayerScore[],
  diversity: number,
  split: Split,
  opts: EngineOptions,
): string[] {
  const out: string[] = [];
  const minGames = Math.min(...ranked.map((r) => r.player.gamesPlayed));
  const fewest = combo.filter((p) => p.gamesPlayed === minGames);
  if (fewest.length)
    out.push(
      `${fewest.map((p) => p.name).join(", ")} ${fewest.length > 1 ? "have" : "has"} the fewest games (${minGames}).`,
    );

  const longest = combo
    .map((p) => ({ p, wait: opts.now - p.availableSince }))
    .sort((a, b) => b.wait - a.wait)[0];
  if (longest && longest.wait > 60_000)
    out.push(`${longest.p.name} has been waiting ${Math.round(longest.wait / 60000)} min.`);

  if (diversity > 0.9) out.push("Fresh combination, nobody here has played together recently.");
  else if (diversity < 0.5) out.push("Some repeat pairings, the pool is thin right now.");

  if (split.diff <= 40) out.push(`Teams are evenly matched (${Math.round(split.diff)} rating apart).`);
  else out.push(`Team strength differs by ${Math.round(split.diff)} rating points.`);

  return out;
}

/* ---------------------------------------------------- player-facing queue */

/**
 * Rough "when do I play next" answer for the player screen: how many whole
 * rotations of four sit in front of them.
 */
export function estimateQueuePosition(
  playerId: string,
  ranked: PlayerScore[],
  freeCourts: number,
): { position: number; aheadCount: number; label: string } {
  const index = ranked.findIndex((r) => r.player.id === playerId);
  if (index < 0) return { position: 0, aheadCount: 0, label: "Not in the queue" };

  const aheadCount = index;
  const slotsNow = Math.max(0, freeCourts) * 4;
  if (index < slotsNow) return { position: 1, aheadCount, label: "You're next on court" };

  const rotation = Math.floor((index - slotsNow) / 4) + 1;
  const label =
    rotation === 1 ? "Next 1 to 2 games" : rotation === 2 ? "About 2 to 3 games away" : `About ${rotation} games away`;
  return { position: rotation, aheadCount, label };
}
