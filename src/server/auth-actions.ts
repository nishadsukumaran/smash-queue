"use server";

/**
 * Signing in, registering, PINs and signing out. Kept apart from
 * form-actions.ts because these are the only actions that can hand somebody's
 * account to a browser, and they are easier to audit in one file.
 */

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authEmails, users } from "@/db/schema";
import {
  beginSessionFor, currentAccount, forgetThisDevice, pruneAuth, redeemCode, redeemMagicLink, requestMagicLink,
  revokeDevice, sessionUserId, setDevicePin, signInWithPin, signOut,
} from "@/lib/auth";
import { colorFor } from "@/lib/format";
import { newId } from "@/lib/ids";
import { sendMagicLink } from "@/lib/mail";
import { requestOrigin } from "@/lib/origin";
import { safeNext } from "@/lib/safe-next";
import { clearActiveCommunity } from "@/lib/tenant";
import type { CodeState, PinState, SignInState, WelcomeState } from "./auth-types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Where to go after a successful sign-in: set up first if they never have. */
async function landing(next: string) {
  const account = await currentAccount();
  if (account && !account.onboarded) return `/welcome?next=${encodeURIComponent(next)}`;
  return next;
}

/**
 * Sends a code to any address. Registered or not, the reply is identical, so
 * the form tells nobody who plays here — and an address nobody has used before
 * becomes an account when its code is entered.
 */
export async function signInAction(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const email = str(fd, "email");
  const next = safeNext(str(fd, "next") || "/");

  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return { status: "error", message: "That doesn't look like an email address." };
  }

  // Checked before anything is looked up, and returned for every address.
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === "production") {
    return {
      status: "error",
      message: "Email sign-in isn't configured on this deployment yet, so no code can be sent.",
    };
  }

  const sent: SignInState = {
    status: "sent",
    email,
    message: `A code and a link are on their way to ${email}. Both expire in 15 minutes.`,
  };

  const req = await requestMagicLink(email);
  if (!req.ok) {
    return {
      status: "error",
      message: "Too many codes requested for that address. Wait a few minutes and try again.",
    };
  }

  const origin = await requestOrigin();
  const url = `${origin}/signin/verify?token=${encodeURIComponent(req.token)}&next=${encodeURIComponent(next)}`;

  try {
    const res = await sendMagicLink(req.email, url, req.code, req.user?.name ?? "there");
    // Without a mail provider the code goes to the server log. Showing it on
    // screen too is only safe where whoever is looking owns the machine.
    if (!res.delivered && process.env.NODE_ENV !== "production") {
      return { ...sent, devLink: res.fallbackLink, devCode: req.code };
    }
  } catch {
    return {
      status: "error",
      message: "The email could not be sent just now. Try again in a minute.",
    };
  }

  return sent;
}

/**
 * The typed-code half of sign-in. Deliberately vague on failure: "wrong
 * code" and "expired" read the same, because telling them apart helps only
 * somebody probing codes.
 */
export async function verifyCodeAction(_prev: CodeState, fd: FormData): Promise<CodeState> {
  const email = str(fd, "email");
  const code = str(fd, "code");
  const next = safeNext(str(fd, "next"));

  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) {
    return { status: "error", message: "The code is six digits." };
  }

  const userId = await redeemCode(email, code);
  if (!userId) {
    return {
      status: "error",
      message: "That code didn't work. Check the latest email, or request a new one.",
    };
  }

  await pruneAuth();
  redirect(await landing(next));
}

export async function verifyAction(token: string, next: string) {
  const userId = await redeemMagicLink(token);
  if (!userId) return null;
  await pruneAuth();
  return landing(next);
}

/* ------------------------------------------------------------------ PIN */

export async function pinSignInAction(_prev: PinState, fd: FormData): Promise<PinState> {
  const pin = str(fd, "pin");
  const next = safeNext(str(fd, "next"));
  if (!/^\d{4}$/.test(pin)) return { status: "error", message: "The PIN is four digits." };

  const res = await signInWithPin(pin);
  if (!res.ok) return { status: "error", message: res.message, locked: res.locked };
  redirect(await landing(next));
}

export async function setPinAction(_prev: PinState, fd: FormData): Promise<PinState> {
  const pin = str(fd, "pin");
  const again = str(fd, "confirm");
  if (pin !== again) return { status: "error", message: "The two PINs don't match." };
  const res = await setDevicePin(pin);
  if (!res.ok) return { status: "error", message: res.message ?? "Could not set the PIN." };
  return { status: "done", message: "PIN set. Next time on this phone, that's all you'll type." };
}

export async function forgetDeviceAction() {
  await forgetThisDevice();
  await signOut();
  redirect("/signin");
}

export async function revokeDeviceAction(fd: FormData) {
  const me = await sessionUserId();
  if (!me) return;
  await revokeDevice(me, str(fd, "deviceId"));
}

/* -------------------------------------------------------------- welcome */

/**
 * First sign-in: confirm your name and, optionally, set a PIN.
 *
 * If this phone had been used as an unregistered player, the new account took
 * that player over — games, ratings, communities. "That isn't me" undoes it:
 * the history stays with the old roster entry, and the account starts fresh.
 * That matters because the old entry may be a friend's name tapped on a
 * borrowed phone, and taking over somebody else's history is not a mistake
 * anyone should be able to make silently.
 */
export async function welcomeAction(_prev: WelcomeState, fd: FormData): Promise<WelcomeState> {
  const userId = await sessionUserId();
  if (!userId) return { status: "error", message: "Your sign-in expired. Sign in again." };
  const next = safeNext(str(fd, "next"));

  const name = str(fd, "name").replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40)
    return { status: "error", message: "Your name should be 2 to 40 characters." };

  const pin = str(fd, "pin");
  if (pin && pin !== str(fd, "confirm"))
    return { status: "error", message: "The two PINs don't match." };

  const [me] = await db.select().from(users).where(eq(users.id, userId));
  if (!me) return { status: "error", message: "Your sign-in expired. Sign in again." };

  let targetId = userId;

  // Only on the very first welcome. Once somebody has confirmed who they are,
  // splitting the account is not a button anyone should find.
  if (str(fd, "notMe") === "1" && !me.onboardedAt) {
    const freshId = newId("usr");
    // Contact address moves first: users.email is unique.
    await db.update(users).set({ email: null }).where(eq(users.id, userId));
    await db.insert(users).values({
      id: freshId,
      name,
      email: me.email,
      avatarColor: colorFor(name),
      rating: 1200,
      createdAt: new Date(),
    });
    // The sign-in addresses go with the person. The old roster entry goes back
    // to being unregistered, so whoever it really belongs to can claim it.
    await db.update(authEmails).set({ userId: freshId }).where(eq(authEmails.userId, userId));
    await signOut();
    await clearActiveCommunity();
    await beginSessionFor(freshId);
    targetId = freshId;
  }

  await db
    .update(users)
    .set({ name, onboardedAt: me.onboardedAt ?? new Date() })
    .where(eq(users.id, targetId));

  if (pin) {
    const res = await setDevicePin(pin, targetId);
    if (!res.ok) return { status: "error", message: res.message ?? "Could not set the PIN." };
  }

  redirect(next);
}

export async function signOutAction() {
  await signOut();
  redirect("/");
}
