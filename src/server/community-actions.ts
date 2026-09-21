"use server";

/**
 * Communities: asking for one, owning one, getting into one.
 *
 * The rule everything here serves: a community and its members belong to its
 * owner. The platform can approve a request for a new community and suspend
 * one for abuse. It cannot appoint an organizer, open a roster, read a
 * payment or take a community over — there is no code path for it, which is
 * the only honest way to make that promise.
 *
 *   Platform admin — approves new communities, suspends abusive ones.
 *   Owner          — the community is theirs. Appoints organizers and
 *                    co-owners, decides who can find it, can delete it.
 *   Organizer      — runs it: sessions, venues, members, money, invitations.
 *   Coordinator    — runs the court on the night.
 *   Player         — plays, and can ask for more.
 *
 * Every export is a reachable endpoint. A server action can be invoked by
 * anyone who can post a form, so each one checks its caller against the
 * community its target actually belongs to.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  communityRequests, groupInvites, groupMembers, groups, roleRequests, users,
  type MemberRole, type Visibility,
} from "@/db/schema";
import { inviteCode as mintInviteCode, newId } from "@/lib/ids";
import { uniqueSlug } from "@/lib/slug";
import { joinPolicyOf } from "@/lib/join-policy";
import {
  canOrganize, canOwn, currentAccount, isPlatformAdmin, normalizeEmail, type Account,
} from "@/lib/auth";
import { setActiveCommunity } from "@/lib/tenant";
import { requestOrigin } from "@/lib/origin";
import { sendInvite } from "@/lib/mail";
import { DEFAULT_WEIGHTS, BALANCE_BY_TYPE } from "@/lib/queue-engine";
import { pushLater } from "@/lib/push";
import type { CommunityFormState, InviteView, JoinFormState } from "./community-types";

type Result = { ok: boolean; message?: string; id?: string };

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RECOVERY_DAYS = 30;
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const mintToken = () => randomBytes(32).toString("base64url");

function touch() {
  revalidatePath("/", "layout");
}

/** Signed in and set up. Everything past browsing needs a real account now. */
async function member(): Promise<Account | null> {
  const account = await currentAccount();
  return account && account.onboarded ? account : null;
}

async function freshInviteCode(): Promise<string> {
  // 34 characters, eight of them: a collision is vanishingly unlikely, and
  // "vanishingly" is still not "never" when a unique index would 500 on it.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintInviteCode();
    const [clash] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.inviteCode, code));
    if (!clash) return code;
  }
  return `${mintInviteCode()}${Date.now().toString(36).toUpperCase().slice(-2)}`;
}

async function liveGroup(groupId: string) {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group || group.archivedAt || group.deletedAt) return null;
  return group;
}

async function ownerCount(groupId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.role, "owner"),
        eq(groupMembers.status, "active"),
      ),
    );
  return n;
}

/* ------------------------------------------------ asking for a community */

/**
 * Any registered player can ask to start a community. The platform admin
 * approves it, and the person who asked becomes its owner — nobody else is
 * put in charge of it on their behalf.
 */
export async function requestCommunity(input: {
  name: string;
  location?: string;
  description?: string;
  details?: string;
}): Promise<Result> {
  const account = await member();
  if (!account) return { ok: false, message: "Sign in to ask for a community." };

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3) return { ok: false, message: "Give it a name people will recognise." };
  if (name.length > 60) return { ok: false, message: "That name is too long." };

  const open = await db
    .select({ id: communityRequests.id })
    .from(communityRequests)
    .where(
      and(eq(communityRequests.requesterId, account.id), eq(communityRequests.status, "pending")),
    );
  if (open.length >= 2)
    return { ok: false, message: "You already have requests waiting. Hang on for those first." };

  // The platform admin would only be asking themselves. They get it straight
  // away and own it as a person, exactly like anyone whose request is approved.
  if (isPlatformAdmin(account)) {
    const now = new Date();
    const info = {
      name,
      location: input.location?.trim().slice(0, 80) || null,
      description: input.description?.trim().slice(0, 500) || null,
    };
    const { groupId } = await createCommunityFor(account.id, info, now);
    await db.insert(communityRequests).values({
      id: newId("creq"),
      requesterId: account.id,
      ...info,
      details: input.details?.trim().slice(0, 1000) || null,
      status: "approved",
      decidedAt: now,
      decidedBy: account.id,
      groupId,
      createdAt: now,
    });
    await setActiveCommunity(groupId);
    touch();
    return { ok: true, id: groupId };
  }

  await db.insert(communityRequests).values({
    id: newId("creq"),
    requesterId: account.id,
    name,
    location: input.location?.trim().slice(0, 80) || null,
    description: input.description?.trim().slice(0, 500) || null,
    details: input.details?.trim().slice(0, 1000) || null,
    status: "pending",
    createdAt: new Date(),
  });
  touch();
  return { ok: true };
}

