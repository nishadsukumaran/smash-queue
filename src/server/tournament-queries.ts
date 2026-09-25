import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  groupMembers, groups, tournamentCategories, tournamentEntries, tournamentMatches,
  tournamentPrizes, tournaments, users, venues,
  type Group, type Tournament, type TournamentCategory, type TournamentEntry,
  type TournamentMatch, type TournamentPrize,
} from "@/db/schema";
import { canOrganize, type Account } from "@/lib/auth";
import { myCommunities } from "@/lib/tenant";
import { knockoutPlacings, standings, type StandingRow } from "@/lib/tournament-engine";

/**
 * Reading tournaments.
 *
 * Who may see one is decided here and nowhere else:
 *   draft     — the host community's organizers
 *   community — the host community's active members
 *   public    — anybody with the link; the entry list and draws need an account
 */

export type Viewer = {
  account: Account | null;
  /** Host communities this browser is an active member of. */
  memberOf: Set<string>;
};

export async function viewerFor(account: Account | null): Promise<Viewer> {
  const mine = await myCommunities(account);
  return { account, memberOf: new Set(mine.map((m) => m.group.id)) };
}

export function canRunTournament(viewer: Viewer, t: Pick<Tournament, "groupId">) {
  return canOrganize(viewer.account, t.groupId);
}

export function canSeeTournament(viewer: Viewer, t: Pick<Tournament, "groupId" | "status" | "visibility">) {
  if (canRunTournament(viewer, t)) return true;
  if (t.status === "draft") return false;
  if (t.visibility === "public") return true;
  return viewer.memberOf.has(t.groupId);
}

/** May this viewer see who entered, and the draws? */
export function canSeeEntrants(viewer: Viewer, t: Pick<Tournament, "groupId" | "status" | "visibility">) {
  if (!canSeeTournament(viewer, t)) return false;
  return Boolean(viewer.account?.onboarded) || viewer.memberOf.has(t.groupId);
}

/** A tournament and its host, unless the host community is gone. */
export async function getTournamentByCode(code: string) {
  const [row] = await db
    .select({ t: tournaments, g: groups })
    .from(tournaments)
    .innerJoin(groups, eq(groups.id, tournaments.groupId))
    .where(and(eq(tournaments.code, code.toUpperCase()), isNull(groups.deletedAt), isNull(groups.archivedAt)));
  return row ?? null;
}

export async function getTournamentById(id: string) {
  const [row] = await db
    .select({ t: tournaments, g: groups })
    .from(tournaments)
    .innerJoin(groups, eq(groups.id, tournaments.groupId))
    .where(and(eq(tournaments.id, id), isNull(groups.deletedAt), isNull(groups.archivedAt)));
  return row ?? null;
}

export async function listGroupTournaments(groupId: string) {
  return db
    .select()
    .from(tournaments)
    .where(eq(tournaments.groupId, groupId))
    .orderBy(desc(tournaments.startDate));
}

export type TournamentCard = {
  t: Tournament;
  group: Pick<Group, "id" | "name" | "slug">;
  categories: number;
  entries: number;
  minFee: number | null;
  cashPrizes: number;
  otherPrizes: number;
};

async function cards(rows: Array<{ t: Tournament; g: Group }>): Promise<TournamentCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.t.id);
  const [cats, entries, prizes] = await Promise.all([
    db
      .select({ tournamentId: tournamentCategories.tournamentId, fee: tournamentCategories.fee })
      .from(tournamentCategories)
      .where(inArray(tournamentCategories.tournamentId, ids)),
    db
      .select({ tournamentId: tournamentEntries.tournamentId })
      .from(tournamentEntries)
      .where(and(inArray(tournamentEntries.tournamentId, ids), eq(tournamentEntries.status, "confirmed"))),
    db
      .select({ tournamentId: tournamentPrizes.tournamentId, kind: tournamentPrizes.kind, amount: tournamentPrizes.amount })
      .from(tournamentPrizes)
      .where(inArray(tournamentPrizes.tournamentId, ids)),
  ]);
  return rows.map(({ t, g }) => {
    const myCats = cats.filter((c) => c.tournamentId === t.id);
    const myPrizes = prizes.filter((p) => p.tournamentId === t.id);
    return {
      t,
      group: { id: g.id, name: g.name, slug: g.slug },
      categories: myCats.length,
      entries: entries.filter((e) => e.tournamentId === t.id).length,
      minFee: myCats.length ? Math.min(...myCats.map((c) => c.fee)) : null,
      cashPrizes: myPrizes.filter((p) => p.kind === "cash").reduce((s, p) => s + (p.amount ?? 0), 0),
      otherPrizes: myPrizes.filter((p) => p.kind !== "cash").length,
    };
  });
}

/**
 * Everything this viewer may browse: public tournaments from anywhere, plus
 * every published one from their own communities. Drafts never.
 */
