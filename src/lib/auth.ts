import "server-only";
import { randomBytes, randomInt, createHash, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, eq, gt, gte, isNull, lt, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  authEmails, authSessions, authTokens, groupMembers, groups, trustedDevices, users,
  type MemberRole,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { colorFor } from "@/lib/format";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

/**
 * Accounts, for everyone.
 *
 * Any email address can register: the first code sent to a new address
 * creates the account when it is used. After that, a phone that has proved
 * itself once can be unlocked with a four-digit PIN (see trusted devices
 * below), so the email round trip happens once per phone rather than once a
 * month.
 *
 * Players who never register still exist — roster entries an organizer typed
 * in, walk-ins checked in at the door — and are identified by the `bq_uid`
 * cookie as before. The moment someone registers, that shortcut stops working
 * for their name: a registered player can only be acted as by signing in.
 *
 * Tokens are random, never guessable, and only their SHA-256 reaches the
 * database. A dump of `auth_tokens` or `auth_sessions` is therefore useless on
 * its own — the same reason nobody stores passwords.
 */

const SESSION_COOKIE = "bq_session";
const DEVICE_COOKIE = "bq_device";
const UID_COOKIE = "bq_uid";
const YEAR_S = 60 * 60 * 24 * 365;
/** Wrong PINs before the phone is sent back to email. */
const MAX_PIN_ATTEMPTS = 5;
const LINK_TTL_MS = 15 * 60 * 1000;
/** Wrong code guesses before the token is destroyed rather than left to grind. */
const MAX_CODE_ATTEMPTS = 5;
/**
 * Requests per address per hour. Without it, four digits could be ground down
 * by asking for a fresh code every time the attempt counter runs out.
 */
const MAX_REQUESTS_PER_HOUR = 5;
/**
 * Wrong codes per address per day, across every code sent. Four digits is
 * 10,000 combinations, so this is what actually holds: ten guesses a day is a
 * one-in-a-thousand chance, every request emails the owner of the address,
 * and the link in the same email (256 bits) keeps working for the real person.
 */
const MAX_CODE_FAILURES_PER_DAY = 10;
/** Spent and expired tokens are kept this long so the limits above can count them. */
const TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** No more than this many unconsumed links per email at once. */
const MAX_LIVE_LINKS = 3;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const mint = () => randomBytes(32).toString("base64url");

/**
 * Four digits, uniformly distributed. randomInt is rejection-sampled by Node,
 * so unlike `randomBytes % 10000` the low values are not slightly likelier.
 */
export const CODE_LENGTH = 4;
const mintCode = () => String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");

/** Constant-time compare so a wrong token cannot be narrowed by timing. */
function sameHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ------------------------------------------------------------ requesting */

export type LinkRequest =
  | {
      ok: true;
      token: string;
      code: string;
      /** Null for an address nobody has registered yet. */
      user: { id: string; name: string } | null;
      email: string;
    }
  | { ok: false; reason: "rate-limited" };

/**
 * Creates a code and link for any address. Registered or not, the answer is
 * the same, so the form reveals nothing about who plays here — and a new
 * address becomes an account when its first code is used.
 */
export async function requestMagicLink(rawEmail: string): Promise<LinkRequest> {
  const email = normalizeEmail(rawEmail);
  const now = new Date();

  // auth_emails is the only place sign-in looks, so a person with a personal
  // and a work address reaches one account rather than two.
  const [identity] = await db.select().from(authEmails).where(eq(authEmails.email, email));
  const [user] = identity
    ? await db.select().from(users).where(eq(users.id, identity.userId))
    : [];

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

  return { ok: true, token, code, email, user: user ? { id: user.id, name: user.name } : null };
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

  // Consume first. If opening the session then fails, the link is spent rather
  // than left live for a replay.
  await db.update(authTokens).set({ consumedAt: now }).where(eq(authTokens.id, row.id));

  return openSession(row.email);
}

/**
 * Turns a proven address into a signed-in browser. Shared by the link, the
 * code and the PIN so the three doors cannot drift apart in what they grant.
 *
 * A proven address with no account behind it is a registration. If this phone
 * has been used as an unregistered player — tapped their name at the door for
 * months — the new account takes that player over, so their games, rating and
 * history come with them. /welcome then asks them to confirm it really is
 * them, and splits it back apart if not.
 */
async function openSession(email: string): Promise<string | null> {
  let [identity] = await db.select().from(authEmails).where(eq(authEmails.email, email));
  const now = new Date();

  if (!identity) {
    const jar = await cookies();
    const phoneUid = jar.get(UID_COOKIE)?.value;
    let userId: string | null = null;

    if (phoneUid) {
      const [candidate] = await db.select().from(users).where(eq(users.id, phoneUid));
      const [taken] = candidate
        ? await db.select().from(authEmails).where(eq(authEmails.userId, candidate.id))
        : [];
      // Only an unregistered player can be claimed. A registered one already
      // belongs to somebody with an email of their own.
      if (candidate && !taken) userId = candidate.id;
    }

    if (!userId) {
      userId = newId("usr");
      const provisional = email.split("@")[0].replace(/[._-]+/g, " ").slice(0, 40) || "New player";
      await db.insert(users).values({
        id: userId,
        name: provisional,
        email,
        avatarColor: colorFor(provisional),
        rating: 1200,
        createdAt: now,
      });
    } else {
      await db.update(users).set({ email }).where(and(eq(users.id, userId), isNull(users.email)));
    }

    await db.insert(authEmails).values({ id: newId("aem"), userId, email, createdAt: now });
    [identity] = await db.select().from(authEmails).where(eq(authEmails.email, email));
    if (!identity) return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, identity.userId));
  if (!user) return null;

  await startSession(user.id);
  await trustThisDevice(user.id);
  return user.id;
}