export async function withdrawCommunityRequest(requestId: string): Promise<Result> {
  const account = await member();
  if (!account) return { ok: false, message: "Not allowed" };
  await db
    .update(communityRequests)
    .set({ status: "withdrawn", decidedAt: new Date() })
    .where(
      and(
        eq(communityRequests.id, requestId),
        eq(communityRequests.requesterId, account.id),
        eq(communityRequests.status, "pending"),
      ),
    );
  touch();
  return { ok: true };
}

/**
 * Makes a community with `ownerId` as its only owner and member, and nothing
 * else. Shared by approving a request and by the platform admin starting one
 * directly; either way the platform ends up with no seat inside it.
 */
async function createCommunityFor(
  ownerId: string,
  info: { name: string; location: string | null; description: string | null },
  now: Date,
) {
  const req = { ...info, requesterId: ownerId };
  const taken = await db.select({ slug: groups.slug }).from(groups);
  const slug = uniqueSlug(req.name, taken.map((g) => g.slug));
  const groupId = newId("grp");

  await db.insert(groups).values({
    id: groupId,
    name: req.name,
    slug,
    ownerId: req.requesterId,
    location: req.location,
    description: req.description,
    visibility: "private",
    inviteCode: await freshInviteCode(),
    defaultFee: 40,
    currency: "AED",
    settings: {
      // A random PIN the owner can change; never a default anyone could guess.
      staffPin: String(100000 + (randomBytes(4).readUInt32BE() % 900000)),
      pointsTo: 30,
      defaultGameType: "balanced",
      weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.balanced },
      requireScoreConfirmation: false,
      joinPolicy: "approval",
    },
    createdAt: now,
  });

  await db.insert(groupMembers).values({
    id: newId("gm"),
    groupId,
    userId: req.requesterId,
    role: "owner",
    status: "active",
    joinedAt: now,
  });

  return { groupId, slug };
}

/**
 * The platform's one decision about a community: whether it exists.
 *
 * Approval creates it with the requester as its only owner and nothing else
 * — no venues, no members, no settings chosen for them. From that moment it
 * is theirs.
 */
export async function decideCommunityRequest(
  requestId: string,
  decision: "approve" | "decline",
  note?: string,
): Promise<Result & { slug?: string }> {
  const account = await currentAccount();
  if (!isPlatformAdmin(account)) return { ok: false, message: "Not allowed" };

  const [req] = await db.select().from(communityRequests).where(eq(communityRequests.id, requestId));
  if (!req || req.status !== "pending") return { ok: false, message: "Already decided." };

  const now = new Date();
  if (decision === "decline") {
    await db
      .update(communityRequests)
      .set({
        status: "declined",
        decidedAt: now,
        decidedBy: account!.id,
        decisionNote: note?.trim().slice(0, 300) || null,
      })
      .where(eq(communityRequests.id, requestId));
    touch();
    return { ok: true };
  }

  const { groupId, slug } = await createCommunityFor(req.requesterId, req, now);

  await db
    .update(communityRequests)
    .set({
      status: "approved",
      decidedAt: now,
      decidedBy: account!.id,
      groupId,
      decisionNote: note?.trim().slice(0, 300) || null,
    })
    .where(eq(communityRequests.id, requestId));

  pushLater([req.requesterId], {
    title: "Your community is approved",
    body: `${req.name} is yours. Set up your first venue and session.`,
    url: "/admin",
    tag: `creq-${requestId}`,
  });

  touch();
  return { ok: true, id: groupId, slug };
}

/**
 * The platform admin sets a community up for someone, typically a group lead
 * who asked in person. Same outcome as approving their request: that player
 * is the only owner, and the platform keeps no seat inside it. Recorded as an
 * approved request so there is one history of how every community began.
 */
