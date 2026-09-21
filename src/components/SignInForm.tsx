"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { pinSignInAction, signInAction, verifyCodeAction } from "@/server/auth-actions";
import {
  CODE_IDLE, PIN_IDLE, SIGN_IN_IDLE, type CodeState, type PinState, type SignInState,
} from "@/server/auth-types";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";

/**
 * One front door for everybody: sign in, or create an account — the same
 * form, because the only difference is whether the address has been seen
 * before, and saying which would tell strangers who plays here.
 *
 * On a phone that has been here before and set a PIN, the PIN comes first.
 * That is the everyday case once someone is set up, and it is four digits
 * instead of a trip to their inbox.
 */
export function SignInForm({
  next,
  expired = false,
  pinFor,
}: {
  next: string;
  expired?: boolean;
  /** Set when this phone is trusted and has a PIN. */
  pinFor?: { name: string; playerNo: number } | null;
}) {
  const [usePin, setUsePin] = useState(Boolean(pinFor));

  if (pinFor && usePin) {
    return <PinDoor next={next} who={pinFor} onEmail={() => setUsePin(false)} />;
  }
  return <EmailDoor next={next} expired={expired} />;
}

function PinDoor({
  next,
  who,
  onEmail,
}: {
  next: string;
  who: { name: string; playerNo: number };
  onEmail: () => void;
}) {
  const [state, action] = useActionState<PinState, FormData>(pinSignInAction, PIN_IDLE);

  return (
    <div className="card mx-auto max-w-sm p-5">
      <p className="label">Welcome back</p>
      <h2 className="mt-1 text-lg font-bold">
        {who.name} <span className="font-mono text-sm text-muted">#{who.playerNo}</span>
      </h2>
      <p className="mt-1 text-sm text-muted">Enter your PIN for this phone.</p>

      {state.locked ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-amber" role="alert">
            {state.message}
          </p>
          <button type="button" className="btn btn-primary w-full" onClick={onEmail}>
            Sign in with email
          </button>
        </div>
      ) : (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <input
            className="input text-center text-3xl tracking-[.6em]"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="····"
            aria-label="Four-digit PIN"
            autoFocus
            required
          />
          {state.status === "error" && (
            <p className="text-sm text-rose" role="alert">
              {state.message}
            </p>
          )}
          <SubmitButton className="btn btn-primary w-full" pendingLabel="Checking...">
            Unlock
          </SubmitButton>
        </form>
      )}

      <button type="button" onClick={onEmail} className="mt-4 w-full text-center text-xs text-teal hover:underline">
        Not {who.name.split(" ")[0]}, or forgot the PIN? Use email instead
      </button>
    </div>
  );
}

function EmailDoor({ next, expired }: { next: string; expired: boolean }) {
  const [state, formAction] = useActionState<SignInState, FormData>(signInAction, SIGN_IN_IDLE);
  const [codeState, codeAction] = useActionState<CodeState, FormData>(verifyCodeAction, CODE_IDLE);

  if (state.status === "sent") {
    return (
      <div className="card mx-auto max-w-sm p-5">
        <p className="label">Check your inbox</p>
        <h2 className="mt-1 text-lg font-bold">Enter your code</h2>
        <p className="mt-2 text-sm text-muted">{state.message}</p>

        <form action={codeAction} className="mt-4 space-y-3">
          <input type="hidden" name="email" value={state.email ?? ""} />
          <input type="hidden" name="next" value={next} />
          <input
            className="input text-center text-2xl tracking-[.4em]"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="------"
            aria-label="Six-digit sign-in code"
            autoFocus
            required
          />
          {codeState.status === "error" && (
            <p className="text-sm text-rose" role="alert">
              {codeState.message}
            </p>
          )}
          <SubmitButton className="btn btn-primary w-full" pendingLabel="Checking...">
            Continue
          </SubmitButton>
        </form>

        <p className="mt-4 text-xs text-muted">
          The same email has a button you can tap instead — either works, once.
        </p>

        {(state.devCode || state.devLink) && (
          <div className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-3">
            <p className="text-xs font-semibold text-amber">Development only — no mail provider configured</p>
            {state.devCode && (
              <p className="mt-1 font-mono text-lg tracking-widest text-amber">{state.devCode}</p>
            )}
            {state.devLink && (
              <a href={state.devLink} className="mt-1 block break-all text-xs text-teal underline">
                {state.devLink}
              </a>
            )}
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
      <p className="label">Smash Queue</p>
      <h2 className="mt-1 text-lg font-bold">Sign in or create your account</h2>
      <p className="mt-1 text-sm text-muted">
        Enter your email and we&apos;ll send a code. New here? The same code creates your account.
        No password, ever.
      </p>

      {expired && state.status === "idle" && (
        <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          That link didn&apos;t work — they last 15 minutes and work once. Here&apos;s a fresh start.
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
          Email me a code
        </SubmitButton>
      </form>

      <p className="mt-4 text-xs text-muted">
        Set a PIN after you sign in and this phone won&apos;t need the email again.
      </p>
    </div>
  );
}