/**
 * Opens a session for a user the caller has already proved. Server-side only
 * and never exported from an action module: every path into it must have done
 * its own proving first (a code, a link, a PIN, or /welcome splitting an
 * account it had just proved).
 */
export async function beginSessionFor(userId: string) {
  await startSession(userId);
  await trustThisDevice(userId);
}

async function startSession(userId: string) {
  const now = new Date();
  const sessionToken = mint();
  const h = await headers();
  await db.insert(authSessions).values({
    id: newId("ase"),
    userId,
    tokenHash: hash(sessionToken),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    lastSeenAt: now,
    userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
    createdAt: now,
  });

  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE, sessionToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  // One identity per browser: whoever signed in is the player this phone acts
  // as, so bookings and check-ins are theirs without a second step.
  jar.set(UID_COOKIE, userId, { path: "/", maxAge: YEAR_S, sameSite: "lax" });
}

/* ------------------------------------------------------- trusted devices */

/**
 * Marks this browser as one the person has proved by email. Reuses the
 * existing record when the phone already belongs to them, so signing in again
 * does not throw away a PIN they have set.
 */
async function trustThisDevice(userId: string) {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  const now = new Date();

  if (existing) {
    const [row] = await db
      .select()
      .from(trustedDevices)
      .where(eq(trustedDevices.tokenHash, hash(existing)));
    if (row && row.userId === userId && !row.revokedAt) {
      await db
        .update(trustedDevices)
        .set({ lastUsedAt: now, failedAttempts: 0 })
        .where(eq(trustedDevices.id, row.id));
      return;
    }
  }

  const token = mint();
  const h = await headers();
  await db.insert(trustedDevices).values({
    id: newId("dev"),
    userId,
    tokenHash: hash(token),
    userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
    createdAt: now,
    lastUsedAt: now,
  });
  jar.set(DEVICE_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: YEAR_S,
  });
}

async function thisDevice() {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select()
    .from(trustedDevices)
    .where(and(eq(trustedDevices.tokenHash, hash(token)), isNull(trustedDevices.revokedAt)));
  return row ?? null;
}

const PIN_SHAPE = /^\d{4}$/;

async function pinDigest(pin: string, salt: string) {
  return (await scrypt(pin, salt, 32)).toString("hex");
}

/** Who this phone can be unlocked as with a PIN, if anyone. */
export async function pinCandidate(): Promise<{ name: string; playerNo: number } | null> {
  const device = await thisDevice();
  if (!device?.pinHash) return null;
  const [user] = await db.select().from(users).where(eq(users.id, device.userId));
  return user ? { name: user.name, playerNo: user.playerNo } : null;
}