export async function startCommunity(input: {
  name: string;
  location?: string;
  description?: string;
  ownerPlayerNo: string;
}): Promise<Result & { slug?: string }> {
  const account = await currentAccount();
  if (!isPlatformAdmin(account)) return { ok: false, message: "Not allowed" };

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3) return { ok: false, message: "Give it a name people will recognise." };
  if (name.length > 60) return { ok: false, message: "That name is too long." };

  const no = Number(input.ownerPlayerNo.replace(/\D/g, ""));
  if (!Number.isInteger(no) || no < 1001)
    return { ok: false, message: "Enter the owner's player number, e.g. 1047." };
  const [owner] = await db
    .select({ id: users.id, name: users.name, onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.playerNo, no));
  if (!owner || !owner.onboardedAt)
    return {
      ok: false,
      message: `No registered player #${no}. They need to sign up first; their number is on their profile.`,
    };

  const now = new Date();
  const info = {
    name,
    location: input.location?.trim().slice(0, 80) || null,
    description: input.description?.trim().slice(0, 500) || null,
  };
  const { groupId, slug } = await createCommunityFor(owner.id, info, now);
  await db.insert(communityRequests).values({
    id: newId("creq"),
    requesterId: owner.id,
    ...info,
    details: "Started by the platform admin",
    status: "approved",
    decidedAt: now,
    decidedBy: account!.id,
    groupId,
    createdAt: now,
  });
  if (owner.id === account!.id) await setActiveCommunity(groupId);
  else
    pushLater([owner.id], {
      title: "You have a new community",
      body: `${name} is set up and it's yours. Open it to get started.`,
      url: "/admin",
      tag: `community-${groupId}`,
    });

  touch();
  return { ok: true, id: groupId, slug, message: owner.name };
}

/**
 * Hides a community that is being used for something it should not be.
 * Touches nothing inside it — no members, no data — and can be undone.
 */
export async function suspendCommunity(groupId: string, suspended: boolean): Promise<Result> {
  if (!isPlatformAdmin(await currentAccount())) return { ok: false, message: "Not allowed" };
  await db
    .update(groups)
    .set({ archivedAt: suspended ? new Date() : null })
    .where(eq(groups.id, groupId));
  touch();
  return { ok: true };
}

/* ---------------------------------------------------------- ownership */

/** Records that the owner read the ownership notice. */
export async function acceptOwnership(groupId: string): Promise<Result> {
  if (!canOwn(await currentAccount(), groupId)) return { ok: false, message: "Not allowed" };
  await db
    .update(groups)
    .set({ ownerAcceptedAt: new Date() })
    .where(and(eq(groups.id, groupId), isNull(groups.ownerAcceptedAt)));
  touch();
  return { ok: true };
}

/** Who can find it, and what the directory says about it. The owner's call. */
export async function setCommunityProfile(
  groupId: string,
  patch: { description?: string; visibility?: Visibility; previewSchedule?: boolean },
): Promise<Result> {
  if (!canOwn(await currentAccount(), groupId)) return { ok: false, message: "Only an owner can change that." };
  const group = await liveGroup(groupId);
  if (!group) return { ok: false, message: "Community not found" };

  const next: Record<string, unknown> = {};
  if (patch.description !== undefined)
    next.description = patch.description.trim().slice(0, 500) || null;
  if (patch.visibility) next.visibility = patch.visibility === "public" ? "public" : "private";
  if (patch.previewSchedule !== undefined)
    next.settings = { ...group.settings, previewSchedule: patch.previewSchedule };
  if (Object.keys(next).length) await db.update(groups).set(next).where(eq(groups.id, groupId));

  touch();
  return { ok: true };
}

/**
 * Changes somebody's role. Owners only, for every role — "who runs this" is
 * precisely the decision that makes a community theirs.
 *
 * The last owner cannot be demoted or removed. With no platform rescue, a
 * community with no owner is one nobody can ever manage again.
 */
