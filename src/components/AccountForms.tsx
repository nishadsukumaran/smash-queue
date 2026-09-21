"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { setPinAction } from "@/server/auth-actions";
import { PIN_IDLE, type PinState } from "@/server/auth-types";
import { requestCommunityAction, requestRoleAction } from "@/server/community-actions";
import { COMMUNITY_IDLE, type CommunityFormState } from "@/server/community-types";

/** Set or change the PIN that unlocks this phone. */
export function SetPinForm({ hasPin }: { hasPin: boolean }) {
  const [state, action] = useActionState<PinState, FormData>(setPinAction, PIN_IDLE);
  const [open, setOpen] = useState(!hasPin);

  if (!open && state.status !== "done") {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Change PIN
      </button>
    );
  }
  if (state.status === "done") return <p className="text-sm text-teal">{state.message}</p>;

  return (
    <form action={action} className="grid grid-cols-[1fr_1fr_auto] gap-2">
      <input
        className="input text-center tracking-[.4em]"
        name="pin"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        placeholder="PIN"
        aria-label="New four-digit PIN"
        required
      />
      <input
        className="input text-center tracking-[.4em]"
        name="confirm"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        placeholder="Again"
        aria-label="Type the PIN again"
        required
      />
      <SubmitButton className="btn btn-primary btn-sm">Save</SubmitButton>
      {state.status === "error" && (
        <p className="col-span-3 text-sm text-rose" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** Ask a community's owners for a bigger role. */
export function RequestRoleForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState<CommunityFormState, FormData>(requestRoleAction, COMMUNITY_IDLE);
  const [open, setOpen] = useState(false);

  if (state?.ok) return <p className="text-xs text-teal">{state.message}</p>;
  if (!open)
    return (
      <button type="button" className="text-xs text-teal hover:underline" onClick={() => setOpen(true)}>
        Help run this community?
      </button>
    );

  return (
    <form action={action} className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
      <input type="hidden" name="groupId" value={groupId} />
      <select className="input !w-auto" name="role" defaultValue="organizer" aria-label="Role">
        <option value="organizer">Organizer</option>
        <option value="coordinator">Coordinator</option>
      </select>
      <input className="input" name="note" maxLength={300} placeholder="A line for the owner (optional)" />
      <SubmitButton className="btn btn-ghost btn-sm">Ask the owner</SubmitButton>
      {state && !state.ok && <p className="text-xs text-amber sm:col-span-3">{state.message}</p>}
    </form>
  );
}

/** Ask the platform for a community of your own. */
export function RequestCommunityForm({ direct = false }: { direct?: boolean }) {
  const [state, action] = useActionState<CommunityFormState, FormData>(
    requestCommunityAction,
    COMMUNITY_IDLE,
  );

  if (state?.ok) {
    return (
      <div className="card p-4">
        <p className="label text-teal">Request sent</p>
        <p className="mt-1 text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-3 p-4">
      <label className="block">
        <span className="label">Community name</span>
        <input className="input mt-1" name="name" maxLength={60} required placeholder="Marina Smashers" />
      </label>
      <label className="block">
        <span className="label">Where</span>
        <input className="input mt-1" name="location" maxLength={80} placeholder="Dubai Marina, UAE" />
      </label>
      <label className="block">
        <span className="label">One line for the directory</span>
        <input
          className="input mt-1"
          name="description"
          maxLength={200}
          placeholder="Friendly doubles, intermediate and up"
        />
      </label>
      <label className="block">
        <span className="label">How you play</span>
        <textarea
          className="input mt-1 min-h-20 resize-y"
          name="details"
          maxLength={1000}
          placeholder="When and where you play, roughly how many of you, anything we should know."
        />
      </label>
      {state && !state.ok && <p className="text-sm text-amber">{state.message}</p>}
      <SubmitButton className="btn btn-primary w-full" pendingLabel="Sending...">
        {direct ? "Create the community" : "Ask for the community"}
      </SubmitButton>
      <p className="text-xs text-muted">
        Once it&apos;s approved you are its owner. It&apos;s yours — members, sessions and records —
        and nobody outside it, Smash Queue included, can see in.
      </p>
    </form>
  );
}
