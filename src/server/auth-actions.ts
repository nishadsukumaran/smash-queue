"use server";

/**
 * Sign-in and sign-out. Kept apart from form-actions.ts because these are the
 * only actions that can hand someone else's data to a browser, and they are
 * easier to audit in one short file.
 */

import { redirect } from "next/navigation";
import { requestMagicLink, redeemMagicLink, redeemCode, signOut, pruneAuth } from "@/lib/auth";
import { sendMagicLink } from "@/lib/mail";
import { requestOrigin } from "@/lib/origin";
import { safeNext } from "@/lib/safe-next";
import { redirect as nav } from "next/navigation";
import type { CodeState, SignInState } from "./auth-types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Always reports the same thing to the visitor, whether or not the address
 * belongs to anyone. Saying "no such account" would turn this form into a
 * membership oracle: type an address, learn whether that person plays here.
 */
export async function signInAction(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const email = str(fd, "email");
  const next = str(fd, "next") || "/admin";

  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return { status: "error", message: "That doesn't look like an email address." };
  }

  // Checked before the address is looked up, and returned for any address.
  // Doing it after the lookup would mean only real members ever saw this
  // message, which would turn a configuration warning into a membership oracle.
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === "production") {
    return {
      status: "error",
      message:
        "Email sign-in isn't configured on this deployment yet, so no link can be sent. Coordinators can still use the session PIN on the court board.",
    };
  }

  const sent: SignInState = {
    status: "sent",
    email,
    message:
      "If that address is on the staff list, a code and a link are on their way. Both expire in 15 minutes.",
  };

  const req = await requestMagicLink(email);
  if (!req.ok) return sent;

  const origin = await requestOrigin();
  const url = `${origin}/signin/verify?token=${encodeURIComponent(req.token)}&next=${encodeURIComponent(next)}`;

  try {
    const res = await sendMagicLink(req.user.email, url, req.code, req.user.name);
    // Without a mail provider the link goes to the server log. Surfacing it in
    // the UI too would be an open door in production, so it is shown only in
    // development, where whoever is looking at the screen owns the machine.
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
 * The typed-code half of sign-in. Deliberately vague on failure: "wrong code",
 * "expired" and "no such address" are the same message, because distinguishing
 * them would tell someone probing codes which addresses are worth probing.
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
  nav(next);
}


export async function verifyAction(token: string, next: string) {
  const userId = await redeemMagicLink(token);
  if (!userId) return null;
  await pruneAuth();
  return next;
}

export async function signOutAction() {
  await signOut();
  redirect("/");
}