export async function browseTournaments(viewer: Viewer): Promise<TournamentCard[]> {
  const mine = [...viewer.memberOf];
  const rows = await db
    .select({ t: tournaments, g: groups })
    .from(tournaments)
    .innerJoin(groups, eq(groups.id, tournaments.groupId))
    .where(
      and(
        isNull(groups.deletedAt),
        isNull(groups.archivedAt),
        ne(tournaments.status, "draft"),
        mine.length
          ? or(eq(tournaments.visibility, "public"), inArray(tournaments.groupId, mine))
          : eq(tournaments.visibility, "public"),
      ),
    )
    .orderBy(asc(tournaments.startDate))
    .limit(100);
  return cards(rows);
}

/** Published tournaments of one community that have not finished, soonest first. */
export async function upcomingForGroup(groupId: string): Promise<TournamentCard[]> {
  const rows = await db
    .select({ t: tournaments, g: groups })
    .from(tournaments)
    .innerJoin(groups, eq(groups.id, tournaments.groupId))
    .where(
      and(
        eq(tournaments.groupId, groupId),
        inArray(tournaments.status, ["open", "closed", "live"]),
      ),
    )
    .orderBy(asc(tournaments.startDate))
    .limit(3);
  return cards(rows);
}

/** Public, not finished — for a community's front door. */
export async function publicUpcomingForGroup(groupId: string): Promise<TournamentCard[]> {
  const rows = await db
    .select({ t: tournaments, g: groups })
    .from(tournaments)
    .innerJoin(groups, eq(groups.id, tournaments.groupId))
    .where(
      and(
        eq(tournaments.groupId, groupId),
        eq(tournaments.visibility, "public"),
        inArray(tournaments.status, ["open", "closed", "live"]),
      ),
    )
    .orderBy(asc(tournaments.startDate))
    .limit(5);
  return cards(rows);
}

/* ---------------------------------------------------------------- detail */

export type EntryPlayer = { id: string; name: string; playerNo: number };

export type EntryView = TournamentEntry & {
  p1: EntryPlayer;
  p2: EntryPlayer | null;
  /** "Asha & Ravi", or the team name if they chose one. */
  label: string;
  /** Strength used for seeding: host-community rating, else 1200. */
  strength: number;
};

export type CategoryView = TournamentCategory & {
  entries: EntryView[];
  confirmed: number;
  prizes: TournamentPrize[];
  matches: TournamentMatch[];
  /** Group tables, when the category has a group stage. */
  tables: Array<{ label: string; rows: StandingRow[] }>;
  placings: Array<{ place: number; entryId: string }>;
  groupStageDone: boolean;
  hasKnockout: boolean;
};

export type TournamentDetail = {
  t: Tournament;
  group: Group;
  venue: { name: string; address: string | null; latitude: number | null; longitude: number | null } | null;
  categories: CategoryView[];
  generalPrizes: TournamentPrize[];
  entryById: Map<string, EntryView>;
};

export function entryLabel(e: { teamName: string | null; p1: { name: string }; p2: { name: string } | null }) {
  if (e.teamName) return e.teamName;
  return e.p2 ? `${e.p1.name} & ${e.p2.name}` : e.p1.name;
}