export async function changeRole(membershipId: string, role: MemberRole): Promise<Result> {
  if (!["player", "coordinator", "organizer", "owner"].includes(role))
    return { ok: false, message: "Unknown role" };

  const [row] = await db.select().from(groupMembers).where(eq(groupMembers.id, membershipId));
  if (!row) return { ok: false, message: "Not found" };
  if (!canOwn(await currentAccount(), row.groupId))
    return { ok: false, message: "Only an owner can change roles." };
  if (row.status !== "active") return { ok: false, message: "Only active members can hold a role." };

  if (row.role === "owner" && role !== "owner" && (await ownerCount(row.groupId)) <= 1)
    return { ok: false, message: "That is the only owner. Make someone else an owner first." };

  await db.update(groupMembers).set({ role }).where(eq(groupMembers.id, membershipId));
  touch();
  return { ok: true };
}

/**
 * Removes a member (or brings them back). Organizers can remove players and
 * coordinators; only an owner can remove an organizer or another owner, and
 * nobody can remove the last owner.
 */
export async function setMembership(membershipId: string, active: boolean): Promise<Result> {
  const [row] = await db.select().from(groupMembers).where(eq(groupMembers.id, membershipId));
  if (!row) return { ok: false, message: "Not found" };
  const account = await currentAccount();
  const senior = row.role === "organizer" || row.role === "owner";
  if (senior ? !canOwn(account, row.groupId) : !canOrganize(account, row.groupId))
    return { ok: false, message: "Not allowed" };
  if (!active && row.role === "owner" && (await ownerCount(row.groupId)) <= 1)
    return { ok: false, message: "The only owner can't be removed." };

  await db
    .update(groupMembers)
    .set({ status: active ? "active" : "inactive" })
    .where(eq(groupMembers.id, membershipId));
  touch();
  return { ok: true };
}

/**
 * Deletes the community. Everyone loses sight of it at once; an owner can
 * bring it back for 30 days; after that it is purged for good.
 *
 * The name has to be typed to confirm. With no platform rescue, this is the
 * one button in the app that nobody can undo on the owner's behalf.
 */
export async function deleteCommunity(groupId: string, typedName: string): Promise<Result> {
  const account = await currentAccount();
  if (!canOwn(account, groupId)) return { ok: false, message: "Only an owner can delete it." };
  const group = await liveGroup(groupId);
  if (!group) return { ok: false, message: "Community not found" };
  if (typedName.trim().toLowerCase() !== group.name.trim().toLowerCase())
    return { ok: false, message: "Type the community's name exactly to confirm." };

  await db
    .update(groups)
    .set({ deletedAt: new Date(), deletedBy: account!.id })
    .where(eq(groups.id, groupId));
  touch();
  return { ok: true };
}

/**
 * Brings a deleted community back within its recovery window. Checked against
 * the membership row directly, because a deleted community is invisible to
 * the usual membership lookups.
 */
export async function restoreCommunity(groupId: string): Promise<Result> {
  const account = await currentAccount();
  if (!account) return { ok: false, message: "Not allowed" };

  const [row] = await db
    .select({ role: groupMembers.role, status: groupMembers.status })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, account.id)));
  if (!row || row.role !== "owner" || row.status !== "active")
    return { ok: false, message: "Only an owner can restore it." };

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group?.deletedAt) return { ok: false, message: "It isn't deleted." };
  const deadline = group.deletedAt.getTime() + RECOVERY_DAYS * 86_400_000;
  if (Date.now() > deadline) return { ok: false, message: "The recovery window has closed." };

  await db.update(groups).set({ deletedAt: null, deletedBy: null }).where(eq(groups.id, groupId));
  touch();
  return { ok: true };
}

/**
 * Turns the shared coordinator PIN on or off. Off revokes every phone that
 * was unlocked with it; from then on the court is run by named accounts.
 */
export async function setSharedPin(groupId: string, enabled: boolean): Promise<Result> {
  if (!canOwn(await currentAccount(), groupId)) return { ok: false, message: "Only an owner can change that." };
  const group = await liveGroup(groupId);
  if (!group) return { ok: false, message: "Community not found" };
  await db
    .update(groups)
    .set({ settings: { ...group.settings, pinDisabled: !enabled } })
    .where(eq(groups.id, groupId));
  touch();
  return { ok: true };
}

/* ------------------------------------------------------- the day to day */

/**
 * Replaces the shareable code. A code lives in chat history forever and
 * people leave; the only honest answer to "can you stop that code working"
 * is a new one.
 */
