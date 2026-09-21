"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { appointOrganizerAction } from "@/server/community-actions";
import { COMMUNITY_IDLE, type CommunityFormState } from "@/server/community-types";

/**
 * Handing somebody the keys to a community.
 *
 * An email address is required and is not optional politeness: organizer
 * screens are reachable only with an account, and an account is an address.
 * Appointing an organizer who cannot sign in is the one failure mode worth
 * designing out.
 */
export function AppointOrganizerForm({
  groupId,
  allowCoordinator = true,
}: {
  groupId: string;
  allowCoordinator?: boolean;
}) {
  const [state, action] = useActionState<CommunityFormState, FormData>(
    appointOrganizerAction,
    COMMUNITY_IDLE,
  );

  return (
    <div>
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input type="hidden" name="groupId" value={groupId} />
        <input className="input" name="name" placeholder="Full name" maxLength={60} required />
        <input
          className="input"
          name="email"
          type="email"
          placeholder="they@example.com"
          autoComplete="off"
          required
        />
        {allowCoordinator ? (
          <select className="input !w-auto" name="role" defaultValue="organizer" aria-label="Role">
            <option value="organizer">Organizer</option>
            <option value="coordinator">Coordinator</option>
          </select>
        ) : (
          <input type="hidden" name="role" value="organizer" />
        )}
        <SubmitButton className="btn btn-primary" pendingLabel="Adding...">
          Appoint
        </SubmitButton>
      </form>

      {state && (
        <p className={`mt-2 text-sm ${state.ok ? "text-teal" : "text-amber"}`}>{state.message}</p>
      )}
    </div>
  );
}
