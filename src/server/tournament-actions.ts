"use server";

/**
 * Tournaments: announcing one, entering one, running the draw, recording results.
 *
 * Same rules as the rest of the app. A tournament belongs to the community
 * that hosts it: its organizers create, change and run it, and nobody else —
 * the platform included — can. Every export is a public endpoint, so each one
 * looks up the tournament its target belongs to and checks the caller against
 * that tournament's host, never against a hidden form field.
 *
 * Every action posts a plain form and answers with a redirect carrying a short
 * message (?m= or ?e=), so the pages work with JavaScript off, in a hall with
 * one bar of signal.
 */

import { and, eq, inArray, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  groupMembers, groups, tournamentCategories, tournamentEntries, tournamentMatches,
  tournamentPrizes, tournaments, users, venues,
  type CategoryGender, type EntryStatus, type PaymentMethod, type PaymentStatus, type PrizeKind,
  type Tournament, type TournamentCategory, type TournamentFormat, type TournamentStatus,
  type TournamentVisibility,
} from "@/db/schema";
import { newId, sessionCode } from "@/lib/ids";
import { canOrganize, canStaff, currentAccount, isRegistered, type Account } from "@/lib/auth";
import { isStaffFor } from "@/lib/identity";
import { pushLater } from "@/lib/push";
import { TIME_ZONE } from "@/lib/format";
import { safeNext } from "@/lib/safe-next";
import {
  groupStageDraw, judgeScores, knockoutDraw, knockoutFromGroups, roundRobinDraw, type DrawMatch, type Games,
} from "@/lib/tournament-engine";
import { getTournamentById, seededOrder, tournamentDetail } from "./tournament-queries";
import { genderFit, missingForTournaments } from "@/lib/profile";

/* ------------------------------------------------------------- helpers */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const int = (fd: FormData, k: string, fallback: number, min = -Infinity, max = Infinity) => {
  const raw = str(fd, k);
  const v = raw === "" ? fallback : Math.round(Number(raw));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};
const money = (fd: FormData, k: string) => {
  const v = Number(str(fd, k));
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0;
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** Where to go back to, with a message. Never an off-site address. */
function back(fd: FormData, fallback: string, message: string, error = false): never {
  const to = safeNext(str(fd, "next"), fallback);
  const sep = to.includes("?") ? "&" : "?";
  redirect(`${to}${sep}${error ? "e" : "m"}=${encodeURIComponent(message)}`);
}

function touch(t: Pick<Tournament, "id" | "code">) {
  revalidatePath(`/t/${t.code}`);
  revalidatePath(`/admin/tournaments/${t.id}`);
  revalidatePath("/tournaments");
  revalidatePath("/");
}

async function member(): Promise<Account | null> {
  const account = await currentAccount();
  return account && account.onboarded ? account : null;
}

/** The tournament, if the caller runs its host community. */
async function runnable(tournamentId: string) {
  const account = await currentAccount();
  const row = await getTournamentById(tournamentId);
  if (!row || !account || !canOrganize(account, row.t.groupId)) return null;
  return { ...row, account };
}

async function categoryOf(categoryId: string) {
  const [c] = await db.select().from(tournamentCategories).where(eq(tournamentCategories.id, categoryId));
  return c ?? null;
}

async function freshCode() {
  for (let i = 0; i < 20; i++) {
    const code = sessionCode(6);
    const [clash] = await db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.code, code));
    if (!clash) return code;
  }
  return sessionCode(8);
}

async function activeMember(groupId: string, userId: string) {
  const [row] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId), eq(groupMembers.status, "active")));
  return Boolean(row);
}

async function hostMembers(groupId: string) {
  return (
    await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")))
  ).map((r) => r.userId);
}

async function hostRunners(groupId: string) {
  return (
    await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.status, "active"),
          inArray(groupMembers.role, ["owner", "organizer"]),
        ),
      )
  ).map((r) => r.userId);
}

async function profileOf(userId: string) {
  const [u] = await db
    .select({ gender: users.gender, level: users.level, name: users.name })
    .from(users)
    .where(eq(users.id, userId));
  return u ?? null;
}

/** Off to the profile page, and back to `returnTo` once it's filled in. */
function completeProfileFirst(returnTo: string, missing: string[]): never {
  redirect(
    `/me/profile?next=${encodeURIComponent(returnTo)}&e=${encodeURIComponent(
      `Add your ${missing.join(" and ")} to enter tournaments.`,
    )}`,
  );
}

const LIVE_ENTRY: EntryStatus[] = ["partner", "pending", "confirmed", "waitlisted"];

/* ------------------------------------------------------ the tournament */

function readTournamentFields(fd: FormData) {
  const startDate = str(fd, "startDate");
  const endDate = str(fd, "endDate") || startDate;
  const deadline = str(fd, "entryDeadline");
  const startTime = str(fd, "startTime");
  const visibility: TournamentVisibility = str(fd, "visibility") === "public" ? "public" : "community";
  return {
    name: str(fd, "name").slice(0, 120),
    description: opt(fd, "description")?.slice(0, 4000) ?? null,
    startDate,
    endDate,
    startTime: HHMM.test(startTime) ? startTime : null,
    entryDeadline: ISO_DATE.test(deadline) ? deadline : null,
    visibility,
    approval: (str(fd, "approval") === "auto" ? "auto" : "manual") as "auto" | "manual",
    venueId: opt(fd, "venueId"),
    venueText: opt(fd, "venueText")?.slice(0, 200) ?? null,
    paymentNote: opt(fd, "paymentNote")?.slice(0, 2000) ?? null,
    rules: opt(fd, "rules")?.slice(0, 6000) ?? null,
    contact: opt(fd, "contact")?.slice(0, 200) ?? null,
  };
}