/** Sets or replaces the PIN on this phone. Needs a signed-in session on it. */
export async function setDevicePin(
  pin: string,
  /** Only for a caller that has just proved this user itself in the same request. */
  provenUserId?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!PIN_SHAPE.test(pin)) return { ok: false, message: "The PIN is four digits." };
  if (/^(\d)\1{3}$/.test(pin) || ["1234", "4321", "0123", "9876"].includes(pin))
    return { ok: false, message: "Pick something less guessable than that." };

  const userId = provenUserId ?? (await sessionUserId());
  if (!userId) return { ok: false, message: "Sign in first." };

  let device = await thisDevice();
  if (!device || device.userId !== userId) {
    await trustThisDevice(userId);
    device = await thisDevice();
  }
  if (!device) return { ok: false, message: "Could not remember this phone." };

  const salt = randomBytes(16).toString("hex");
  await db
    .update(trustedDevices)
    .set({ pinHash: await pinDigest(pin, salt), pinSalt: salt, failedAttempts: 0 })
    .where(eq(trustedDevices.id, device.id));
  return { ok: true };
}

/**
 * Unlocks this phone with its PIN.
 *
 * The PIN alone is worthless: it is checked only against the device record
 * named by this browser's own long random cookie. Five misses clear the PIN,
 * and from then on this phone signs in by email again.
 */
export async function signInWithPin(
  pin: string,
): Promise<{ ok: true; userId: string } | { ok: false; message: string; locked?: boolean }> {
  const device = await thisDevice();
  if (!device?.pinHash || !device.pinSalt)
    return { ok: false, message: "This phone has no PIN yet. Sign in with email.", locked: true };

  const digest = await pinDigest(pin.replace(/\D/g, ""), device.pinSalt);
  const match =
    digest.length === device.pinHash.length &&
    timingSafeEqual(Buffer.from(digest), Buffer.from(device.pinHash));

  if (!match) {
    const attempts = device.failedAttempts + 1;
    const locked = attempts >= MAX_PIN_ATTEMPTS;
    await db
      .update(trustedDevices)
      .set(
        locked
          ? { failedAttempts: attempts, pinHash: null, pinSalt: null }
          : { failedAttempts: attempts },
      )
      .where(eq(trustedDevices.id, device.id));
    return locked
      ? { ok: false, locked: true, message: "Too many wrong PINs. Sign in with email to set a new one." }
      : {
          ok: false,
          message: `That PIN didn't match. ${MAX_PIN_ATTEMPTS - attempts} ${MAX_PIN_ATTEMPTS - attempts === 1 ? "try" : "tries"} left.`,
        };
  }

  await db
    .update(trustedDevices)
    .set({ failedAttempts: 0, lastUsedAt: new Date() })
    .where(eq(trustedDevices.id, device.id));
  await startSession(device.userId);
  return { ok: true, userId: device.userId };
}

/** Stops this phone being unlockable by PIN, and forgets it entirely. */
export async function forgetThisDevice() {
  const device = await thisDevice();
  if (device)
    await db
      .update(trustedDevices)
      .set({ revokedAt: new Date(), pinHash: null, pinSalt: null })
      .where(eq(trustedDevices.id, device.id));
  (await cookies()).delete(DEVICE_COOKIE);
}

/** Every phone this person has trusted, for the security list on /me. */
export async function listMyDevices(userId: string) {
  return db
    .select()
    .from(trustedDevices)
    .where(and(eq(trustedDevices.userId, userId), isNull(trustedDevices.revokedAt)))
    .orderBy(desc(trustedDevices.lastUsedAt));
}

export async function revokeDevice(userId: string, deviceId: string) {
  await db
    .update(trustedDevices)
    .set({ revokedAt: new Date(), pinHash: null, pinSalt: null })
    .where(and(eq(trustedDevices.id, deviceId), eq(trustedDevices.userId, userId)));
}

/**
 * Redeems the four-digit code instead of the link.
 *
 * Scoped to the address that asked for it, so an attacker must already know
 * whose account they are attacking. A wrong guess costs one of five tries on
 * the token, and the fifth destroys it. Requests are capped hourly and wrong
 * guesses daily per address, so the workaround — burn five, ask again — runs
 * out at ten guesses a day against ten thousand combinations.
 */
