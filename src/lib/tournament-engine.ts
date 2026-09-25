/**
 * Draws, results and standings for tournaments.
 *
 * Pure functions, no database: they take entries in seed order and hand back
 * the matches to insert, or take played matches and hand back a table. That
 * keeps the bracket arithmetic testable in isolation (npm test), and keeps
 * the server actions down to "read, call this, write what it says".
 */

export type DrawMatch = {
  /** Local key, turned into a real id by the caller. */
  key: string;
  stage: "group" | "knockout";
  groupLabel: string | null;
  round: number;
  slot: number;
  entryA: string | null;
  entryB: string | null;
  status: "pending" | "ready" | "bye";
  winner: string | null;
  nextKey: string | null;
  nextSide: "A" | "B" | null;
};

/* ------------------------------------------------------------- knockout */

/** Smallest power of two that holds n, and never less than 2. */
export function bracketSize(n: number) {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/**
 * Standard seeding order: 1 and 2 can only meet in the final, 1-4 only in the
 * semis, and so on. For 8: [1, 8, 4, 5, 2, 7, 3, 6] — read in pairs, that is
 * 1v8, 4v5, 2v7, 3v6.
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((s) => [s, next - s]);
  }
  return order;
}

/**
 * The whole knockout bracket for entries already in seed order (strongest
 * first). Missing opponents are byes, which only ever fall to the top seeds,
 * and a bye's winner is carried straight into round two.
 */
export function knockoutDraw(seeded: string[], keyPrefix = "k"): DrawMatch[] {
  const size = bracketSize(seeded.length);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const at = (seed: number) => seeded[seed - 1] ?? null;
  const key = (r: number, s: number) => `${keyPrefix}${r}-${s}`;

  const matches: DrawMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let s = 0; s < count; s++) {
      const last = r === rounds;
      matches.push({
        key: key(r, s),
        stage: "knockout",
        groupLabel: null,
        round: r,
        slot: s,
        entryA: r === 1 ? at(order[s * 2]) : null,
        entryB: r === 1 ? at(order[s * 2 + 1]) : null,
        status: "pending",
        winner: null,
        nextKey: last ? null : key(r + 1, Math.floor(s / 2)),
        nextSide: last ? null : s % 2 === 0 ? "A" : "B",
      });
    }
  }
  return settleByes(matches);
}

/** Marks byes, moves their winners on, and marks matches with both sides known as ready. */
function settleByes(matches: DrawMatch[]): DrawMatch[] {
  const byKey = new Map(matches.map((m) => [m.key, m]));
  for (const m of matches.filter((x) => x.round === 1)) {
    const lone = (m.entryA && !m.entryB) || (!m.entryA && m.entryB);
    if (lone) {
      m.status = "bye";
      m.winner = m.entryA ?? m.entryB;
      const next = m.nextKey ? byKey.get(m.nextKey) : null;
      if (next) {
        if (m.nextSide === "A") next.entryA = m.winner;
        else next.entryB = m.winner;
      }
    } else if (!m.entryA && !m.entryB) {
      // Cannot happen with standard seeding (the bracket is never more than
      // half empty), but a double-empty slot must not block the round after.
      m.status = "bye";
    }
  }
  for (const m of matches) {
    if (m.status === "pending" && m.entryA && m.entryB) m.status = "ready";
  }
  return matches;
}

/** "Final", "Semi-finals", "Quarter-finals", else "Round of 16" / "Round 1". */
export function roundName(round: number, totalRounds: number) {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi-finals";
  if (fromEnd === 2) return "Quarter-finals";
  return `Round of ${2 ** (fromEnd + 1)}`;
}

/* ----------------------------------------------------------- round robin */

/**
 * Every entry plays every other once, arranged into rounds by the circle
 * method so nobody plays twice in a round.
 */
export function roundRobinDraw(entries: string[], groupLabel: string | null, keyPrefix = "g"): DrawMatch[] {
  const list: (string | null)[] = [...entries];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const matches: DrawMatch[] = [];
  for (let r = 0; r < n - 1; r++) {
    let slot = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) {
        matches.push({
          key: `${keyPrefix}${groupLabel ?? ""}${r + 1}-${slot}`,
          stage: "group",
          groupLabel,
          round: r + 1,
          slot: slot++,
          entryA: a,
          entryB: b,
          status: "ready",
          winner: null,
          nextKey: null,
          nextSide: null,
        });
      }
    }
    // Keep the first fixed, rotate the rest one place.
    list.splice(1, 0, list.pop()!);
  }
  return matches;
}

export const groupLabel = (i: number) => String.fromCharCode(65 + i);

/**
 * Splits seeded entries into groups of about `groupSize`, snaking so each
 * group gets one strong, one middle and one weaker entry rather than the top
 * four landing together.
 */
export function splitIntoGroups(seeded: string[], groupSize: number): string[][] {
  const count = Math.max(1, Math.ceil(seeded.length / Math.max(2, groupSize)));
  const groups: string[][] = Array.from({ length: count }, () => []);
  seeded.forEach((id, i) => {
    const lap = Math.floor(i / count);
    const pos = i % count;
    groups[lap % 2 === 0 ? pos : count - 1 - pos].push(id);
  });
  return groups;
}

export function groupStageDraw(seeded: string[], groupSize: number): DrawMatch[] {
  return splitIntoGroups(seeded, groupSize).flatMap((g, i) => roundRobinDraw(g, groupLabel(i)));
}

/* ------------------------------------------------------------- results */

export type Games = Array<[number, number]>;

/**
 * Reads a result. Returns the winning side or an error in words. Every game
 * needs a winner; enough games must be played to decide it, and no more.
 */
