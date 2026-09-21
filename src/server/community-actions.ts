"use server";

/**
 * Communities: creating them, staffing them, getting into them.
 *
 * Three roles meet in this file and the whole design is about keeping them
 * apart.
 *
 *   Platform admin — makes communities and appoints the people who run them.
 *                    Scoped to nothing, which is why it lives on `users` and
 *                    not in a membership row.
 *   Organizer      — runs one community: its venues, its sessions, its
 *                    roster, its money. Can invite, and can appoint other
 *                    organizers beside them.
 *   Player         — belongs to a community, and sees nothing of one they do
 *                    not belong to.
 *
 * Every export here is a reachable endpoint. A server action can be invoked
 * by anyone who can post a form, so the permission check lives in the action
 * and never only in the page that draws the button.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  authEmails, groupInvites, groupMembers, groups, users,
  type JoinPolicy, type MemberRole, type Visibility,
} from "@/db/schema";
import { inviteCode as mintInviteCode, newId } from "@/lib/ids";
import { colorFor } from "@/lib/format";
import { uniqueSlug } from "@/lib/slug";
import { joinPolicyOf } from "@/lib/join-policy";
import { canOrganize, currentAccount, isPlatformAdmin, normalizeEmail } from "@/lib/auth";
import { currentUserId, setCurrentUserId } from "@/lib/identity";
import { setActiveCommunity } from "@/lib/tenant";
import { requestOrigin } from "@/lib/origin";
import { sendInvite } from "@/lib/mail";
import { DEFAULT_WEIGHTS, BALANCE_BY_TYPE } from "@/lib/queue-engine";
import type { CommunityFormState, InviteView, JoinFormState } from "./community-types";

type Result = { ok: boolean; message?: string; id?: string };
type InviteResult = Result & { url?: string; delivered?: boolean };

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const mintToken = () => randomBytes(32).toString("base64url");

function touch() {
  revalidatePath("/", "layout");
}

/** Loose match so "arun menon", "Arun  Menon" and "ArunMenon" all collide. */
const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------------------------------------------------- platform: creating */

export async function createCommunity(input: {
  name: string;
  location?: string;
  description?: string;
  visibility?: Visibility;
  joinPolicy?: JoinPolicy;
  currency?: string;
  defaultFee?: number;
  staffPin?: string;
  organizerName?: string;
  organizerEmail?: string;
}): Promise<Result & { slug?: string }> {
  const account = await currentAccount();
  if (!isPlatformAdmin(account)) return { ok: false, message: "Not allowed" };

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, message: "Give the community a name" };
  if (name.length > 60) return { ok: false, message: "That name is too long" };

  const pin = (input.staffPin ?? "").trim() || String(Math.floor(100000 + Math.random() * 900000));
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, message: "PIN must be 4 to 8 digits" };

  // A community with no organizer is a community nobody can run, so the
  // appointment happens in the same step rather than being something to
  // remember afterwards.
  const organizerName = (input.organizerName ?? "").trim();
  const organizerEmail = normalizeEmail(input.organizerEmail ?? "");
  if (!organizerName) return { ok: false, message: "Name the organizer who will run it" };
  if (!LOOKS_LIKE_EMAIL.test(organizerEmail))
    return { ok: false, message: "The organizer needs a real email address — it is how they sign in" };

  const taken = await db.select({ slug: groups.slug }).from(groups);
  const slug = uniqueSlug(name, taken.map((g) => g.slug));

  const now = new Date();
  const organizerId = await upsertAccountUser(organizerName, organizerEmail);
  if (!organizerId.ok) return organizerId;

  const groupId = newId("grp");
  await db.insert(groups).values({
    id: groupId,
    name,
    slug,
    ownerId: organizerId.id!,
    location: input.location?.trim() || null,
    description: input.description?.trim() || null,
    visibility: input.visibility === "public" ? "public" : "private",
    inviteCode: await freshInviteCode(),
    defaultFee: Number.isFinite(input.defaultFee) ? Math.max(0, input.defaultFee!) : 40,
    currency: (input.currency ?? "AED").trim().toUpperCase().slice(0, 4) || "AED",
    settings: {
      staffPin: pin,
      pointsTo: 30,
      defaultGameType: "balanced",
      weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.balanced },
      requireScoreConfirmation: false,
      joinPolicy: input.joinPolicy ?? "approval",
    },
    createdAt: now,
  });

  await db.insert(groupMembers).values({
    id: newId("gm"),
    groupId,
    userId: organizerId.id!,
    role: "organizer",
    status: "active",
    joinedAt: now,
  });

  touch();
  return { ok: true, id: groupId, slug };
}