export async function redeemCode(rawEmail: string, rawCode: string): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  // Six still accepted for codes emailed just before the switch to four.
  if (code.length !== CODE_LENGTH && code.length !== 6) return null;

  const now = new Date();

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const today = await db
    .select({ attempts: authTokens.attempts })
    .from(authTokens)
    .where(and(eq(authTokens.email, email), gte(authTokens.createdAt, dayAgo)));
  const failures = today.reduce((n, t) => n + t.attempts, 0);
  if (failures >= MAX_CODE_FAILURES_PER_DAY) return null;

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
  playerNo: number;
  /** False until they have confirmed their name on /welcome. */
  onboarded: boolean;
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
/**
 * The signed-in user's id, or null. One query, memoised for the request, so
 * everything that asks "who is this" pays for it once.
 */
export const sessionUserId = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [session] = await db
    .select({ userId: authSessions.userId })
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, hash(token)), gt(authSessions.expiresAt, new Date())));
  return session?.userId ?? null;
});

/** True when this user has an account (a sign-in address). */
export const isRegistered = cache(async (userId: string): Promise<boolean> => {
  const [row] = await db
    .select({ id: authEmails.id })
    .from(authEmails)
    .where(eq(authEmails.userId, userId))
    .limit(1);
  return Boolean(row);
});

export const currentAccount = cache(async (): Promise<Account | null> => {
  const userId = await sessionUserId();
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  // A deleted or suspended community grants nothing, to anyone — including
  // its own staff — until it is restored.
  const memberships = (
    await db
      .select({ m: groupMembers })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(
        and(
          eq(groupMembers.userId, user.id),
          eq(groupMembers.status, "active"),
          isNull(groups.deletedAt),
          isNull(groups.archivedAt),
        ),
      )
      .orderBy(desc(groupMembers.joinedAt))
  ).map((r) => r.m);

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
    playerNo: user.playerNo,
    onboarded: Boolean(user.onboardedAt),
    platformAdmin,
    memberships: memberships.map((m) => ({ groupId: m.groupId, role: m.role })),
  };
});

/** Runs the platform itself. Not scoped to any one community. */
export function isPlatformAdmin(account: Account | null) {
  return account?.platformAdmin === true;
}

/*
 * Permissions come from membership and nothing else.
 *
 * There is deliberately no platform-admin shortcut in any of these. A
 * community and its members belong to its owner; the platform can approve new
 * communities and suspend abusive ones, and has no way in beyond that. If a
 * bypass is ever added here, the ownership notice every owner accepted stops
 * being true.
 */

const STAFF: MemberRole[] = ["coordinator", "organizer", "owner"];
const RUNS: MemberRole[] = ["organizer", "owner"];

/** True when the account may run sessions for this community. */
export function canStaff(account: Account | null, groupId: string) {
  if (!account) return false;
  return account.memberships.some((m) => m.groupId === groupId && STAFF.includes(m.role));
}

/** True when the account runs this community day to day: sessions, venues, members, money. */
export function canOrganize(account: Account | null, groupId: string) {
  if (!account) return false;
  return account.memberships.some((m) => m.groupId === groupId && RUNS.includes(m.role));
}

/**
 * True when the account owns this community: appoints organizers and
 * co-owners, decides who can find it, and can delete it.
 */
export function canOwn(account: Account | null, groupId: string) {
  if (!account) return false;
  return account.memberships.some((m) => m.groupId === groupId && m.role === "owner");
}

/* --------------------------------------------------------------- signing out */

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(authSessions).where(eq(authSessions.tokenHash, hash(token)));
  }
  jar.delete(SESSION_COOKIE);
  // The phone forgets who it was acting as, but stays trusted: the next
  // sign-in on it is a PIN, not an email.
  jar.delete(UID_COOKIE);
}

/**
 * Clears spent and expired rows. Called opportunistically on sign-in rather
 * than on a schedule, which keeps the table small without needing a cron.
 */
export async function pruneAuth() {
  const now = new Date();
  // Kept for a day after expiry: the hourly request cap and the daily cap on
  // wrong codes count them, and deleting them early would reset both.
  await db
    .delete(authTokens)
    .where(lt(authTokens.expiresAt, new Date(now.getTime() - TOKEN_RETENTION_MS)));
  await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
}
