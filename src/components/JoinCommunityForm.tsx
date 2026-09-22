"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { joinCommunityAction, joinWithCodeAction } from "@/server/community-actions";
import { JOIN_IDLE, type JoinFormState } from "@/server/community-types";
import type { JoinPolicy } from "@/db/schema";

/**
 * Knocking on a community's door, as the signed-in person.
 *
 * Joining needs an account now: a community is going to know you by your
 * player number and your record there, and a name typed into a box can be
 * anybody. Without one, the form becomes a sign-in link that comes back here.
 */
export function JoinCommunityForm({
  groupId,
  policy,
  signedIn,
  returnTo,
  label,
}: {
  groupId: string;
  policy: JoinPolicy;
  signedIn: boolean;
  /** Where to come back to after signing in. */
  returnTo: string;
  label?: string;
}) {
  const [state, action] = useActionState<JoinFormState, FormData>(joinCommunityAction, JOIN_IDLE);
  const needsApproval = policy === "approval";

  if (policy === "closed") {
    return (
      <p className="text-sm text-muted">
        This community adds members by invitation. Give the organizer your player number and they
        can invite you.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <Link href={`/signin?next=${encodeURIComponent(returnTo)}`} className="btn btn-primary w-full">
        Sign in to {needsApproval ? "ask to join" : "join"}
      </Link>
    );
  }

  if (state?.ok && state.status === "waiting") {
    return (
      <div className="rounded-xl border border-teal/40 bg-court p-4">
        <p className="label text-teal">Request sent</p>
        <p className="mt-1 text-sm">
          The organizer will let you in. You&apos;ll find it under your communities once they do.
        </p>
      </div>
    );
  }

  return (
    <div>
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="groupId" value={groupId} />
        {needsApproval ? (
          <input
            className="input"
            name="note"
            maxLength={300}
            placeholder="A line to help them place you (optional)"
            aria-label="A note for the organizer"
          />
        ) : (
          <span />
        )}
        <SubmitButton className="btn btn-primary" pendingLabel={needsApproval ? "Sending..." : "Joining..."}>
          {label ?? (needsApproval ? "Ask to join" : "Join")}
        </SubmitButton>
      </form>
      {state && !state.ok && <p className="mt-2 text-sm text-amber">{state.message}</p>}
    </div>
  );
}

/** The "I was given a code" box. */
export function JoinCodeForm({ signedIn }: { signedIn: boolean }) {
  const [state, action] = useActionState<JoinFormState, FormData>(joinWithCodeAction, JOIN_IDLE);

  if (state?.ok && state.status === "waiting") {
    return (
      <div className="card p-4">
        <p className="label text-teal">Request sent</p>
        <p className="mt-1 text-sm">The organizer will let you in.</p>
      </div>
    );
  }

  return (
    <section className="card p-4">
      <h2 className="label">Got a code?</h2>
      <p className="mt-1 text-xs text-muted">Four letters and numbers from whoever runs the community.</p>
      {signedIn ? (
        <form action={action} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            className="input font-mono uppercase tracking-[.2em]"
            name="code"
            placeholder="XXXX"
            maxLength={8}
            autoComplete="off"
            aria-label="Invite code"
            required
          />
          <SubmitButton className="btn btn-primary" pendingLabel="Checking...">
            Join
          </SubmitButton>
        </form>
      ) : (
        <Link href="/signin?next=/communities" className="btn btn-ghost mt-3 w-full">
          Sign in to use a code
        </Link>
      )}
      {state && !state.ok && <p className="mt-2 text-sm text-amber">{state.message}</p>}
    </section>
  );
}