/**
 * Finds the person behind an email address, or makes them.
 *
 * Attaching the address to an existing player rather than creating a second
 * row is the whole point: rating, games played, partner history and fairness
 * all key off one user id, and splitting a person in two corrupts every one
 * of them silently.
 */
async function upsertAccountUser(name: string, email: string): Promise<Result> {
  const now = new Date();
  const [identity] = await db.select().from(authEmails).where(eq(authEmails.email, email));
  if (identity) return { ok: true, id: identity.userId };

  // No sign-in address yet, but the person may already exist as a player who
  // handed over a contact address at some point.
  const [byContact] = await db.select().from(users).where(eq(users.email, email));
  const userId = byContact?.id ?? newId("usr");

  if (!byContact) {
    await db.insert(users).values({
      id: userId,
      name,
      email,
      avatarColor: colorFor(name),
      rating: 1200,
      createdAt: now,
    });
  }

  await db
    .insert(authEmails)
    .values({ id: newId("aem"), userId, email, createdAt: now });

  return { ok: true, id: userId };
}

async function freshInviteCode(): Promise<string> {
  // The alphabet is 34 characters and the code is eight of them, so a
  // collision is vanishingly unlikely — but "vanishingly" is not "never", and
  // the unique index would otherwise turn it into a 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintInviteCode();
    const [clash] = await db.select({ id: groups.id }).from(groups).where(eq(groups.inviteCode, code));
    if (!clash) return code;
  }
  return `${mintInviteCode()}${Date.now().toString(36).toUpperCase().slice(-2)}`;
}

export async function archiveCommunity(groupId: string, archived: boolean): Promise<Result> {
  if (!isPlatformAdmin(await currentAccount())) return { ok: false, message: "Not allowed" };
  await db
    .update(groups)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(groups.id, groupId));
  touch();
  return { ok: true };
}

/* ------------------------------------------------- community: the basics */

export async function setCommunityProfile(
  groupId: string,
  patch: { description?: string; visibility?: Visibility },
): Promise<Result> {
  if (!canOrganize(await currentAccount(), groupId)) return { ok: false, message: "Not allowed" };

  const next: Record<string, unknown> = {};
  if (patch.description !== undefined) next.description = patch.description.trim().slice(0, 500) || null;
  if (patch.visibility) next.visibility = patch.visibility === "public" ? "public" : "private";
  if (Object.keys(next).length) await db.update(groups).set(next).where(eq(groups.id, groupId));

  touch();
  return { ok: true };
}

/**
 * Replaces the shareable code.
 *
 * Worth having as a button rather than a support request: an invite code
 * lives in a WhatsApp group forever, people leave that group, and the only
 * honest answer to "can you stop that code working" is a new one.
 */
export async function rotateInviteCode(groupId: string): Promise<Result> {
  if (!canOrganize(await currentAccount(), groupId)) return { ok: false, message: "Not allowed" };
  const code = await freshInviteCode();
  await db.update(groups).set({ inviteCode: code }).where(eq(groups.id, groupId));
  touch();
  return { ok: true, message: code };
}

/* ------------------------------------------------------------ organizers */

/**
 * Appoints somebody to run a community.
 *
 * Open to platform admins and to the community's existing organizers. An
 * organizer who cannot hand the job to a co-organizer is one holiday away
 * from being a single point of failure.
 */
