import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, lt, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  authEmails, authSessions, authTokens, groupMembers, users, type MemberRole,
} from "@/db/schema";
import { newId } from "@/lib/ids";

/**
 * Magic-link auth for staff and organizers.
 *
 * Players are deliberately untouched: they identify themselves with the
 * `bq_uid` cookie and never see a sign-in screen, because asking someone to
 * check their email at the door of a sports hall is how you lose them. Accounts
 * exist only for the people who can see other people's money and data.
 *
 * Tokens are random, never guessable, and only their SHA-256 reaches the
 * database. A dump of `auth_tokens` or `auth_sessions` is therefore useless on
 * its own — the same reason nobody stores passwords.
 */

const SESSION_COOKIE = "bq_session";
const LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** No more than this many unconsumed links per email at once. */
const MAX_LIVE_LINKS = 3;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const mint = () => randomBytes(32).toString("base64url");

/** Constant-time compare so a wrong token cannot be narrowed by timing. */
function sameHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ------------------------------------------------------------ requesting */

export type LinkRequest =
  | { ok: true; token: string; user: { id: string; name: string; email: string } }
  | { ok: false; reason: "unknown" | "rate-limited" };

/**
 * Creates a magic link for an email, if that email belongs to someone who is
 * staff somewhere.
 *
 * Callers must show the same "check your inbox" message whatever this returns.
 * Reporting "no such account" would turn the sign-in form into a way to test
 * whether a given person is a member.
 */
export async function requestMagicLink(rawEmail: string): Promise<LinkRequest> {
  const email = normalizeEmail(rawEmail);
  const now = new Date();

  // auth_emails is the only place sign-in looks, so an organizer with a
  // personal and a work address reaches one account rather than two.
  const [identity] = await db.select().from(authEmails).where(eq(authEmails.email, email));
  if (!identity) return { ok: false, reason: "unknown" };

  const [user] = await db.select().from(users).where(eq(users.id, identity.userId));
  if (!user) return { ok: false, reason: "unknown" };

  const staffRoles: MemberRole[] = ["coordinator", "organizer"];
  const memberships = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, user.id), eq(groupMembers.status, "active")));
  if (!memberships.some((m) => staffRoles.includes(m.role))) {
    return { ok: false, reason: "unknown" };
  }

  const live = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.email, email),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, now),
      ),
    );
  if (live.length >= MAX_LIVE_LINKS) return { ok: false, reason: "rate-limited" };

  const token = mint();
  await db.insert(authTokens).values({
    id: newId("atk"),
    email,
    tokenHash: hash(token),
    expiresAt: new Date(now.getTime() + LINK_TTL_MS),
    consumedAt: null,
    createdAt: now,
  });

  return { ok: true, token, user: { id: user.id, name: user.name, email } };
}

/* -------------------------------------------------------------- redeeming */

/**
 * Burns a magic link and opens a session. Returns null for anything wrong —
 * unknown, expired, or already used — because the caller has nothing useful to
 * tell the visitor beyond "that link didn't work, here's a fresh one".
 */
export async function redeemMagicLink(token: string): Promise<string | null> {
  const now = new Date();
  const tokenHash = hash(token);

  const [row] = await db.select().from(authTokens).where(eq(authTokens.tokenHash, tokenHash));
  if (!row) return null;
  if (!sameHash(row.tokenHash, tokenHash)) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt <= now) return null;

  const [identity] = await db.select().from(authEmails).where(eq(authEmails.email, row.email));
  if (!identity) return null;
  const [user] = await db.select().from(users).where(eq(users.id, identity.userId));
  if (!user) return null;

  // Consume first. If opening the session then fails, the link is spent rather
  // than left live for a replay.
  await db.update(authTokens).set({ consumedAt: now }).where(eq(authTokens.id, row.id));

  const sessionToken = mint();
  const h = await headers();
  await db.insert(authSessions).values({
    id: newId("ase"),
    userId: user.id,
    tokenHash: hash(sessionToken),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    lastSeenAt: now,
    userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
    createdAt: now,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return user.id;
}

/* ---------------------------------------------------------------- reading */

export type Account = {
  id: string;
  name: string;
  email: string | null;
  /** Groups where this account is a coordinator or organizer, most recent first. */
  memberships: Array<{ groupId: string; role: MemberRole }>;
};

/**
 * The signed-in account, or null. Read this rather than trusting a cookie:
 * the session may have expired or been signed out on another device.
 */
export async function currentAccount(): Promise<Account | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const now = new Date();
  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, hash(token)), gt(authSessions.expiresAt, now)));
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;

  const memberships = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, user.id), eq(groupMembers.status, "active")))
    .orderBy(desc(groupMembers.joinedAt));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    memberships: memberships.map((m) => ({ groupId: m.groupId, role: m.role })),
  };
}

/** True when the account may run sessions for this group. */
export function canStaff(account: Account | null, groupId: string) {
  if (!account) return false;
  return account.memberships.some(
    (m) => m.groupId === groupId && (m.role === "coordinator" || m.role === "organizer"),
  );
}

/** True when the account owns the group: members, venues, fees, settings. */
export function canOrganize(account: Account | null, groupId: string) {
  if (!account) return false;
  return account.memberships.some((m) => m.groupId === groupId && m.role === "organizer");
}

/* --------------------------------------------------------------- signing out */

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(authSessions).where(eq(authSessions.tokenHash, hash(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Clears spent and expired rows. Called opportunistically on sign-in rather
 * than on a schedule, which keeps the table small without needing a cron.
 */
export async function pruneAuth() {
  const now = new Date();
  await db.delete(authTokens).where(lt(authTokens.expiresAt, now));
  await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
}
