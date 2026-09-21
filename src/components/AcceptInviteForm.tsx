"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { acceptInviteAction } from "@/server/community-actions";
import { COMMUNITY_IDLE, type CommunityFormState } from "@/server/community-types";

/** Accepting a link invitation, as the signed-in person. One button. */
export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState<CommunityFormState, FormData>(
    acceptInviteAction,
    COMMUNITY_IDLE,
  );

  return (
    <div>
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="btn btn-primary w-full" pendingLabel="Joining..." haptic="confirm">
          Accept
        </SubmitButton>
      </form>
      {state && !state.ok && <p className="mt-2 text-sm text-amber">{state.message}</p>}
    </div>
  );
}