export async function appointOrganizer(
  groupId: string,
  name: string,
  email: string,
  role: MemberRole = "organizer",
): Promise<Result> {
  const account = await currentAccount();
  if (!canOrganize(account, groupId)) return { ok: false, message: "Not allowed" };

  const clean = name.trim().replace(/\s+/g, " ");
  const address = normalizeEmail(email);
  if (clean.length < 2) return { ok: false, message: "Who is it?" };
  if (!LOOKS_LIKE_EMAIL.test(address))
    return { ok: false, message: "An organizer needs an email address — it is how they sign in" };
  if (role !== "organizer" && role !== "coordinator")
    return { ok: false, message: "Unknown role" };

  const person = await upsertAccountUser(clean, address);
  if (!person.ok || !person.id) return person;

  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, person.id)));

  if (existing) {
    await db
      .update(groupMembers)
      .set({ role, status: "active" })
      .where(eq(groupMembers.id, existing.id));
  } else {
    await db.insert(groupMembers).values({
      id: newId("gm"),
      groupId,
      userId: person.id,
      role,
      status: "active",
      joinedAt: new Date(),
    });
  }

  touch();
  return { ok: true, id: person.id };
}

/**
 * Takes the job away, leaving the person in the community as a player.
 *
 * Refuses to remove the last one. A community with no organizer cannot add a
 * venue, run a night or approve a member, and the only way out would be a
 * platform admin noticing.
 */
export async function stepDownOrganizer(groupId: string, membershipId: string): Promise<Result> {
  const account = await currentAccount();
  if (!canOrganize(account, groupId)) return { ok: false, message: "Not allowed" };

  const [member] = await db.select().from(groupMembers).where(eq(groupMembers.id, membershipId));
  if (!member || member.groupId !== groupId) return { ok: false, message: "Not found" };
  if (member.role !== "organizer") {
    await db.update(groupMembers).set({ role: "player" }).where(eq(groupMembers.id, membershipId));
    touch();
    return { ok: true };
  }

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.role, "organizer"),
        eq(groupMembers.status, "active"),
      ),
    );
  if (n <= 1)
    return { ok: false, message: "That is the only organizer. Appoint another one first." };

  await db.update(groupMembers).set({ role: "player" }).where(eq(groupMembers.id, membershipId));
  touch();
  return { ok: true };
}

/* --------------------------------------------------------------- invites */

/**
 * Invites one named person.
 *
 * Distinct from the shareable code on purpose: the organizer has named this
 * person in advance, so accepting is the approval and there is nothing left
 * to wait for — even in a community that vets everybody else.
 */
export async function createInvite(
  groupId: string,
  input: { email?: string; name?: string; role?: MemberRole },
): Promise<InviteResult> {
  const account = await currentAccount();
  if (!canOrganize(account, groupId)) return { ok: false, message: "Not allowed" };

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group) return { ok: false, message: "Community not found" };

  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (email && !LOOKS_LIKE_EMAIL.test(email))
    return { ok: false, message: "That doesn't look like an email address" };

  const role: MemberRole =
    input.role === "coordinator" || input.role === "organizer" ? input.role : "player";

  const token = mintToken();
  const now = new Date();
  await db.insert(groupInvites).values({
    id: newId("inv"),
    groupId,
    email,
    name: input.name?.trim().slice(0, 60) || null,
    tokenHash: hash(token),
    role,
    invitedBy: account?.id ?? null,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    createdAt: now,
  });

  const url = `${await requestOrigin()}/i/${token}`;

  // The link is returned either way. Most of these will travel by WhatsApp
  // whatever the mail provider does, and an organizer standing in a hall
  // should not have to find out whether Resend is configured.
  let delivered = false;
  if (email) {
    const sent = await sendInvite(email, url, group.name, account?.name ?? "An organizer", input.name);
    delivered = sent.delivered;
  }

  touch();
  return { ok: true, url, delivered };
}

export async function revokeInvite(groupId: string, inviteId: string): Promise<Result> {
  if (!canOrganize(await currentAccount(), groupId)) return { ok: false, message: "Not allowed" };
  await db
    .update(groupInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(groupInvites.id, inviteId), eq(groupInvites.groupId, groupId)));
  touch();
  return { ok: true };
}

