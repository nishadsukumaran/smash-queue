"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteCommunityAction } from "@/server/community-actions";
import { COMMUNITY_IDLE, type CommunityFormState } from "@/server/community-types";

/**
 * The one button in the app nobody can undo on the owner's behalf.
 *
 * Typing the name is the confirmation, and the button stays disabled until it
 * matches, so a stray tap on a phone does nothing.
 */
export function DeleteCommunityForm({ groupId, name }: { groupId: string; name: string }) {
  const [state, action] = useActionState<CommunityFormState, FormData>(
    deleteCommunityAction,
    COMMUNITY_IDLE,
  );
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="groupId" value={groupId} />
      <label className="block">
        <span className="text-xs text-muted">
          Type <span className="font-semibold text-chalk">{name}</span> to confirm
        </span>
        <input
          className="input mt-1"
          name="confirmName"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          aria-label="Community name, to confirm deletion"
        />
      </label>
      <SubmitButton
        className="btn btn-ghost w-full border-rose/60 text-rose"
        disabled={!matches}
        pendingLabel="Deleting..."
        haptic="error"
      >
        Delete this community
      </SubmitButton>
      {state && !state.ok && <p className="text-sm text-rose">{state.message}</p>}
    </form>
  );
}
