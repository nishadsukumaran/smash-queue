import "server-only";
import { randomBytes, randomInt, createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, gte, isNull, lt, desc, sql } from "drizzle-orm";
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
/** Wrong code guesses before the token is destroyed rather than left to grind. */
const MAX_CODE_ATTEMPTS = 5;
/**
 * Requests per address per hour. Without it, six digits could be ground down
 * by asking for a fresh code every time the attempt counter runs out. With it,
 * an attacker gets at most MAX_REQUESTS_PER_HOUR x MAX_CODE_ATTEMPTS guesses an
 * hour against a million combinations — and every attempt emails the victim.
 */
const MAX_REQUESTS_PER_HOUR = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** No more than this many unconsumed links per email at once. */
const MAX_LIVE_LINKS = 3;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const mint = () => randomBytes(32).toString("base64url");

/**
 * Six digits, uniformly distributed. randomInt is rejection-sampled by Node,
 * so unlike `randomBytes % 1000000` the low values are not slightly likelier.
 */
const mintCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Constant-time compare so a wrong token cannot be narrowed by timing. */
function sameHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ------------------------------------------------------------ requesting */

export type LinkRequest =
  | { ok: true; token: string; code: string; user: { id: string; name: string; email: string } }
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

  // Counts spent tokens too, so burning attempts and asking again does not
  // reset the budget.
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recent = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.email, email), gte(authTokens.createdAt, hourAgo)));
  if (recent.length >= MAX_REQUESTS_PER_HOUR) return { ok: false, reason: "rate-limited" };

  const token = mint();
  const code = mintCode();
  await db.insert(authTokens).values({
    id: newId("atk"),
    email,
    tokenHash: hash(token),
    codeHash: hash(code),
    attempts: 0,
    expiresAt: new Date(now.getTime() + LINK_TTL_MS),
    consumedAt: null,
    createdAt: now,
  });

  return { ok: true, token, code, user: { id: user.id, name: user.name, email } };
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

  // Checked before consuming, so a token whose account has since been removed
  // is not burned for nothing.
  const [identity] = await db.select().from(authEmails).where(eq(authEmails.email, row.email));
  if (!identity) return null;

  // Consume first. If opening the session then fails, the link is spent rather
  // than left live for a replay.
  await db.update(authTokens).set({ consumedAt: now }).where(eq(authTokens.id, row.id));

  return openSession(row.email);
}

/**
 * Turns a proven address into a signed-in browser. Shared by the link and the
 * code so the two doors cannot drift apart in what they grant.
 */
async function openSession(email: string): Promise<string | null> {
  const [identity] = await db.select().from(authEmails).where(eq(authEmails.email, email));
  if (!identity) return null;
  const [user] = await db.select().from(users).where(eq(users.id, identity.userId));
  if (!user) return null;

  const now = new Date();
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

/**
 * Redeems the six-digit code instead of the link.
 *
 * Scoped to the address that asked for it, so an attacker must already know
 * whose account they are attacking, and then still beat a million-to-one guess
 * within fifteen minutes and five tries. A wrong guess costs one of those
 * tries; the fifth destroys the token outright rather than leaving it to be
 * ground down. Requests per address are capped hourly too, so the obvious
 * workaround — burn five, ask for a fresh one — runs out as well.
 */
export async function redeemCode(rawEmail: string, rawCode: string): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (code.length !== 6) return null;

  const now = new Date();
  const candidates = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.email, email),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(authTokens.createdAt));

  const codeHash = hash(code);

  for (const row of candidates) {
    if (row.attempts >= MAX_CODE_ATTEMPTS) continue;
    if (!row.codeHash) continue;

    if (sameHash(row.codeHash, codeHash)) {
      await db.update(authTokens).set({ consumedAt: now }).where(eq(authTokens.id, row.id));
      return openSession(email);
    }

    const attempts = row.attempts + 1;
    await db
      .update(authTokens)
      .set({
        attempts,
        // Out of tries: kill it rather than let it be worn down.
        consumedAt: attempts >= MAX_CODE_ATTEMPTS ? now : null,
      })
      .where(eq(authTokens.id, row.id));
  }

  return null;
}

/* ---------------------------------------------------------------- reading */

export type Account = {
  id: string;
  name: string;
  email: string | null;
  /**
   * Runs the platform: creates communities, appoints their organizers, and by
   * extension can reach any community's organizer screens. Somebody has to be
   * able to fix a community whose only organizer has left the country.
   */
  platformAdmin: boolean;
  /** Groups where this account is a coordinator or organizer, most recent first. */
  memberships: Array<{ groupId: string; role: MemberRole }>;
};

/**
 * Break-glass list of platform admins, by sign-in address.
 *
 * The database column is the real authority. This exists so a fresh
 * deployment has somebody who can get into /hq before anybody has been able
 * to get into /hq — the bootstrap problem every admin console has. Listing an
 * address here promotes it on next sign-in and then the column carries it, so
 * the variable can be removed again afterwards.
 */
function envAdmins(): string[] {
  return (process.env.PLATFORM_ADMINS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

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

  // Promotion from the environment is checked only for accounts that are not
  // already admins, so the usual request pays nothing for it.
  let platformAdmin = user.platformAdmin;
  if (!platformAdmin) {
    const listed = envAdmins();
    if (listed.length) {
      const addresses = await db
        .select({ email: authEmails.email })
        .from(authEmails)
        .where(eq(authEmails.userId, user.id));
      if (addresses.some((a) => listed.includes(a.email))) {
        // Written through rather than evaluated on every request: the column
        // becomes the single authority, and the variable can then go away.
        await db.update(users).set({ platformAdmin: true }).where(eq(users.id, user.id));
        platformAdmin = true;
      }
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    platformAdmin,
    memberships: memberships.map((m) => ({ groupId: m.groupId, role: m.role })),
  };
}

/** Runs the platform itself. Not scoped to any one community. */
export function isPlatformAdmin(account: Account | null) {
  return account?.platformAdmin === true;
}

/** True when the account may run sessions for this group. */
export function canStaff(account: Account | null, groupId: string) {
  if (!account) return false;
  if (account.platformAdmin) return true;
  return account.memberships.some(
    (m) => m.groupId === groupId && (m.role === "coordinator" || m.role === "organizer"),
  );
}

/**
 * True when the account runs this community: members, venues, fees, settings.
 *
 * Platform admins pass here for every community. That is a real grant of
 * access to other people's rosters and money, and it is deliberate: the
 * person who creates communities and appoints their organizers is already
 * trusted with exactly that, and a platform with no way to recover a
 * community whose organizer has vanished is a platform with a support queue
 * it cannot answer.
 */
export function canOrganize(account: Account | null, groupId: string) {
  if (!account) return false;
  if (account.platformAdmin) return true;
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