/** Reads an invitation without spending it, so the page can show what it is. */
export async function inspectInvite(token: string): Promise<InviteView | null> {
  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.tokenHash, hash(token)));
  if (!invite) return null;
  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() < Date.now()) return null;

  const [group] = await db.select().from(groups).where(eq(groups.id, invite.groupId));
  if (!group || group.archivedAt) return null;

  const userId = await currentUserId();
  let alreadyIn = false;
  if (userId) {
    const [member] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, invite.groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.status, "active"),
        ),
      );
    alreadyIn = Boolean(member);
  }

  return {
    token,
    groupId: group.id,
    groupName: group.name,
    slug: group.slug,
    role: invite.role,
    name: invite.name,
    alreadyIn,
  };
}

/* ------------------------------------------------------------- accepting */

/**
 * Puts somebody into a community.
 *
 * One place, whichever door they came through, because the two doors differ
 * only in what status the membership starts at. Keeping them in one function
 * means an invitation and a join request can never drift into disagreeing
 * about what "in" means.
 */
async function place(
  groupId: string,
  userId: string,
  status: "active" | "pending",
  role: MemberRole,
  note?: string | null,
): Promise<Result> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

  if (existing) {
    if (existing.status === "active") return { ok: true, message: "already" };
    if (existing.status === "pending" && status === "pending")
      return { ok: true, message: "waiting" };
    await db
      .update(groupMembers)
      .set({
        status,
        // An invitation outranks whatever they were before, including a
        // previous decline: the organizer has just said yes in advance.
        role: status === "active" ? role : existing.role,
        note: note ?? existing.note,
        requestedAt: status === "pending" ? now : existing.requestedAt,
        decidedAt: status === "active" ? now : null,
      })
      .where(eq(groupMembers.id, existing.id));
    return { ok: true, id: existing.id };
  }

  const id = newId("gm");
  await db.insert(groupMembers).values({
    id,
    groupId,
    userId,
    role: status === "active" ? role : "player",
    status,
    note: note ?? null,
    requestedAt: status === "pending" ? now : null,
    decidedAt: status === "active" ? now : null,
    joinedAt: now,
  });
  return { ok: true, id };
}

/**
 * Resolves who is accepting: the identity already on this phone, or a new
 * person typing their name for the first time.
 *
 * The duplicate-name guard from self-registration applies here too. Somebody
 * who is already on the roster and types their own name into an invite must
 * end up as themselves, not as a second record carrying none of their games.
 */
async function resolveJoiner(
  groupId: string,
  typedName?: string,
): Promise<Result & { duplicate?: { id: string; name: string } }> {
  const existingId = await currentUserId();
  if (existingId) {
    const [user] = await db.select().from(users).where(eq(users.id, existingId));
    if (user) return { ok: true, id: user.id };
  }

  const clean = (typedName ?? "").trim().replace(/\s+/g, " ");
  if (clean.length < 2) return { ok: false, message: "Please enter your name" };
  if (clean.length > 40) return { ok: false, message: "That name is too long" };

  const roster = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));

  const key = nameKey(clean);
  const clash = roster.find((u) => nameKey(u.name) === key);
  if (clash)
    return {
      ok: false,
      message: `${clash.name} is already on the list.`,
      duplicate: { id: clash.id, name: clash.name },
    };

  const userId = newId("usr");
  await db.insert(users).values({
    id: userId,
    name: clean,
    avatarColor: colorFor(clean),
    rating: 1200,
    createdAt: new Date(),
  });
  return { ok: true, id: userId };
}

export async function acceptInvite(token: string, name?: string): Promise<Result> {
  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.tokenHash, hash(token)));
  if (!invite) return { ok: false, message: "That invitation is not valid." };
  if (invite.revokedAt) return { ok: false, message: "That invitation was withdrawn." };
  if (invite.acceptedAt) return { ok: false, message: "That invitation has already been used." };
  if (invite.expiresAt.getTime() < Date.now())
    return { ok: false, message: "That invitation has expired. Ask for a fresh one." };

  const [group] = await db.select().from(groups).where(eq(groups.id, invite.groupId));
  if (!group || group.archivedAt) return { ok: false, message: "That community is closed." };

  const joiner = await resolveJoiner(invite.groupId, name);
  if (!joiner.ok || !joiner.id) return joiner;

  await place(invite.groupId, joiner.id, "active", invite.role);

  // Single use. Two people sharing one personal invitation would give the
  // second one a membership the organizer never agreed to.
  await db
    .update(groupInvites)
    .set({ acceptedAt: new Date(), acceptedBy: joiner.id })
    .where(eq(groupInvites.id, invite.id));

  // An invited organizer signs in by email; the address they were invited at
  // is the one that should reach this account.
  if (invite.email && invite.role !== "player") {
    const [taken] = await db.select().from(authEmails).where(eq(authEmails.email, invite.email));
    if (!taken)
      await db.insert(authEmails).values({
        id: newId("aem"),
        userId: joiner.id,
        email: invite.email,
        createdAt: new Date(),
      });
  }

  await setCurrentUserId(joiner.id);
  await setActiveCommunity(invite.groupId);
  touch();
  return { ok: true, id: invite.groupId };
}

