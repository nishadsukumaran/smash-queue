"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { createCommunityAction } from "@/server/community-actions";
import { COMMUNITY_IDLE, type CommunityFormState } from "@/server/community-types";

/**
 * Starting a community.
 *
 * The organizer's name and email are required in the same breath as the name,
 * because a community without somebody who can sign in and run it is an empty
 * shell that only the platform admin can rescue. Creating it and staffing it
 * as two steps means the second one gets forgotten.
 */
export function CreateCommunityForm() {
  const [state, action] = useActionState<CommunityFormState, FormData>(
    createCommunityAction,
    COMMUNITY_IDLE,
  );

  return (
    <section className="card p-4">
      <h2 className="label">Start a community</h2>
      <p className="mt-1 text-xs text-muted">
        Its organizer gets an account straight away. Everything else — venues, sessions, fees —
        they set up themselves.
      </p>

      <form action={action} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className="input" name="name" placeholder="Community name" maxLength={60} required />
        <input className="input" name="location" placeholder="Abu Dhabi, UAE" />

        <input
          className="input"
          name="organizerName"
          placeholder="Organizer's full name"
          autoComplete="off"
          required
        />
        <input
          className="input"
          name="organizerEmail"
          type="email"
          placeholder="organizer@example.com"
          autoComplete="off"
          required
        />

        <textarea
          className="input sm:col-span-2 min-h-16 resize-y"
          name="description"
          maxLength={500}
          placeholder="One or two lines for the directory. Who plays, what standard, when."
          aria-label="Description"
        />

        <label className="block">
          <span className="label">Who can find it</span>
          <select className="input mt-1" name="visibility" defaultValue="private">
            <option value="private">Private — invite link only</option>
            <option value="public">Public — listed in the directory</option>
          </select>
        </label>

        <label className="block">
          <span className="label">How people join</span>
          <select className="input mt-1" name="joinPolicy" defaultValue="approval">
            <option value="approval">Approval — they ask, the organizer decides</option>
            <option value="open">Open — anyone with the link is in</option>
            <option value="closed">Closed — invitation only</option>
          </select>
        </label>

        <label className="block">
          <span className="label">Court fee</span>
          <input
            className="input mt-1"
            name="defaultFee"
            type="number"
            min={0}
            step={5}
            defaultValue={40}
          />
        </label>

        <label className="block">
          <span className="label">Currency</span>
          <input className="input mt-1" name="currency" defaultValue="AED" maxLength={4} />
        </label>

        <label className="block sm:col-span-2">
          <span className="label">Coordinator PIN</span>
          <input
            className="input mt-1"
            name="staffPin"
            inputMode="numeric"
            maxLength={8}
            placeholder="Leave blank and one is generated"
            autoComplete="off"
          />
          <span className="mt-1 block text-xs text-muted">
            Four to eight digits. It unlocks the court board mid-session without an email round
            trip — the organizer can change it later.
          </span>
        </label>

        <div className="sm:col-span-2">
          <SubmitButton className="btn btn-primary w-full" pendingLabel="Creating...">
            Create community
          </SubmitButton>
        </div>
      </form>

      {state && (
        <p className={`mt-3 text-sm ${state.ok ? "text-teal" : "text-amber"}`}>{state.message}</p>
      )}
    </section>
  );
}