export function judgeScores(games: Games, bestOf: number): { winner: "A" | "B" } | { error: string } {
  const need = Math.floor(bestOf / 2) + 1;
  if (games.length === 0) return { error: "Enter at least one game." };
  let a = 0;
  let b = 0;
  for (const [x, y] of games) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0)
      return { error: "Scores must be whole numbers." };
    if (x === y) return { error: "A game can't end level." };
    if (a >= need || b >= need) return { error: "Too many games entered: the match was already decided." };
    if (x > y) a++;
    else b++;
  }
  if (a < need && b < need)
    return { error: bestOf === 1 ? "Enter the game score." : `Someone has to win ${need} games.` };
  return { winner: a > b ? "A" : "B" };
}

/* ------------------------------------------------------------ standings */

export type PlayedMatch = {
  entryA: string | null;
  entryB: string | null;
  winner: string | null;
  scores: Games | null;
  done: boolean;
};

export type StandingRow = {
  entryId: string;
  played: number;
  won: number;
  lost: number;
  gamesFor: number;
  gamesAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
};

/**
 * A group table. Order: wins; then, for exactly two level on wins, whoever
 * won their meeting; then game difference; then point difference; then seed.
 */
export function standings(entryIds: string[], played: PlayedMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    entryIds.map((id) => [
      id,
      { entryId: id, played: 0, won: 0, lost: 0, gamesFor: 0, gamesAgainst: 0, pointsFor: 0, pointsAgainst: 0 },
    ]),
  );
  const h2h = new Map<string, string>();

  for (const m of played) {
    if (!m.done || !m.entryA || !m.entryB || !m.winner) continue;
    const A = rows.get(m.entryA);
    const B = rows.get(m.entryB);
    if (!A || !B) continue;
    A.played++;
    B.played++;
    const aWon = m.winner === m.entryA;
    (aWon ? A : B).won++;
    (aWon ? B : A).lost++;
    h2h.set([m.entryA, m.entryB].sort().join("|"), m.winner);
    for (const [x, y] of m.scores ?? []) {
      A.pointsFor += x;
      A.pointsAgainst += y;
      B.pointsFor += y;
      B.pointsAgainst += x;
      if (x > y) {
        A.gamesFor++;
        B.gamesAgainst++;
      } else {
        B.gamesFor++;
        A.gamesAgainst++;
      }
    }
  }

  const seedIndex = new Map(entryIds.map((id, i) => [id, i]));
  const list = [...rows.values()];
  const winsCount = new Map<number, number>();
  for (const r of list) winsCount.set(r.won, (winsCount.get(r.won) ?? 0) + 1);

  return list.sort((x, y) => {
    if (y.won !== x.won) return y.won - x.won;
    if (winsCount.get(x.won) === 2) {
      const w = h2h.get([x.entryId, y.entryId].sort().join("|"));
      if (w === x.entryId) return -1;
      if (w === y.entryId) return 1;
    }
    const gd = y.gamesFor - y.gamesAgainst - (x.gamesFor - x.gamesAgainst);
    if (gd) return gd;
    const pd = y.pointsFor - y.pointsAgainst - (x.pointsFor - x.pointsAgainst);
    if (pd) return pd;
    return (seedIndex.get(x.entryId) ?? 0) - (seedIndex.get(y.entryId) ?? 0);
  });
}

/**
 * Seeds for the knockout that follows a group stage: every group winner
 * first, then every runner-up, and so on. Then first-round meetings between
 * two entries from the same group are swapped away where another pairing
 * allows it — they have just played each other.
 */
export function qualifiersSeeded(tables: Array<{ label: string; order: string[] }>, advance: number): string[] {
  const seeded: string[] = [];
  for (let p = 0; p < advance; p++) {
    for (const t of tables) if (t.order[p]) seeded.push(t.order[p]);
  }
  return seeded;
}

export function knockoutFromGroups(
  tables: Array<{ label: string; order: string[] }>,
  advance: number,
): DrawMatch[] {
  const seeded = qualifiersSeeded(tables, advance);
  const groupOf = new Map<string, string>();
  for (const t of tables) for (const id of t.order) groupOf.set(id, t.label);

  const draw = knockoutDraw(seeded);
  const first = draw.filter((m) => m.round === 1 && m.status === "ready");
  const clash = (m: DrawMatch) => groupOf.get(m.entryA!) === groupOf.get(m.entryB!);

  for (const m of first) {
    if (!clash(m)) continue;
    for (const other of first) {
      if (other === m) continue;
      const mB = m.entryB;
      const oB = other.entryB;
      if (groupOf.get(m.entryA!) !== groupOf.get(oB!) && groupOf.get(other.entryA!) !== groupOf.get(mB!)) {
        m.entryB = oB;
        other.entryB = mB;
        break;
      }
    }
  }
  return draw;
}

/**
 * Final places from a finished knockout: winner, runner-up, and the beaten
 * semi-finalists sharing third.
 */
export function knockoutPlacings(
  matches: Array<{ round: number; entryA: string | null; entryB: string | null; winner: string | null; done: boolean }>,
): Array<{ place: number; entryId: string }> {
  const ko = matches;
  if (ko.length === 0) return [];
  const last = Math.max(...ko.map((m) => m.round));
  const final = ko.find((m) => m.round === last);
  const out: Array<{ place: number; entryId: string }> = [];
  if (final?.done && final.winner) {
    out.push({ place: 1, entryId: final.winner });
    const loser = final.entryA === final.winner ? final.entryB : final.entryA;
    if (loser) out.push({ place: 2, entryId: loser });
  }
  for (const semi of ko.filter((m) => m.round === last - 1 && m.done && m.winner)) {
    const loser = semi.entryA === semi.winner ? semi.entryB : semi.entryA;
    if (loser) out.push({ place: 3, entryId: loser });
  }
  return out;
}