type JoinOutcome = Result & {
  status?: "joined" | "waiting" | "already";
  slug?: string;
  duplicate?: { id: string; name: string };
};

/**
 * The shareable-code door.
 *
 * Unlike an invitation this hands the newcomer straight to the community's
 * join policy, because a code pasted into a WhatsApp group is not the
 * organizer vouching for whoever ends up holding it.
 */
export async function joinWithCode(
  code: string,
  name?: string,
  note?: string,
): Promise<JoinOutcome> {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length < 4) return { ok: false, message: "Check the code and try again." };

  const [group] = await db.select().from(groups).where(eq(groups.inviteCode, clean));
  if (!group || group.archivedAt)
    return { ok: false, message: "No community has that code. Check it with whoever sent it." };

  return joinCommunity(group.id, name, note);
}

/** The directory door: a public community the person found and asked to join. */
export async function joinCommunity(
  groupId: string,
  name?: string,
  note?: string,
): Promise<JoinOutcome> {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group || group.archivedAt) return { ok: false, message: "That community is closed." };

  const policy = joinPolicyOf(group.settings);
  if (policy === "closed")
    return {
      ok: false,
      message: "This community adds members by invitation only. Ask the organizer for a link.",
    };

  const joiner = await resolveJoiner(groupId, name);
  if (!joiner.ok || !joiner.id) return joiner;

  const placed = await place(
    groupId,
    joiner.id,
    policy === "open" ? "active" : "pending",
    "player",
    note?.trim().slice(0, 300) || null,
  );
  if (!placed.ok) return placed;

  // Remembered on this phone either way. A pending member still needs the app
  // to know who they are, so the waiting screen is theirs, and so approval
  // does not make them introduce themselves all over again.
  await setCurrentUserId(joiner.id);
  await setActiveCommunity(groupId);
  touch();

  const status =
    placed.message === "already"
      ? "already"
      : policy === "open"
        ? "joined"
        : "waiting";
  return { ok: true, status, slug: group.slug };
}

/** Leaves. The membership row stays so history and ratings survive. */
export async function leaveCommunity(groupId: string): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Nobody is signed in on this phone." };

  const [member] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  if (!member) return { ok: false, message: "You are not in that community." };

  if (member.role === "organizer") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.role, "organizer"),
          eq(groupMembers.status, "active"),
        ),
      );
    if (n <= 1)
      return { ok: false, message: "You are the only organizer. Appoint another one first." };
  }

  await db
    .update(groupMembers)
    .set({ status: "inactive" })
    .where(eq(groupMembers.id, member.id));
  touch();
  return { ok: true };
}

/* ------------------------------------------------------- form wrappers */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, fallback = 0) => {
  const v = Number(fd.get(k));
  return Number.isFinite(v) ? v : fallback;
};

export async function switchCommunityAction(fd: FormData) {
  const groupId = str(fd, "groupId");
  const account = await currentAccount();

  // The cookie only selects among communities this browser already belongs
  // to, so this is the one place that check has to hold.
  const mine = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        inArray(
          groupMembers.userId,
          [account?.id, await currentUserId()].filter(Boolean) as string[],
        ),
        eq(groupMembers.status, "active"),
      ),
    );

  if (mine.length === 0 && !isPlatformAdmin(account)) return;
  await setActiveCommunity(groupId);
  const next = str(fd, "next");
  redirect(next || "/");
}