export async function rotateInviteCode(groupId: string): Promise<Result> {
  if (!canOrganize(await currentAccount(), groupId)) return { ok: false, message: "Not allowed" };
  const code = await freshInviteCode();
  await db.update(groups).set({ inviteCode: code }).where(eq(groups.id, groupId));
  touch();
  return { ok: true, message: code };
}

type InviteResult = Result & { url?: string; delivered?: boolean };

/**
 * Invites one person — by email, by player number, or as a bare link.
 *
 * An invitation is the organizer vouching for someone, so accepting it skips
 * the join queue. Inviting somebody *to run things* is an ownership decision,
 * so any role above player needs an owner.
 *
 * By player number it goes to that person's own inbox in the app and only
 * they can accept it. The inviter is never told whose number it was — a
 * number is a name tag, and it must not become a way to look people up.
 */
export async function createInvite(
  groupId: string,
  input: { email?: string; name?: string; role?: MemberRole; playerNo?: string },
): Promise<InviteResult> {
  const account = await currentAccount();
  const role: MemberRole =
    input.role === "coordinator" || input.role === "organizer" || input.role === "owner"
      ? input.role
      : "player";
  if (role === "player" ? !canOrganize(account, groupId) : !canOwn(account, groupId))
    return {
      ok: false,
      message: role === "player" ? "Not allowed" : "Only an owner can invite someone to help run it.",
    };

  const group = await liveGroup(groupId);
  if (!group) return { ok: false, message: "Community not found" };

  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (email && !LOOKS_LIKE_EMAIL.test(email))
    return { ok: false, message: "That doesn't look like an email address." };

  let targetId: string | null = null;
  const rawNo = (input.playerNo ?? "").replace(/\D/g, "");
  if (rawNo) {
    const [target] = await db.select().from(users).where(eq(users.playerNo, Number(rawNo)));
    // Same reply whether or not the number exists or is registered, so the
    // form can't be used to find out who has an account.
    const neutral: InviteResult = {
      ok: true,
      message: `If player #${rawNo} has an account, the invitation is waiting in their app.`,
    };
    if (!target) return neutral;
    const [member] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, target.id),
          eq(groupMembers.status, "active"),
        ),
      );
    if (member) return neutral;
    targetId = target.id;
    await db.insert(groupInvites).values({
      id: newId("inv"),
      groupId,
      email: null,
      name: null,
      tokenHash: hash(mintToken()),
      role,
      invitedBy: account!.id,
      userId: targetId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdAt: new Date(),
    });
    pushLater([targetId], {
      title: "You're invited",
      body: `${account!.name} invited you to ${group.name}.`,
      url: "/me",
      tag: `invite-${groupId}`,
    });
    touch();
    return neutral;
  }

  const token = mintToken();
  const now = new Date();
  await db.insert(groupInvites).values({
    id: newId("inv"),
    groupId,
    email,
    name: input.name?.trim().slice(0, 60) || null,
    tokenHash: hash(token),
    role,
    invitedBy: account!.id,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    createdAt: now,
  });

  const url = `${await requestOrigin()}/i/${token}`;
  let delivered = false;
  if (email) {
    const sent = await sendInvite(email, url, group.name, account!.name, input.name);
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

/* ------------------------------------------------------ asking for more */

/**
 * A member asking to help run their community. Goes to its owners and no one
 * else.
 */
export async function requestRole(groupId: string, role: MemberRole, note?: string): Promise<Result> {
  const account = await member();
  if (!account) return { ok: false, message: "Sign in first." };
  if (role !== "organizer" && role !== "coordinator") return { ok: false, message: "Unknown role" };

  const mine = account.memberships.find((m) => m.groupId === groupId);
  if (!mine) return { ok: false, message: "Join the community first." };
  if (mine.role === "owner" || mine.role === role || (mine.role === "organizer" && role === "coordinator"))
    return { ok: false, message: "You already have that." };

  const [open] = await db
    .select({ id: roleRequests.id })
    .from(roleRequests)
    .where(
      and(
        eq(roleRequests.groupId, groupId),
        eq(roleRequests.userId, account.id),
        eq(roleRequests.status, "pending"),
      ),
    );
  if (open) return { ok: false, message: "Your request is already with the owner." };

  await db.insert(roleRequests).values({
    id: newId("rreq"),
    groupId,
    userId: account.id,
    role,
    note: note?.trim().slice(0, 300) || null,
    status: "pending",
    createdAt: new Date(),
  });
  const owners = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.role, "owner"), eq(groupMembers.status, "active")),
    );
  pushLater(
    owners.map((o) => o.userId),
    { title: "Someone wants to help", body: `${account.name} asked to be ${role === "organizer" ? "an organizer" : "a coordinator"}.`, url: "/admin/members", tag: `rreq-${groupId}` },
  );
  touch();
  return { ok: true };
}

