"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { welcomeAction } from "@/server/auth-actions";
import { WELCOME_IDLE, type WelcomeState } from "@/server/auth-types";

/**
 * The one-time setup after registering: your name, and a PIN for this phone.
 *
 * When registering took over a player this phone had been used as, the form
 * says so and asks. "That isn't me" is not a small print option; it is how a
 * borrowed phone avoids handing one person's history to another.
 */
export function WelcomeForm({
  next,
  name,
  claimed,
}: {
  next: string;
  name: string;
  /** Present when the new account took over an existing player's history. */
  claimed: { games: number; communities: number } | null;
}) {
  const [state, action] = useActionState<WelcomeState, FormData>(welcomeAction, WELCOME_IDLE);
  const [notMe, setNotMe] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="notMe" value={notMe ? "1" : "0"} />

      {claimed && (
        <div className={`rounded-xl border p-3 ${notMe ? "border-line" : "border-teal/50 bg-teal/5"}`}>
          {notMe ? (
            <p className="text-sm">
              Got it — your account will start fresh, and{" "}
              <span className="font-semibold">{name}</span>&apos;s history stays with {name}.{" "}
              <button type="button" className="text-teal underline" onClick={() => setNotMe(false)}>
                Undo
              </button>
            </p>
          ) : (
            <>
              <p className="text-sm">
                This phone has been playing as <span className="font-semibold">{name}</span>
                {claimed.games > 0 ? ` — ${claimed.games} games` : ""}
                {claimed.communities > 0
                  ? ` in ${claimed.communities} ${claimed.communities === 1 ? "community" : "communities"}`
                  : ""}
                . Your account has taken that history over.
              </p>
              <button
                type="button"
                className="mt-2 text-xs text-amber underline"
                onClick={() => setNotMe(true)}
              >
                That isn&apos;t me — start fresh
              </button>
            </>
          )}
        </div>
      )}

      <label className="block">
        <span className="label">Your name, as other players know you</span>
        <input
          className="input mt-1"
          name="name"
          defaultValue={notMe ? "" : name}
          key={notMe ? "fresh" : "claimed"}
          autoComplete="name"
          maxLength={40}
          required
        />
      </label>

      <fieldset className="rounded-xl border border-line p-3">
        <legend className="label px-1">A PIN for this phone (optional)</legend>
        <p className="text-xs text-muted">
          Four digits. Next time you sign in on this phone, it&apos;s all you type — no email.
          It only works on this phone.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            className="input text-center tracking-[.5em]"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="PIN"
            aria-label="Choose a four-digit PIN"
          />
          <input
            className="input text-center tracking-[.5em]"
            name="confirm"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="Again"
            aria-label="Type the PIN again"
          />
        </div>
      </fieldset>

      {state.status === "error" && (
        <p className="text-sm text-rose" role="alert">
          {state.message}
        </p>
      )}

      <SubmitButton className="btn btn-primary w-full" pendingLabel="Saving..." haptic="confirm">
        All set
      </SubmitButton>
    </form>
  );
}
