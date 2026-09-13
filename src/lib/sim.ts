/**
 * In-memory session simulator.
 *
 * Used two ways: to generate believable history for the seed data, and by
 * npm run sim to prove the queue engine keeps games-per-player within one of
 * each other across a full three-hour session.
 */

import {
  NO_CONSTRAINTS, recommendMatch, type PoolPlayer, type RecentMatch,
} from "./queue-engine";
import { DEFAULT_WEIGHTS, BALANCE_BY_TYPE } from "./queue-engine";
import type { GameType, QueueWeights } from "@/db/schema";

export type SimPlayer = { id: string; name: string; rating: number };

export type SimMatch = {
  court: number;
  startedAt: number;
  finishedAt: number;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number;
  scoreB: number;
};

export type SimOptions = {
  courts: number;
  startAt: number;
  minutes: number;
  /** Average minutes per game to 30 points. */
  gameMinutes?: number;
  weights?: QueueWeights;
  gameType?: GameType;
  pointsTo?: number;
  /** Deterministic output when set. */
  seed?: number;
  /** Players arriving late: id -> minutes after start. */
  lateArrivals?: Record<string, number>;
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export type SimResult = {
  matches: SimMatch[];
  games: Record<string, number>;
  waits: number[];
};

export function simulateSession(players: SimPlayer[], opts: SimOptions): SimResult {
  const rand = rng(opts.seed ?? 42);
  const gameMs = (opts.gameMinutes ?? 16) * 60_000;
  const endAt = opts.startAt + opts.minutes * 60_000;
  const pointsTo = opts.pointsTo ?? 30;
  const gameType = opts.gameType ?? "balanced";
  const weights = opts.weights ?? { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE[gameType] };

  const pool: PoolPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    rating: p.rating,
    gamesPlayed: 0,
    availableSince: opts.startAt + (opts.lateArrivals?.[p.id] ?? 0) * 60_000,
    consecutiveGames: 0,
    // "left" here means "not at the venue yet"; they join the pool on arrival.
    availability: (opts.lateArrivals?.[p.id] ? "left" : "available") as PoolPlayer["availability"],
  }));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const ratingById = new Map(players.map((p) => [p.id, p.rating]));

  const courts = Array.from({ length: opts.courts }, () => ({ freeAt: opts.startAt, busy: null as null | SimMatch }));
  const matches: SimMatch[] = [];
  const history: RecentMatch[] = [];
  const waits: number[] = [];

  let clock = opts.startAt;
  let guard = 0;

  while (clock < endAt && guard++ < 5000) {
    // Finish anything that has ended by now.
    for (const c of courts) {
      if (c.busy && c.freeAt <= clock) {
        const m = c.busy;
        for (const id of [...m.teamA, ...m.teamB]) {
          const p = byId.get(id)!;
          p.gamesPlayed++;
          p.consecutiveGames++;
          p.availableSince = m.finishedAt;
          p.availability = "available";
        }
        for (const p of pool)
          if (p.availability === "available" && ![...m.teamA, ...m.teamB].includes(p.id))
            p.consecutiveGames = Math.max(0, p.consecutiveGames - 1);
        history.unshift({ finishedAt: m.finishedAt, teamA: m.teamA, teamB: m.teamB });
        c.busy = null;
      }
    }

    // Late arrivals walk in and join the pool. Players who are mid-game are
    // "resting" too, so only the not-yet-arrived set is considered here.
    for (const p of pool)
      if (p.availability === "left" && p.availableSince <= clock) p.availability = "available";

    const free = courts.filter((c) => !c.busy);
    let assignedSomething = false;

    for (const c of free) {
      if (clock + gameMs * 0.5 > endAt) break; // no time left for another game
      const rec = recommendMatch(pool, history, NO_CONSTRAINTS, {
        now: clock,
        weights,
        gameType,
      });
      if (!rec) break;

      const jitter = 0.75 + rand() * 0.5;
      const finishedAt = clock + Math.round(gameMs * jitter);

      const ratingA = (ratingById.get(rec.teamA[0]) ?? 1200) + (ratingById.get(rec.teamA[1]) ?? 1200);
      const ratingB = (ratingById.get(rec.teamB[0]) ?? 1200) + (ratingById.get(rec.teamB[1]) ?? 1200);
      const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 800));
      const aWins = rand() < expectedA;
      const loserScore = Math.min(pointsTo - 2, Math.round(12 + rand() * (pointsTo - 14)));

      const m: SimMatch = {
        court: courts.indexOf(c) + 1,
        startedAt: clock,
        finishedAt,
        teamA: rec.teamA,
        teamB: rec.teamB,
        scoreA: aWins ? pointsTo : loserScore,
        scoreB: aWins ? loserScore : pointsTo,
      };

      for (const id of [...m.teamA, ...m.teamB]) {
        const p = byId.get(id)!;
        waits.push((clock - p.availableSince) / 60000);
        p.availability = "resting";
      }

      c.busy = m;
      c.freeAt = finishedAt;
      matches.push(m);
      assignedSomething = true;
    }

    // Jump the clock to the next interesting moment.
    const nextFinish = courts.filter((c) => c.busy).map((c) => c.freeAt);
    const nextArrival = pool
      .filter((p) => p.availability === "left")
      .map((p) => p.availableSince)
      .filter((t) => t > clock);
    const candidates = [...nextFinish, ...nextArrival].filter((t) => t > clock);
    if (candidates.length === 0) {
      if (!assignedSomething) break;
      clock += 60_000;
    } else {
      clock = Math.min(...candidates);
    }
  }

  // Drain: games already under way when time runs out were still played.
  for (const c of courts) {
    if (!c.busy) continue;
    for (const id of [...c.busy.teamA, ...c.busy.teamB]) {
      const p = byId.get(id)!;
      p.gamesPlayed++;
      p.availability = "available";
    }
    c.busy = null;
  }

  const games: Record<string, number> = {};
  for (const p of pool) games[p.id] = p.gamesPlayed;

  return { matches, games, waits };
}