export async function decideRoleRequest(
  requestId: string,
  decision: "approve" | "decline",
): Promise<Result> {
  const [req] = await db.select().from(roleRequests).where(eq(roleRequests.id, requestId));
  if (!req || req.status !== "pending") return { ok: false, message: "Already decided." };
  const account = await currentAccount();
  if (!canOwn(account, req.groupId)) return { ok: false, message: "Only an owner can decide." };

  if (decision === "approve") {
    await db
      .update(groupMembers)
      .set({ role: req.role })
      .where(
        and(
          eq(groupMembers.groupId, req.groupId),
          eq(groupMembers.userId, req.userId),
          eq(groupMembers.status, "active"),
        ),
      );
  }
  await db
    .update(roleRequests)
    .set({
      status: decision === "approve" ? "approved" : "declined",
      decidedAt: new Date(),
      decidedBy: account!.id,
    })
    .where(eq(roleRequests.id, requestId));
  touch();
  return { ok: true };
}

/* ------------------------------------------------------------ joining */

/**
 * Puts somebody into a community. One function whichever door they came in
 * by, so an invitation and a join request can never disagree about what "in"
 * means.
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
        // previous decline: the organizer has said yes in advance.
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

/** Reads an invitation without spending it, so the page can show what it is. */
export async function inspectInvite(token: string): Promise<InviteView | null> {
  const [invite] = await db.select().from(groupInvites).where(eq(groupInvites.tokenHash, hash(token)));
  if (!invite || invite.userId) return null;
  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() < Date.now()) return null;

  const group = await liveGroup(invite.groupId);
  if (!group) return null;

  const account = await currentAccount();
  const alreadyIn = Boolean(account?.memberships.some((m) => m.groupId === invite.groupId));

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

async function spend(inviteId: string, groupId: string, userId: string, role: MemberRole) {
  await place(groupId, userId, "active", role);
  await db
    .update(groupInvites)
    .set({ acceptedAt: new Date(), acceptedBy: userId })
    .where(eq(groupInvites.id, inviteId));
  await setActiveCommunity(groupId);
  touch();
}

/** A link invitation. Whoever holds the link and has an account can accept, once. */
export async function acceptInvite(token: string): Promise<Result> {
  const account = await member();
  if (!account) return { ok: false, message: "Sign in first." };

  const [invite] = await db.select().from(groupInvites).where(eq(groupInvites.tokenHash, hash(token)));
  if (!invite || invite.userId) return { ok: false, message: "That invitation is not valid." };
  if (invite.revokedAt) return { ok: false, message: "That invitation was withdrawn." };
  if (invite.acceptedAt) return { ok: false, message: "That invitation has already been used." };
  if (invite.expiresAt.getTime() < Date.now())
    return { ok: false, message: "That invitation has expired. Ask for a fresh one." };
  if (!(await liveGroup(invite.groupId))) return { ok: false, message: "That community is closed." };

  await spend(invite.id, invite.groupId, account.id, invite.role);
  return { ok: true, id: invite.groupId };
}

/** An in-app invitation addressed to this account by player number. */
export async function answerInvite(inviteId: string, accept: boolean): Promise<Result> {
  const account = await member();
  if (!account) return { ok: false, message: "Sign in first." };

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(
      and(
        eq(groupInvites.id, inviteId),
        eq(groupInvites.userId, account.id),
        isNull(groupInvites.acceptedAt),
        isNull(groupInvites.revokedAt),
        gt(groupInvites.expiresAt, new Date()),
      ),
    );
  if (!invite) return { ok: false, message: "That invitation is no longer open." };

  if (!accept) {
    await db.update(groupInvites).set({ revokedAt: new Date() }).where(eq(groupInvites.id, invite.id));
    touch();
    return { ok: true };
  }
  if (!(await liveGroup(invite.groupId))) return { ok: false, message: "That community is closed." };
  await spend(invite.id, invite.groupId, account.id, invite.role);
  return { ok: true, id: invite.groupId };
}