export async function createCommunityAction(
  _prev: CommunityFormState,
  fd: FormData,
): Promise<CommunityFormState> {
  const res = await createCommunity({
    name: str(fd, "name"),
    location: str(fd, "location"),
    description: str(fd, "description"),
    visibility: str(fd, "visibility") === "public" ? "public" : "private",
    joinPolicy: (str(fd, "joinPolicy") || "approval") as JoinPolicy,
    currency: str(fd, "currency") || "AED",
    defaultFee: num(fd, "defaultFee", 40),
    staffPin: str(fd, "staffPin"),
    organizerName: str(fd, "organizerName"),
    organizerEmail: str(fd, "organizerEmail"),
  });
  if (!res.ok) return { ok: false, message: res.message ?? "Could not create that community." };
  return { ok: true, message: `Created. Its address is /c/${res.slug}` };
}

export async function archiveCommunityAction(fd: FormData) {
  await archiveCommunity(str(fd, "groupId"), str(fd, "archived") === "1");
}

export async function appointOrganizerAction(
  _prev: CommunityFormState,
  fd: FormData,
): Promise<CommunityFormState> {
  const res = await appointOrganizer(
    str(fd, "groupId"),
    str(fd, "name"),
    str(fd, "email"),
    (str(fd, "role") || "organizer") as MemberRole,
  );
  return res.ok
    ? { ok: true, message: `${str(fd, "name")} can now sign in and run this community.` }
    : { ok: false, message: res.message ?? "Could not appoint them." };
}

export async function stepDownOrganizerAction(fd: FormData) {
  await stepDownOrganizer(str(fd, "groupId"), str(fd, "membershipId"));
}

export async function communityProfileAction(fd: FormData) {
  await setCommunityProfile(str(fd, "groupId"), {
    description: str(fd, "description"),
    visibility: str(fd, "visibility") === "public" ? "public" : "private",
  });
}

export async function rotateInviteCodeAction(fd: FormData) {
  await rotateInviteCode(str(fd, "groupId"));
}

export async function createInviteAction(
  _prev: CommunityFormState,
  fd: FormData,
): Promise<CommunityFormState> {
  const res = await createInvite(str(fd, "groupId"), {
    email: str(fd, "email"),
    name: str(fd, "name"),
    role: (str(fd, "role") || "player") as MemberRole,
  });
  if (!res.ok) return { ok: false, message: res.message ?? "Could not create that invitation." };
  return {
    ok: true,
    url: res.url,
    message: res.delivered
      ? `Invitation emailed. The link below works too, if you'd rather send it yourself.`
      : `Invitation ready. Send them this link — no email went out.`,
  };
}

export async function revokeInviteAction(fd: FormData) {
  await revokeInvite(str(fd, "groupId"), str(fd, "inviteId"));
}

export async function acceptInviteAction(
  _prev: CommunityFormState,
  fd: FormData,
): Promise<CommunityFormState> {
  const res = await acceptInvite(str(fd, "token"), str(fd, "name"));
  if (!res.ok) return { ok: false, message: res.message ?? "That invitation did not work." };
  redirect("/");
}

export async function joinWithCodeAction(
  _prev: JoinFormState,
  fd: FormData,
): Promise<JoinFormState> {
  const res = await joinWithCode(str(fd, "code"), str(fd, "name"), str(fd, "note"));
  if (!res.ok)
    return { ok: false, message: res.message ?? "Could not join.", duplicate: res.duplicate };
  if (res.status === "waiting") return { ok: true, status: "waiting" };
  redirect("/");
}

export async function joinCommunityAction(
  _prev: JoinFormState,
  fd: FormData,
): Promise<JoinFormState> {
  const res = await joinCommunity(str(fd, "groupId"), str(fd, "name"), str(fd, "note"));
  if (!res.ok)
    return { ok: false, message: res.message ?? "Could not join.", duplicate: res.duplicate };
  if (res.status === "waiting") return { ok: true, status: "waiting" };
  redirect("/");
}

export async function leaveCommunityAction(fd: FormData) {
  await leaveCommunity(str(fd, "groupId"));
  redirect("/");
}