function checkTournamentFields(f: ReturnType<typeof readTournamentFields>): string | null {
  if (f.name.length < 3) return "Give the tournament a name.";
  if (!ISO_DATE.test(f.startDate)) return "Pick the date it starts.";
  if (!ISO_DATE.test(f.endDate) || f.endDate < f.startDate) return "The end date can't be before the start.";
  if (f.entryDeadline && f.entryDeadline > f.endDate) return "Entries have to close before the tournament ends.";
  return null;
}

async function venueBelongs(groupId: string, venueId: string | null) {
  if (!venueId) return true;
  const [v] = await db.select({ g: venues.groupId }).from(venues).where(eq(venues.id, venueId));
  return v?.g === groupId;
}

export async function createTournamentAction(fd: FormData) {
  const groupId = str(fd, "groupId");
  const account = await currentAccount();
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!account || !group || group.deletedAt || group.archivedAt || !canOrganize(account, groupId))
    back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);

  const f = readTournamentFields(fd);
  const problem = checkTournamentFields(f);
  if (problem) back(fd, "/admin/tournaments/new", problem, true);
  if (!(await venueBelongs(groupId, f.venueId))) f.venueId = null;

  const id = newId("trn");
  const code = await freshCode();
  await db.insert(tournaments).values({
    id,
    groupId,
    code,
    ...f,
    currency: group.currency,
    status: "draft",
    createdBy: account.id,
    createdAt: new Date(),
  });
  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments/${id}?m=${encodeURIComponent("Draft saved. Add the categories and prizes, then publish.")}`);
}

export async function updateTournamentAction(fd: FormData) {
  const run = await runnable(str(fd, "tournamentId"));
  if (!run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const f = readTournamentFields(fd);
  const problem = checkTournamentFields(f);
  if (problem) back(fd, `/admin/tournaments/${run.t.id}`, problem, true);
  if (!(await venueBelongs(run.t.groupId, f.venueId))) f.venueId = null;

  await db.update(tournaments).set(f).where(eq(tournaments.id, run.t.id));
  touch(run.t);
  back(fd, `/admin/tournaments/${run.t.id}`, "Saved.");
}

/** Which status can follow which. Anything else is refused. */
const NEXT_STATUS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ["open", "cancelled"],
  open: ["closed", "live", "cancelled", "draft"],
  closed: ["open", "live", "cancelled"],
  live: ["completed", "closed"],
  completed: ["live"],
  cancelled: ["draft"],
};

export async function setTournamentStatusAction(fd: FormData) {
  const run = await runnable(str(fd, "tournamentId"));
  if (!run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const to = str(fd, "status") as TournamentStatus;
  const here = `/admin/tournaments/${run.t.id}`;
  if (!NEXT_STATUS[run.t.status]?.includes(to)) back(fd, here, "That step isn't available now.", true);

  if (to === "open") {
    const cats = await db
      .select({ id: tournamentCategories.id })
      .from(tournamentCategories)
      .where(eq(tournamentCategories.tournamentId, run.t.id));
    if (cats.length === 0) back(fd, here, "Add at least one category before publishing.", true);
  }
  if (to === "draft") {
    const [any] = await db
      .select({ id: tournamentEntries.id })
      .from(tournamentEntries)
      .where(and(eq(tournamentEntries.tournamentId, run.t.id), inArray(tournamentEntries.status, LIVE_ENTRY)));
    if (any) back(fd, here, "People have already entered. Close entries instead of unpublishing.", true);
  }

  const firstPublish = to === "open" && !run.t.publishedAt;
  await db
    .update(tournaments)
    .set({ status: to, ...(firstPublish ? { publishedAt: new Date() } : {}) })
    .where(eq(tournaments.id, run.t.id));

  // Announce once, to the host community. A public tournament is found on the
  // listing by everyone else; the app does not message other communities'
  // members, which is part of what it promises their owners.
  if (firstPublish) {
    const members = (await hostMembers(run.t.groupId)).filter((id) => id !== run.account.id);
    pushLater(members, {
      title: `New tournament: ${run.t.name}`,
      body: `Entries are open${run.t.entryDeadline ? ` until ${run.t.entryDeadline}` : ""}. Tap to see categories and prizes.`,
      url: `/t/${run.t.code}`,
      tag: `tournament-${run.t.id}`,
    });
  }
  if (to === "cancelled") {
    const entrants = await db
      .select({ a: tournamentEntries.player1Id, b: tournamentEntries.player2Id })
      .from(tournamentEntries)
      .where(and(eq(tournamentEntries.tournamentId, run.t.id), inArray(tournamentEntries.status, LIVE_ENTRY)));
    pushLater(entrants.flatMap((e) => [e.a, e.b]).filter(Boolean) as string[], {
      title: `${run.t.name} is cancelled`,
      body: "The organizer has called it off. Check the page for details.",
      url: `/t/${run.t.code}`,
    });
  }

  touch(run.t);
  const said: Record<TournamentStatus, string> = {
    draft: "Back to draft. Only organizers can see it.",
    open: "Published. Entries are open.",
    closed: "Entries closed. Make the draws when you're ready.",
    live: "Tournament is live.",
    completed: "Marked complete. Results are final.",
    cancelled: "Tournament cancelled.",
  };
  back(fd, here, said[to]);
}

/** Only a draft nobody has entered can be deleted; anything else is cancelled. */
export async function deleteTournamentAction(fd: FormData) {
  const run = await runnable(str(fd, "tournamentId"));
  if (!run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${run.t.id}`;
  if (run.t.status !== "draft") back(fd, here, "Only a draft can be deleted. Cancel it instead.", true);
  const [any] = await db
    .select({ id: tournamentEntries.id })
    .from(tournamentEntries)
    .where(eq(tournamentEntries.tournamentId, run.t.id));
  if (any) back(fd, here, "It has entries. Cancel it instead.", true);

  await db.delete(tournamentPrizes).where(eq(tournamentPrizes.tournamentId, run.t.id));
  await db.delete(tournamentCategories).where(eq(tournamentCategories.tournamentId, run.t.id));
  await db.delete(tournaments).where(eq(tournaments.id, run.t.id));
  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments?m=${encodeURIComponent("Draft deleted.")}`);
}

/* ---------------------------------------------------------- categories */

const GENDERS: CategoryGender[] = ["men", "women", "mixed", "open"];
const FORMATS: TournamentFormat[] = ["knockout", "round_robin", "groups_knockout"];

function readCategory(fd: FormData) {
  const gender = str(fd, "gender") as CategoryGender;
  const format = str(fd, "format") as TournamentFormat;
  const max = str(fd, "maxEntries");
  return {
    name: str(fd, "name").slice(0, 80),
    gender: GENDERS.includes(gender) ? gender : "open",
    teamSize: str(fd, "teamSize") === "1" ? 1 : 2,
    level: opt(fd, "level")?.slice(0, 40) ?? null,
    format: FORMATS.includes(format) ? format : "knockout",
    groupSize: int(fd, "groupSize", 4, 3, 8),
    advancePerGroup: int(fd, "advancePerGroup", 2, 1, 4),
    maxEntries: max ? int(fd, "maxEntries", 16, 2, 256) : null,
    fee: money(fd, "fee"),
    feeBasis: (str(fd, "feeBasis") === "team" ? "team" : "player") as "team" | "player",
    pointsTo: int(fd, "pointsTo", 21, 5, 51),
    bestOf: str(fd, "bestOf") === "3" ? 3 : 1,
  };
}

function autoName(c: ReturnType<typeof readCategory>) {
  const who = { men: "Men's", women: "Women's", mixed: "Mixed", open: "Open" }[c.gender];
  const what = c.teamSize === 1 ? "Singles" : "Doubles";
  return [who, what, c.level].filter(Boolean).join(" ");
}

export async function saveCategoryAction(fd: FormData) {
  const run = await runnable(str(fd, "tournamentId"));
  if (!run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${run.t.id}`;
  const c = readCategory(fd);
  if (!c.name) c.name = autoName(c);
  if (c.gender === "mixed" && c.teamSize === 1) back(fd, here, "Mixed is a doubles event.", true);
  if (c.advancePerGroup >= c.groupSize) back(fd, here, "Fewer teams have to go through than are in a group.", true);

  const categoryId = str(fd, "categoryId");
  if (categoryId) {
    const existing = await categoryOf(categoryId);
    if (!existing || existing.tournamentId !== run.t.id) back(fd, here, "That category isn't part of this tournament.", true);
    if (existing.drawnAt && (existing.format !== c.format || existing.teamSize !== c.teamSize))
      back(fd, here, "The draw is made. Reset it before changing the format.", true);
    const [entered] = await db
      .select({ id: tournamentEntries.id })
      .from(tournamentEntries)
      .where(and(eq(tournamentEntries.categoryId, categoryId), inArray(tournamentEntries.status, LIVE_ENTRY)));
    if (entered && existing.teamSize !== c.teamSize)
      back(fd, here, "People have entered. Singles/doubles can't change now.", true);
    await db.update(tournamentCategories).set(c).where(eq(tournamentCategories.id, categoryId));
  } else {
    const count = await db
      .select({ id: tournamentCategories.id })
      .from(tournamentCategories)
      .where(eq(tournamentCategories.tournamentId, run.t.id));
    if (count.length >= 30) back(fd, here, "Thirty categories is the limit.", true);
    await db.insert(tournamentCategories).values({
      id: newId("tcat"),
      tournamentId: run.t.id,
      ...c,
      sortOrder: count.length,
      createdAt: new Date(),
    });
  }
  touch(run.t);
  back(fd, here, categoryId ? "Category updated." : `Added ${c.name}.`);
}

