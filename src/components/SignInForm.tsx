"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { signInAction } from "@/server/auth-actions";
import { SIGN_IN_IDLE, type SignInState } from "@/server/auth-types";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";

/**
 * Sign-in for coordinators and organizers. Players never see this — they tap
 * their name and the phone remembers them.
 */
export function SignInForm({ next, expired = false }: { next: string; expired?: boolean }) {
  const [state, formAction] = useActionState<SignInState, FormData>(signInAction, SIGN_IN_IDLE);

  if (state.status === "sent") {
    return (
      <div className="card mx-auto max-w-sm p-5">
        <p className="label">Check your inbox</p>
        <h2 className="mt-1 text-lg font-bold">Link sent</h2>
        <p className="mt-2 text-sm text-muted">{state.message}</p>

        {state.devLink && (
          <div className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-3">
            <p className="text-xs font-semibold text-amber">
              Development only — no mail provider configured
            </p>
            <a href={state.devLink} className="mt-1 block break-all text-xs text-teal underline">
              {state.devLink}
            </a>
          </div>
        )}

        <p className="mt-4 text-xs text-muted">
          Nothing arrived? Check spam, or mail{" "}
          <a href={supportMailto("Cannot sign in")} className="text-teal hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-sm p-5">
      <p className="label">Staff access</p>
      <h2 className="mt-1 text-lg font-bold">Sign in</h2>
      <p className="mt-1 text-sm text-muted">
        We&apos;ll email you a link. No password to remember or lose.
      </p>

      {expired && state.status === "idle" && (
        <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          That link didn&apos;t work — they last 15 minutes and work once. Here&apos;s a fresh one.
        </p>
      )}

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={next} />
        <input
          className="input"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email address"
          required
        />
        {state.status === "error" && (
          <p className="text-sm text-rose" role="alert">
            {state.message}
          </p>
        )}
        <SubmitButton className="btn btn-primary w-full" pendingLabel="Sending...">
          Email me a link
        </SubmitButton>
      </form>

      <p className="mt-4 text-xs text-muted">
        Playing tonight rather than running it?{" "}
        <a href="/who" className="text-teal hover:underline">
          Pick your name
        </a>{" "}
        — players don&apos;t need an account.
      </p>
    </div>
  );
}
