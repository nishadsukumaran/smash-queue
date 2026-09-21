"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { acceptInviteAction } from "@/server/community-actions";
import { COMMUNITY_IDLE, type CommunityFormState } from "@/server/community-types";

/**
 * Accepting a personal invitation.
 *
 * One button when the phone already knows who you are, one field when it does
 * not. No password is set and no email is confirmed: holding the link is the
 * proof, the organizer named this person in advance, and adding a signup form
 * here would lose more people than it protects.
 */
export function AcceptInviteForm({
  token,
  knownAs,
  suggestedName,
}: {
  token: string;
  /** The identity already on this phone, if any. */
  knownAs?: string | null;
  /** What the organizer called them when inviting. */
  suggestedName?: string | null;
}) {
  const [state, action] = useActionState<CommunityFormState, FormData>(
    acceptInviteAction,
    COMMUNITY_IDLE,
  );

  return (
    <div>
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="token" value={token} />

        {knownAs ? (
          <p className="self-center text-sm text-muted">
            Joining as <span className="font-semibold text-chalk">{knownAs}</span>
          </p>
        ) : (
          <input
            className="input"
            name="name"
            placeholder="Your name"
            autoComplete="name"
            maxLength={40}
            defaultValue={suggestedName ?? ""}
            required
          />
        )}

        <SubmitButton className="btn btn-primary" pendingLabel="Joining...">
          Accept
        </SubmitButton>
      </form>

      {state && !state.ok && <p className="mt-2 text-sm text-amber">{state.message}</p>}
    </div>
  );
}