export async function tournamentDetail(t: Tournament, group: Group): Promise<TournamentDetail> {
  const [cats, prizes, entries, matchRows, venueRows] = await Promise.all([
    db
      .select()
      .from(tournamentCategories)
      .where(eq(tournamentCategories.tournamentId, t.id))
      .orderBy(asc(tournamentCategories.sortOrder), asc(tournamentCategories.createdAt)),
    db
      .select()
      .from(tournamentPrizes)
      .where(eq(tournamentPrizes.tournamentId, t.id))
      .orderBy(asc(tournamentPrizes.place), asc(tournamentPrizes.sortOrder)),
    db
      .select()
      .from(tournamentEntries)
      .where(eq(tournamentEntries.tournamentId, t.id))
      .orderBy(asc(tournamentEntries.createdAt)),
    db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, t.id))
      .orderBy(asc(tournamentMatches.stage), asc(tournamentMatches.groupLabel), asc(tournamentMatches.round), asc(tournamentMatches.slot)),
    t.venueId ? db.select().from(venues).where(eq(venues.id, t.venueId)) : Promise.resolve([]),
  ]);

  const playerIds = Array.from(
    new Set(entries.flatMap((e) => [e.player1Id, e.player2Id]).filter(Boolean) as string[]),
  );
  const [people, ratings] = playerIds.length
    ? await Promise.all([
        db
          .select({ id: users.id, name: users.name, playerNo: users.playerNo })
          .from(users)
          .where(inArray(users.id, playerIds)),
        db
          .select({ userId: groupMembers.userId, rating: groupMembers.rating })
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, t.groupId), inArray(groupMembers.userId, playerIds))),
      ])
    : [[], []];
  const person = new Map(people.map((p) => [p.id, p]));
  const rating = new Map(ratings.map((r) => [r.userId, r.rating]));
  const unknown = (id: string): EntryPlayer => ({ id, name: "Unknown", playerNo: 0 });

  const views: EntryView[] = entries.map((e) => {
    const p1 = person.get(e.player1Id) ?? unknown(e.player1Id);
    const p2 = e.player2Id ? person.get(e.player2Id) ?? unknown(e.player2Id) : null;
    const rs = [rating.get(e.player1Id) ?? 1200, ...(e.player2Id ? [rating.get(e.player2Id) ?? 1200] : [])];
    return { ...e, p1, p2, label: entryLabel({ teamName: e.teamName, p1, p2 }), strength: rs.reduce((a, b) => a + b, 0) / rs.length };
  });
  const entryById = new Map(views.map((v) => [v.id, v]));

  const categories: CategoryView[] = cats.map((c) => {
    const catEntries = views.filter((e) => e.categoryId === c.id);
    const catMatches = matchRows.filter((m) => m.categoryId === c.id);
    const groupMatches = catMatches.filter((m) => m.stage === "group");
    const koMatches = catMatches.filter((m) => m.stage === "knockout");
    const labels = Array.from(new Set(groupMatches.map((m) => m.groupLabel ?? ""))).sort();
    const tables = labels.map((label) => {
      const ms = groupMatches.filter((m) => (m.groupLabel ?? "") === label);
      const ids = Array.from(new Set(ms.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean) as string[]));
      ids.sort((a, b) => seedRank(entryById.get(a)) - seedRank(entryById.get(b)));
      return {
        label,
        rows: standings(
          ids,
          ms.map((m) => ({
            entryA: m.entryAId,
            entryB: m.entryBId,
            winner: m.winnerEntryId,
            scores: m.scores,
            done: m.status === "completed",
          })),
        ),
      };
    });
    const groupStageDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === "completed");

    let placings: Array<{ place: number; entryId: string }> = [];
    if (koMatches.length) {
      placings = knockoutPlacings(
        koMatches.map((m) => ({
          round: m.round,
          entryA: m.entryAId,
          entryB: m.entryBId,
          winner: m.winnerEntryId,
          done: m.status === "completed" || m.status === "bye",
        })),
      );
    } else if (c.format === "round_robin" && groupStageDone && tables[0]) {
      placings = tables[0].rows.slice(0, 3).map((r, i) => ({ place: i + 1, entryId: r.entryId }));
    }

    return {
      ...c,
      entries: catEntries,
      confirmed: catEntries.filter((e) => e.status === "confirmed").length,
      prizes: prizes.filter((p) => p.categoryId === c.id),
      matches: catMatches,
      tables,
      placings,
      groupStageDone,
      hasKnockout: koMatches.length > 0,
    };
  });

  const v = venueRows[0];
  return {
    t,
    group,
    venue: v
      ? { name: v.name, address: v.address, latitude: v.latitude, longitude: v.longitude }
      : t.venueText
        ? { name: t.venueText, address: null, latitude: null, longitude: null }
        : null,
    categories,
    generalPrizes: prizes.filter((p) => !p.categoryId),
    entryById,
  };
}

/** Organizer seed first, then strength, then who entered first. */
export function seedRank(e: EntryView | undefined) {
  if (!e) return Number.MAX_SAFE_INTEGER;
  return e.seed ?? 1000 + (3000 - e.strength);
}

export function seededOrder(entries: EntryView[]) {
  return [...entries].sort(
    (a, b) =>
      (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER) ||
      b.strength - a.strength ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

/* ------------------------------------------------------------- personal */

export type MyEntry = {
  entry: TournamentEntry;
  tournament: Tournament;
  category: TournamentCategory;
  partnerName: string | null;
  enteredByName: string;
  /** I am the one being asked to partner. */
  awaitingMe: boolean;
};

/** Every entry this person is part of, newest tournament first. */
export async function myTournamentEntries(userId: string): Promise<MyEntry[]> {
  const rows = await db
    .select({ e: tournamentEntries, t: tournaments, c: tournamentCategories })
    .from(tournamentEntries)
    .innerJoin(tournaments, eq(tournaments.id, tournamentEntries.tournamentId))
    .innerJoin(tournamentCategories, eq(tournamentCategories.id, tournamentEntries.categoryId))
    .innerJoin(groups, eq(groups.id, tournaments.groupId))
    .where(
      and(
        or(eq(tournamentEntries.player1Id, userId), eq(tournamentEntries.player2Id, userId)),
        isNull(groups.deletedAt),
        isNull(groups.archivedAt),
      ),
    )
    .orderBy(desc(tournaments.startDate));
  if (rows.length === 0) return [];

  const ids = Array.from(new Set(rows.flatMap((r) => [r.e.player1Id, r.e.player2Id]).filter(Boolean) as string[]));
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  const name = new Map(people.map((p) => [p.id, p.name]));

  return rows.map(({ e, t, c }) => {
    const partner = e.player1Id === userId ? e.player2Id : e.player1Id;
    return {
      entry: e,
      tournament: t,
      category: c,
      partnerName: partner ? name.get(partner) ?? null : null,
      enteredByName: name.get(e.player1Id) ?? "",
      awaitingMe: e.status === "partner" && e.player2Id === userId,
    };
  });
}