type JoinOutcome = Result & { status?: "joined" | "waiting" | "already"; slug?: string };

/** The shareable-code door: follows the community's join policy. */
export async function joinWithCode(code: string, note?: string): Promise<JoinOutcome> {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length < 4) return { ok: false, message: "Check the code and try again." };

  const [group] = await db.select().from(groups).where(eq(groups.inviteCode, clean));
  if (!group || group.archivedAt || group.deletedAt)
    return { ok: false, message: "No community has that code. Check it with whoever sent it." };

  return joinCommunity(group.id, note);
}

/** The directory door: a community the person found and asked to join. */
export async function joinCommunity(groupId: string, note?: string): Promise<JoinOutcome> {
  const account = await member();
  if (!account) return { ok: false, message: "Sign in first." };

  const group = await liveGroup(groupId);
  if (!group) return { ok: false, message: "That community is closed." };

  const policy = joinPolicyOf(group.settings);
  if (policy === "closed")
    return {
      ok: false,
      message: "This community adds members by invitation only. Ask the organizer.",
    };

  const placed = await place(
    groupId,
    account.id,
    policy === "open" ? "active" : "pending",
    "player",
    note?.trim().slice(0, 300) || null,
  );
  if (!placed.ok) return placed;

  await setActiveCommunity(groupId);

  if (policy === "approval" && placed.message !== "already" && placed.message !== "waiting") {
    const runners = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.status, "active"),
          inArray(groupMembers.role, ["owner", "organizer"]),
        ),
      );
    pushLater(
      runners.map((r) => r.userId),
      { title: "New join request", body: `${account.name} asked to join ${group.name}.`, url: "/admin/members", tag: `join-${groupId}` },
    );
  }
  touch();

  const status =
    placed.message === "already" ? "already" : policy === "open" ? "joined" : "waiting";
  return { ok: true, status, slug: group.slug };
}

/** Leaves. The row stays so history and ratings survive. */
export async function leaveCommunity(groupId: string): Promise<Result> {
  const account = await member();
  if (!account) return { ok: false, message: "Sign in first." };

  const [row] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, account.id)));
  if (!row) return { ok: false, message: "You are not in that community." };
  if (row.role === "owner" && (await ownerCount(groupId)) <= 1)
    return { ok: false, message: "You're the only owner. Make someone else an owner, or delete it." };

  await db.update(groupMembers).set({ status: "inactive" }).where(eq(groupMembers.id, row.id));
  touch();
  return { ok: true };
}

/* ------------------------------------------------------- form wrappers */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function switchCommunityAction(fd: FormData) {
  const groupId = str(fd, "groupId");
  const account = await currentAccount();
  // Only ever a choice among communities this account belongs to.
  if (!account?.memberships.some((m) => m.groupId === groupId)) return;
  await setActiveCommunity(groupId);
  redirect(str(fd, "next") || "/");
}

export async function requestCommunityAction(
  _prev: CommunityFormState,
  fd: FormData,
): Promise<CommunityFormState> {
  const res = await requestCommunity({
    name: str(fd, "name"),
    location: str(fd, "location"),
    description: str(fd, "description"),
    details: str(fd, "details"),
  });
  // Created on the spot (platform admin): straight into it.
  if (res.ok && res.id) redirect("/admin");
  return res.ok
    ? { ok: true, message: "Request sent. You'll see the answer on your profile." }
    : { ok: false, message: res.message ?? "Could not send that." };
}

export async function withdrawCommunityRequestAction(fd: FormData) {
  await withdrawCommunityRequest(str(fd, "requestId"));
}

export async function decideCommunityRequestAction(fd: FormData) {
  await decideCommunityRequest(
    str(fd, "requestId"),
    str(fd, "decision") === "approve" ? "approve" : "decline",
    str(fd, "note"),
  );
}