export async function deleteCategoryAction(fd: FormData) {
  const run = await runnable(str(fd, "tournamentId"));
  if (!run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${run.t.id}`;
  const c = await categoryOf(str(fd, "categoryId"));
  if (!c || c.tournamentId !== run.t.id) back(fd, here, "That category isn't part of this tournament.", true);
  const [entered] = await db
    .select({ id: tournamentEntries.id })
    .from(tournamentEntries)
    .where(eq(tournamentEntries.categoryId, c.id));
  if (entered) back(fd, here, "It has entries. Withdraw or reject them first.", true);
  await db.delete(tournamentPrizes).where(eq(tournamentPrizes.categoryId, c.id));
  await db.delete(tournamentCategories).where(eq(tournamentCategories.id, c.id));
  touch(run.t);
  back(fd, here, "Category removed.");
}

/* -------------------------------------------------------------- prizes */

const KINDS: PrizeKind[] = ["cash", "trophy", "medal", "voucher", "gift", "other"];

export async function addPrizeAction(fd: FormData) {
  const run = await runnable(str(fd, "tournamentId"));
  if (!run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${run.t.id}`;
  const categoryId = opt(fd, "categoryId");
  if (categoryId) {
    const c = await categoryOf(categoryId);
    if (!c || c.tournamentId !== run.t.id) back(fd, here, "That category isn't part of this tournament.", true);
  }
  const kind = str(fd, "kind") as PrizeKind;
  const place = str(fd, "place");
  const title = opt(fd, "title")?.slice(0, 80) ?? null;
  const amount = str(fd, "amount") ? money(fd, "amount") : null;
  const description = opt(fd, "description")?.slice(0, 200) ?? null;
  const k = KINDS.includes(kind) ? kind : "other";
  if (k === "cash" && !amount) back(fd, here, "Enter the prize money.", true);
  if (k !== "cash" && !description && !title) back(fd, here, "Say what the prize is.", true);
  if (!categoryId && !title) back(fd, here, "A tournament-wide award needs a title, like 'Best newcomer'.", true);

  await db.insert(tournamentPrizes).values({
    id: newId("tpz"),
    tournamentId: run.t.id,
    categoryId,
    place: place && categoryId ? int(fd, "place", 1, 1, 8) : null,
    title,
    kind: k,
    amount,
    description,
  });
  touch(run.t);
  back(fd, here, "Prize added.");
}

export async function deletePrizeAction(fd: FormData) {
  const run = await runnable(str(fd, "tournamentId"));
  if (!run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  await db
    .delete(tournamentPrizes)
    .where(and(eq(tournamentPrizes.id, str(fd, "prizeId")), eq(tournamentPrizes.tournamentId, run.t.id)));
  touch(run.t);
  back(fd, `/admin/tournaments/${run.t.id}`, "Prize removed.");
}

/* ------------------------------------------------------------- entering */

async function confirmedCount(categoryId: string) {
  const rows = await db
    .select({ id: tournamentEntries.id })
    .from(tournamentEntries)
    .where(and(eq(tournamentEntries.categoryId, categoryId), eq(tournamentEntries.status, "confirmed")));
  return rows.length;
}

/** Where a complete entry lands: straight in, in line, or with the organizer. */
async function landing(t: Tournament, c: TournamentCategory): Promise<EntryStatus> {
  if (t.approval === "manual") return "pending";
  if (c.maxEntries && (await confirmedCount(c.id)) >= c.maxEntries) return "waitlisted";
  return "confirmed";
}

async function alreadyIn(categoryId: string, userId: string) {
  const [row] = await db
    .select({ id: tournamentEntries.id })
    .from(tournamentEntries)
    .where(
      and(
        eq(tournamentEntries.categoryId, categoryId),
        inArray(tournamentEntries.status, LIVE_ENTRY),
        or(eq(tournamentEntries.player1Id, userId), eq(tournamentEntries.player2Id, userId)),
      ),
    );
  return Boolean(row);
}

function entriesOpen(t: Tournament, c: TournamentCategory): string | null {
  if (t.status !== "open") return "Entries aren't open.";
  if (t.entryDeadline && todayIso() > t.entryDeadline) return "Entries have closed.";
  if (c.drawnAt) return "The draw for this category is already made.";
  return null;
}

export async function enterTournamentAction(fd: FormData) {
  const account = await member();
  const categoryId = str(fd, "categoryId");
  const c = await categoryOf(categoryId);
  const row = c ? await getTournamentById(c.tournamentId) : null;
  const fallback = row ? `/t/${row.t.code}` : "/tournaments";
  if (!account) redirect(`/signin?next=${encodeURIComponent(fallback)}`);
  if (!c || !row) back(fd, "/tournaments", "That tournament isn't available.", true);
  const t = row.t;

  const closed = entriesOpen(t, c);
  if (closed) back(fd, fallback, closed, true);
  if (t.visibility === "community" && !(await activeMember(t.groupId, account.id)))
    back(fd, fallback, `This tournament is for ${row.g.name} members.`, true);
  const mine = await profileOf(account.id);
  const missing = mine ? missingForTournaments(mine) : ["gender", "playing level"];
  if (missing.length) completeProfileFirst(`/t/${t.code}?c=${c.id}`, missing);
  if (!fd.get("eligible")) back(fd, fallback, "Confirm you meet the category's eligibility.", true);
  if (await alreadyIn(c.id, account.id)) back(fd, fallback, `You're already entered in ${c.name}.`, true);
  if (c.teamSize === 1) {
    const misfit = genderFit(c.gender, [mine!.gender]);
    if (misfit) back(fd, fallback, misfit, true);
  } else {
    // The partner may not have filled in their profile yet; they're asked to
    // when they accept. What can be ruled out now, is.
    const alone =
      (c.gender === "men" && mine!.gender !== "male") ||
      (c.gender === "women" && mine!.gender !== "female") ||
      (c.gender === "mixed" && mine!.gender === "other");
    if (alone) back(fd, fallback, genderFit(c.gender, [mine!.gender, mine!.gender]) ?? "This category doesn't fit your profile.", true);
  }

  let partnerId: string | null = null;
  let partnerName = "";
  if (c.teamSize === 2) {
    const no = Number((str(fd, "partnerNo") || str(fd, "partnerPick")).replace(/[^0-9]/g, ""));
    if (!no) back(fd, fallback, "Enter your partner's player number. It's on their profile.", true);
    const [p] = await db
      .select({ id: users.id, name: users.name, onboardedAt: users.onboardedAt, active: users.active, gender: users.gender })
      .from(users)
      .where(eq(users.playerNo, no));
    if (!p || !p.active) back(fd, fallback, `No player has the number ${no}.`, true);
    if (p.id === account.id) back(fd, fallback, "That's your own number. Enter your partner's.", true);
    if (!(await isRegistered(p.id)) || !p.onboardedAt)
      back(fd, fallback, `${p.name} needs a SmashQ account to accept. Ask them to sign in once.`, true);
    if (t.visibility === "community" && !(await activeMember(t.groupId, p.id)))
      back(fd, fallback, `${p.name} isn't a member of ${row.g.name}.`, true);
    if (await alreadyIn(c.id, p.id)) back(fd, fallback, `${p.name} is already entered in ${c.name}.`, true);
    if (p.gender) {
      const misfit = genderFit(c.gender, [mine!.gender, p.gender]);
      if (misfit) back(fd, fallback, `${misfit} Check the category, or your partner.`, true);
    }
    partnerId = p.id;
    partnerName = p.name;
  }

  const status: EntryStatus = partnerId ? "partner" : await landing(t, c);
  const amountDue = c.feeBasis === "team" ? c.fee : c.fee * c.teamSize;
  await db.insert(tournamentEntries).values({
    id: newId("ten"),
    tournamentId: t.id,
    categoryId: c.id,
    player1Id: account.id,
    player2Id: partnerId,
    teamName: opt(fd, "teamName")?.slice(0, 40) ?? null,
    note: opt(fd, "note")?.slice(0, 300) ?? null,
    status,
    amountDue,
    paymentStatus: amountDue > 0 ? "unpaid" : "waived",
    createdBy: account.id,
    createdAt: new Date(),
  });

  if (partnerId) {
    pushLater([partnerId], {
      title: "Partner request",
      body: `${account.name} wants you as their partner in ${c.name} at ${t.name}.`,
      url: "/me#tournaments",
      tag: `partner-${c.id}`,
    });
  } else if (status === "pending") {
    pushLater(await hostRunners(t.groupId), {
      title: "New tournament entry",
      body: `${account.name} entered ${c.name}.`,
      url: `/admin/tournaments/${t.id}?tab=entries`,
      tag: `entries-${t.id}`,
    });
  }
  touch(t);
  back(
    fd,
    fallback,
    partnerId
      ? `Entered. ${partnerName} has to accept before it counts.`
      : status === "confirmed"
        ? `You're in ${c.name}.`
        : status === "waitlisted"
          ? `${c.name} is full. You're on the waiting list.`
          : "Entered. The organizer will confirm it.",
  );
}

/** The named partner says yes or no. Only they can. */
export async function answerPartnerAction(fd: FormData) {
  const account = await member();
  if (!account) redirect("/signin?next=/me");
  const [e] = await db.select().from(tournamentEntries).where(eq(tournamentEntries.id, str(fd, "entryId")));
  if (!e || e.player2Id !== account.id || e.status !== "partner")
    back(fd, "/me", "That request isn't waiting for you.", true);
  const c = await categoryOf(e.categoryId);
  const row = await getTournamentById(e.tournamentId);
  if (!c || !row) back(fd, "/me", "That tournament isn't available.", true);

  if (str(fd, "answer") !== "yes") {
    await db
      .update(tournamentEntries)
      .set({ status: "withdrawn", decidedAt: new Date(), decidedBy: account.id })
      .where(eq(tournamentEntries.id, e.id));
    pushLater([e.player1Id], {
      title: "Partner declined",
      body: `${account.name} can't partner you in ${c.name}. Enter again with someone else.`,
      url: `/t/${row.t.code}`,
    });
    touch(row.t);
    back(fd, "/me", "Declined.");
  }

  const closed = entriesOpen(row.t, c);
  if (closed) back(fd, "/me", closed, true);
  if (row.t.visibility === "community" && !(await activeMember(row.t.groupId, account.id)))
    back(fd, "/me", `This tournament is for ${row.g.name} members.`, true);
  const mine = await profileOf(account.id);
  const missing = mine ? missingForTournaments(mine) : ["gender", "playing level"];
  if (missing.length) completeProfileFirst(safeNext(str(fd, "next"), "/me"), missing);
  const lead = await profileOf(e.player1Id);
  const misfit = genderFit(c.gender, [lead?.gender ?? null, mine!.gender]);
  if (misfit) {
    // The request can never become valid, so it shouldn't sit there blocking
    // either player from entering the category with someone else.
    await db
      .update(tournamentEntries)
      .set({ status: "withdrawn", decidedAt: new Date(), decidedBy: account.id })
      .where(eq(tournamentEntries.id, e.id));
    pushLater([e.player1Id], {
      title: "Entry can't go ahead",
      body: `${misfit} Your ${c.name} entry with ${account.name} was withdrawn.`,
      url: `/t/${row.t.code}?c=${c.id}`,
    });
    touch(row.t);
    back(fd, "/me", `${misfit} The request was withdrawn, so you're both free to enter with someone else.`, true);
  }
  // Somebody else may have entered them in the meantime.
  const [other] = await db
    .select({ id: tournamentEntries.id })
    .from(tournamentEntries)
    .where(
      and(
        eq(tournamentEntries.categoryId, c.id),
        inArray(tournamentEntries.status, ["pending", "confirmed", "waitlisted"]),
        or(eq(tournamentEntries.player1Id, account.id), eq(tournamentEntries.player2Id, account.id)),
      ),
    );
  if (other) back(fd, "/me", `You're already in ${c.name} with someone else.`, true);

  const status = await landing(row.t, c);
  await db.update(tournamentEntries).set({ status }).where(eq(tournamentEntries.id, e.id));
  pushLater([e.player1Id], {
    title: "Partner accepted",
    body: `${account.name} is in with you for ${c.name}.`,
    url: `/t/${row.t.code}`,
  });
  if (status === "pending")
    pushLater(await hostRunners(row.t.groupId), {
      title: "New tournament entry",
      body: `A new pair entered ${c.name}.`,
      url: `/admin/tournaments/${row.t.id}?tab=entries`,
      tag: `entries-${row.t.id}`,
    });
  touch(row.t);
  back(
    fd,
    "/me",
    status === "confirmed" ? "You're in." : status === "waitlisted" ? "Accepted. The category is full, so you're on the waiting list." : "Accepted. The organizer will confirm the entry.",
  );
}

/** First in line moves up when a confirmed place frees. */
async function promoteWaitlist(t: Tournament, c: TournamentCategory) {
  if (c.maxEntries && (await confirmedCount(c.id)) >= c.maxEntries) return;
  const [next] = await db
    .select()
    .from(tournamentEntries)
    .where(and(eq(tournamentEntries.categoryId, c.id), eq(tournamentEntries.status, "waitlisted")))
    .orderBy(tournamentEntries.createdAt)
    .limit(1);
  if (!next) return;
  await db.update(tournamentEntries).set({ status: "confirmed" }).where(eq(tournamentEntries.id, next.id));
  pushLater([next.player1Id, next.player2Id].filter(Boolean) as string[], {
    title: "You're in",
    body: `A place opened up in ${c.name} at ${t.name}.`,
    url: `/t/${t.code}`,
  });
}

/** Either player can pull the entry out, until the draw is made. */
export async function withdrawEntryAction(fd: FormData) {
  const account = await member();
  if (!account) redirect("/signin?next=/me");
  const [e] = await db.select().from(tournamentEntries).where(eq(tournamentEntries.id, str(fd, "entryId")));
  const row = e ? await getTournamentById(e.tournamentId) : null;
  const c = e ? await categoryOf(e.categoryId) : null;
  if (!e || !row || !c || (e.player1Id !== account.id && e.player2Id !== account.id))
    back(fd, "/me", "That isn't your entry.", true);
  if (!LIVE_ENTRY.includes(e.status)) back(fd, `/t/${row.t.code}`, "That entry is already out.", true);
  if (c.drawnAt) back(fd, `/t/${row.t.code}`, "The draw is made. Ask the organizer.", true);

  await db
    .update(tournamentEntries)
    .set({ status: "withdrawn", decidedAt: new Date(), decidedBy: account.id })
    .where(eq(tournamentEntries.id, e.id));
  const other = e.player1Id === account.id ? e.player2Id : e.player1Id;
  if (other)
    pushLater([other], {
      title: "Entry withdrawn",
      body: `${account.name} withdrew your ${c.name} entry at ${row.t.name}.`,
      url: `/t/${row.t.code}`,
    });
  if (e.status === "confirmed") await promoteWaitlist(row.t, c);
  touch(row.t);
  back(fd, `/t/${row.t.code}`, "Withdrawn.");
}

/* ----------------------------------------------- organizer: the entries */

async function entryForRunner(fd: FormData) {
  const [e] = await db.select().from(tournamentEntries).where(eq(tournamentEntries.id, str(fd, "entryId")));
  if (!e) return null;
  const run = await runnable(e.tournamentId);
  if (!run) return null;
  const c = await categoryOf(e.categoryId);
  if (!c) return null;
  return { e, c, ...run };
}

export async function decideEntryAction(fd: FormData) {
  const r = await entryForRunner(fd);
  if (!r) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${r.t.id}?tab=entries`;
  const to = str(fd, "status") as EntryStatus;
  if (!["confirmed", "waitlisted", "rejected", "pending"].includes(to)) back(fd, here, "Unknown decision.", true);
  if (r.e.status === "partner") back(fd, here, "Their partner hasn't accepted yet.", true);
  if (r.c.drawnAt && (r.e.status === "confirmed" || to === "confirmed"))
    back(fd, here, "The draw is made. Reset it to change who's in.", true);
  if (to === "confirmed" && r.e.status !== "confirmed" && r.c.maxEntries && (await confirmedCount(r.c.id)) >= r.c.maxEntries)
    back(fd, here, `${r.c.name} is full (${r.c.maxEntries}). Raise the limit or waitlist them.`, true);

  await db
    .update(tournamentEntries)
    .set({ status: to, decidedAt: new Date(), decidedBy: r.account.id })
    .where(eq(tournamentEntries.id, r.e.id));
  if (to !== r.e.status && to !== "pending") {
    const words = { confirmed: "You're in", waitlisted: "You're on the waiting list", rejected: "Entry not accepted" } as const;
    pushLater([r.e.player1Id, r.e.player2Id].filter(Boolean) as string[], {
      title: words[to as keyof typeof words],
      body: `${r.c.name} at ${r.t.name}.`,
      url: `/t/${r.t.code}`,
    });
  }
  if (r.e.status === "confirmed" && to !== "confirmed") await promoteWaitlist(r.t, r.c);
  touch(r.t);
  back(fd, here, "Updated.");
}

export async function entryPaymentAction(fd: FormData) {
  const r = await entryForRunner(fd);
  if (!r) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${r.t.id}?tab=entries`;
  const status = str(fd, "paymentStatus") as PaymentStatus;
  if (!["paid", "unpaid", "waived"].includes(status)) back(fd, here, "Unknown payment status.", true);
  const method = str(fd, "method") as PaymentMethod;
  await db
    .update(tournamentEntries)
    .set({
      paymentStatus: status,
      paymentMethod: status === "paid" ? (["cash", "transfer", "online"].includes(method) ? method : "cash") : null,
      paidAt: status === "paid" ? new Date() : null,
      paymentRecordedBy: r.account.id,
    })
    .where(eq(tournamentEntries.id, r.e.id));
  touch(r.t);
  back(fd, here, status === "paid" ? "Marked paid." : status === "waived" ? "Fee waived." : "Marked unpaid.");
}

/** Organizer seeding, one number per entry; blank means seed by rating. */
export async function saveSeedsAction(fd: FormData) {
  const c = await categoryOf(str(fd, "categoryId"));
  const run = c ? await runnable(c.tournamentId) : null;
  if (!c || !run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${run.t.id}?tab=draws`;
  if (c.drawnAt) back(fd, here, "The draw is made. Reset it to change seeds.", true);
  const entries = await db
    .select({ id: tournamentEntries.id })
    .from(tournamentEntries)
    .where(eq(tournamentEntries.categoryId, c.id));
  for (const { id } of entries) {
    const raw = str(fd, `seed_${id}`);
    const seed = raw ? Math.max(1, Math.min(256, Math.round(Number(raw)) || 0)) : null;
    await db.update(tournamentEntries).set({ seed: seed || null }).where(eq(tournamentEntries.id, id));
  }
  touch(run.t);
  back(fd, here, "Seeds saved.");
}

/* ---------------------------------------------------------------- draws */

function toRows(draw: DrawMatch[], t: Tournament, c: TournamentCategory) {
  const ids = new Map(draw.map((m) => [m.key, newId("tm")]));
  const now = new Date();
  return draw.map((m) => ({
    id: ids.get(m.key)!,
    tournamentId: t.id,
    categoryId: c.id,
    stage: m.stage,
    groupLabel: m.groupLabel,
    round: m.round,
    slot: m.slot,
    entryAId: m.entryA,
    entryBId: m.entryB,
    winnerEntryId: m.winner,
    status: m.status,
    nextMatchId: m.nextKey ? ids.get(m.nextKey)! : null,
    nextSide: m.nextSide,
    completedAt: m.status === "bye" ? now : null,
    createdAt: now,
  }));
}

export async function makeDrawAction(fd: FormData) {
  const c = await categoryOf(str(fd, "categoryId"));
  const run = c ? await runnable(c.tournamentId) : null;
  if (!c || !run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${run.t.id}?tab=draws`;
  if (c.drawnAt) back(fd, here, "The draw is already made.", true);
  if (["draft", "cancelled", "completed"].includes(run.t.status)) back(fd, here, "Publish the tournament first.", true);

  const detail = await tournamentDetail(run.t, run.g);
  const cat = detail.categories.find((x) => x.id === c.id)!;
  const seeded = seededOrder(cat.entries.filter((e) => e.status === "confirmed")).map((e) => e.id);
  if (seeded.length < 2) back(fd, here, "At least two confirmed entries are needed for a draw.", true);

  const draw =
    c.format === "round_robin"
      ? roundRobinDraw(seeded, null)
      : c.format === "groups_knockout"
        ? seeded.length <= c.groupSize
          ? roundRobinDraw(seeded, "A")
          : groupStageDraw(seeded, c.groupSize)
        : knockoutDraw(seeded);

  await db.insert(tournamentMatches).values(toRows(draw, run.t, c));
  await db.update(tournamentCategories).set({ drawnAt: new Date() }).where(eq(tournamentCategories.id, c.id));

  const players = cat.entries
    .filter((e) => e.status === "confirmed")
    .flatMap((e) => [e.player1Id, e.player2Id])
    .filter(Boolean) as string[];
  pushLater(players, {
    title: `${c.name}: draw is out`,
    body: `See who you play at ${run.t.name}.`,
    url: `/t/${run.t.code}?c=${c.id}`,
    tag: `draw-${c.id}`,
  });
  touch(run.t);
  back(fd, here, `Draw made for ${c.name}.`);
}

export async function resetDrawAction(fd: FormData) {
  const c = await categoryOf(str(fd, "categoryId"));
  const run = c ? await runnable(c.tournamentId) : null;
  if (!c || !run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${run.t.id}?tab=draws`;
  const played = await db
    .select({ id: tournamentMatches.id })
    .from(tournamentMatches)
    .where(and(eq(tournamentMatches.categoryId, c.id), eq(tournamentMatches.status, "completed")));
  if (played.length && !fd.get("confirm"))
    back(fd, here, `${played.length} results would be lost. Tick the box to confirm.`, true);

  await db.delete(tournamentMatches).where(eq(tournamentMatches.categoryId, c.id));
  await db.update(tournamentCategories).set({ drawnAt: null }).where(eq(tournamentCategories.id, c.id));
  touch(run.t);
  back(fd, here, `Draw for ${c.name} cleared.`);
}

/** After a group stage: the knockout, from the tables. */
export async function buildKnockoutAction(fd: FormData) {
  const c = await categoryOf(str(fd, "categoryId"));
  const run = c ? await runnable(c.tournamentId) : null;
  if (!c || !run) back(fd, "/admin/tournaments", "Only this community's organizers can do that.", true);
  const here = `/admin/tournaments/${run.t.id}?tab=draws`;
  if (c.format !== "groups_knockout") back(fd, here, "This category has no knockout stage.", true);

  const detail = await tournamentDetail(run.t, run.g);
  const cat = detail.categories.find((x) => x.id === c.id)!;
  if (cat.hasKnockout) back(fd, here, "The knockout is already drawn.", true);
  if (!cat.groupStageDone) back(fd, here, "Finish every group match first.", true);

  const tables = cat.tables.map((t) => ({ label: t.label, order: t.rows.map((r) => r.entryId) }));
  const advance = Math.min(c.advancePerGroup, ...tables.map((t) => t.order.length));
  const qualifiers = tables.length * advance;
  if (qualifiers < 2) back(fd, here, "Only one team would go through — no knockout needed.", true);

  const draw = knockoutFromGroups(tables, advance);
  await db.insert(tournamentMatches).values(toRows(draw, run.t, c));
  touch(run.t);
  back(fd, here, `Knockout drawn: ${qualifiers} teams go through.`);
}

/* -------------------------------------------------------------- results */

/**
 * Who may record a result: anyone who can run the court for the host
 * community — its staff accounts, or a phone unlocked with its PIN.
 */
async function canRecord(groupId: string) {
  const account = await currentAccount();
  return { ok: canStaff(account, groupId) || (await isStaffFor(groupId)), account };
}

function readGames(fd: FormData, bestOf: number): Games {
  const games: Games = [];
  for (let i = 1; i <= bestOf; i++) {
    const a = str(fd, `g${i}a`);
    const b = str(fd, `g${i}b`);
    if (a === "" && b === "") continue;
    games.push([Math.round(Number(a)), Math.round(Number(b))]);
  }
  return games;
}

export async function recordResultAction(fd: FormData) {
  const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, str(fd, "matchId")));
  const row = m ? await getTournamentById(m.tournamentId) : null;
  const c = m ? await categoryOf(m.categoryId) : null;
  if (!m || !row || !c) back(fd, "/tournaments", "That match isn't available.", true);
  const here = `/t/${row.t.code}?c=${c.id}`;
  const who = await canRecord(row.t.groupId);
  if (!who.ok) back(fd, here, "Only the organizers can record results.", true);
  if (!m.entryAId || !m.entryBId || m.status === "bye" || m.status === "pending")
    back(fd, here, "Both sides aren't known yet.", true);
  if (["draft", "cancelled"].includes(row.t.status)) back(fd, here, "This tournament isn't running.", true);

  let winner: string;
  let scores: Games | null = null;
  const walkover = str(fd, "walkover");
  if (walkover === "A" || walkover === "B") {
    winner = walkover === "A" ? m.entryAId : m.entryBId;
  } else {
    const games = readGames(fd, c.bestOf);
    const verdict = judgeScores(games, c.bestOf);
    if ("error" in verdict) back(fd, here, verdict.error, true);
    winner = verdict.winner === "A" ? m.entryAId : m.entryBId;
    scores = games;
  }

  // Correcting a result that changes who went through is only safe while
  // the next round hasn't been played.
  if (m.nextMatchId && m.winnerEntryId && m.winnerEntryId !== winner) {
    const [next] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, m.nextMatchId));
    if (next?.status === "completed") back(fd, here, "The next round is already played. Clear that result first.", true);
  }
  if (m.stage === "group") {
    const [ko] = await db
      .select({ id: tournamentMatches.id })
      .from(tournamentMatches)
      .where(and(eq(tournamentMatches.categoryId, c.id), eq(tournamentMatches.stage, "knockout")));
    if (ko) back(fd, here, "The knockout is already drawn from these groups. Reset it to change group results.", true);
  }

  await db
    .update(tournamentMatches)
    .set({ scores, winnerEntryId: winner, status: "completed", completedAt: new Date(), enteredBy: who.account?.id ?? null })
    .where(eq(tournamentMatches.id, m.id));
  await advance(m.nextMatchId, m.nextSide, winner);

  if (row.t.status === "open" || row.t.status === "closed")
    await db.update(tournaments).set({ status: "live" }).where(eq(tournaments.id, row.t.id));
  touch(row.t);
  back(fd, here, walkover ? "Walkover recorded." : "Result saved.");
}

async function advance(nextMatchId: string | null, side: "A" | "B" | null, entryId: string | null) {
  if (!nextMatchId || !side) return;
  const [next] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, nextMatchId));
  if (!next) return;
  const a = side === "A" ? entryId : next.entryAId;
  const b = side === "B" ? entryId : next.entryBId;
  await db
    .update(tournamentMatches)
    .set({ entryAId: a, entryBId: b, status: a && b ? "ready" : "pending" })
    .where(eq(tournamentMatches.id, next.id));
}

export async function clearResultAction(fd: FormData) {
  const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, str(fd, "matchId")));
  const row = m ? await getTournamentById(m.tournamentId) : null;
  if (!m || !row) back(fd, "/tournaments", "That match isn't available.", true);
  const here = `/t/${row.t.code}?c=${m.categoryId}`;
  const who = await canRecord(row.t.groupId);
  if (!who.ok) back(fd, here, "Only the organizers can change results.", true);
  if (m.status !== "completed") back(fd, here, "There's no result to clear.", true);
  if (m.nextMatchId) {
    const [next] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, m.nextMatchId));
    if (next?.status === "completed") back(fd, here, "The next round is already played. Clear that first.", true);
  }
  if (m.stage === "group") {
    const [ko] = await db
      .select({ id: tournamentMatches.id })
      .from(tournamentMatches)
      .where(and(eq(tournamentMatches.categoryId, m.categoryId), eq(tournamentMatches.stage, "knockout")));
    if (ko) back(fd, here, "The knockout is drawn from these groups. Reset it first.", true);
  }
  await db
    .update(tournamentMatches)
    .set({ scores: null, winnerEntryId: null, status: "ready", completedAt: null })
    .where(eq(tournamentMatches.id, m.id));
  await advance(m.nextMatchId, m.nextSide, null);
  touch(row.t);
  back(fd, here, "Result cleared.");
}

export async function scheduleMatchAction(fd: FormData) {
  const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, str(fd, "matchId")));
  const row = m ? await getTournamentById(m.tournamentId) : null;
  if (!m || !row) back(fd, "/tournaments", "That match isn't available.", true);
  const here = `/t/${row.t.code}?c=${m.categoryId}`;
  if (!(await canRecord(row.t.groupId)).ok) back(fd, here, "Only the organizers can do that.", true);
  await db
    .update(tournamentMatches)
    .set({ court: opt(fd, "court")?.slice(0, 20) ?? null, scheduledAt: opt(fd, "time")?.slice(0, 20) ?? null })
    .where(eq(tournamentMatches.id, m.id));
  touch(row.t);
  back(fd, here, "Court and time saved.");
}