export async function startCommunityAction(fd: FormData) {
  const name = str(fd, "name");
  const res = await startCommunity({
    name,
    location: str(fd, "location"),
    description: str(fd, "description"),
    ownerPlayerNo: str(fd, "ownerPlayerNo"),
  });
  const q = res.ok
    ? `started=${encodeURIComponent(name)}&owner=${encodeURIComponent(res.message ?? "")}`
    : `error=${encodeURIComponent(res.message ?? "Could not start that.")}`;
  redirect(`/hq?${q}#start`);
}

export async function suspendCommunityAction(fd: FormData) {
  await suspendCommunity(str(fd, "groupId"), str(fd, "suspended") === "1");
}

export async function acceptOwnershipAction(fd: FormData) {
  await acceptOwnership(str(fd, "groupId"));
}

export async function sharedPinAction(fd: FormData) {
  await setSharedPin(str(fd, "groupId"), str(fd, "enabled") === "1");
}

export async function communityProfileAction(fd: FormData) {
  await setCommunityProfile(str(fd, "groupId"), {
    description: str(fd, "description"),
    visibility: str(fd, "visibility") === "public" ? "public" : "private",
    previewSchedule: str(fd, "previewSchedule") === "1",
  });
}

export async function changeRoleAction(fd: FormData) {
  await changeRole(str(fd, "membershipId"), str(fd, "role") as MemberRole);
}

export async function setMembershipAction(fd: FormData) {
  await setMembership(str(fd, "membershipId"), str(fd, "active") === "1");
}

export async function deleteCommunityAction(
  _prev: CommunityFormState,
  fd: FormData,
): Promise<CommunityFormState> {
  const res = await deleteCommunity(str(fd, "groupId"), str(fd, "confirmName"));
  if (!res.ok) return { ok: false, message: res.message ?? "Could not delete it." };
  redirect("/me");
}

export async function restoreCommunityAction(fd: FormData) {
  await restoreCommunity(str(fd, "groupId"));
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
    playerNo: str(fd, "playerNo"),
  });
  if (!res.ok) return { ok: false, message: res.message ?? "Could not create that invitation." };
  if (!res.url) return { ok: true, message: res.message ?? "Invitation sent." };
  return {
    ok: true,
    url: res.url,
    message: res.delivered
      ? "Invitation emailed. The link below works too, if you'd rather send it yourself."
      : "Invitation ready. Send them this link.",
  };
}

export async function revokeInviteAction(fd: FormData) {
  await revokeInvite(str(fd, "groupId"), str(fd, "inviteId"));
}

export async function requestRoleAction(
  _prev: CommunityFormState,
  fd: FormData,
): Promise<CommunityFormState> {
  const res = await requestRole(str(fd, "groupId"), str(fd, "role") as MemberRole, str(fd, "note"));
  return res.ok
    ? { ok: true, message: "Sent to the owner." }
    : { ok: false, message: res.message ?? "Could not send that." };
}

export async function decideRoleRequestAction(fd: FormData) {
  await decideRoleRequest(str(fd, "requestId"), str(fd, "decision") === "approve" ? "approve" : "decline");
}

export async function acceptInviteAction(
  _prev: CommunityFormState,
  fd: FormData,
): Promise<CommunityFormState> {
  const res = await acceptInvite(str(fd, "token"));
  if (!res.ok) return { ok: false, message: res.message ?? "That invitation did not work." };
  redirect("/");
}

export async function answerInviteAction(fd: FormData) {
  const accept = str(fd, "accept") === "1";
  const res = await answerInvite(str(fd, "inviteId"), accept);
  if (res.ok && accept) redirect("/");
}

export async function joinWithCodeAction(_prev: JoinFormState, fd: FormData): Promise<JoinFormState> {
  const res = await joinWithCode(str(fd, "code"), str(fd, "note"));
  if (!res.ok) return { ok: false, message: res.message ?? "Could not join." };
  if (res.status === "waiting") return { ok: true, status: "waiting" };
  redirect("/");
}

export async function joinCommunityAction(_prev: JoinFormState, fd: FormData): Promise<JoinFormState> {
  const res = await joinCommunity(str(fd, "groupId"), str(fd, "note"));
  if (!res.ok) return { ok: false, message: res.message ?? "Could not join." };
  if (res.status === "waiting") return { ok: true, status: "waiting" };
  redirect("/");
}

export async function leaveCommunityAction(fd: FormData) {
  await leaveCommunity(str(fd, "groupId"));
  redirect("/me");
}
