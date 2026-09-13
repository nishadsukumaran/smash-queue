"use client";

import { useActionState } from "react";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { identityAction, registerPlayerAction } from "@/server/form-actions";
import type { RegisterState } from "@/server/register-types";

/**
 * Self-registration for somebody who opened the WhatsApp link and isn't on the
 * roster yet. Deliberately two fields: anything longer and people give up in a
 * car park.
 */
export function NewPlayerForm({
  groupId,
  next,
  compact = false,
}: {
  groupId: string;
  next: string;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState<RegisterState, FormData>(
    registerPlayerAction,
    null,
  );

  return (
    <div className={compact ? "" : "card p-4"}>
      {!compact && (
        <>
          <h2 className="label">New here?</h2>
          <p className="mt-1 text-sm text-muted">
            Add yourself to the group. Takes one tap and you&apos;re on the list for good.
          </p>
        </>
      )}

      <form action={formAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="next" value={next} />
        <input
          id="new-player-name"
          className="input"
          name="name"
          placeholder="Your name"
          autoComplete="name"
          maxLength={40}
          required
        />
        <SubmitButton className="btn btn-primary" pendingLabel="Adding...">
          Add me
        </SubmitButton>

        <details className="sm:col-span-2">
          <summary className="cursor-pointer text-xs text-muted">Add a phone number too</summary>
          <input
            id="new-player-phone"
            className="input mt-2"
            name="phone"
            type="tel"
            placeholder="+971 50 000 0000"
            autoComplete="tel"
          />
          <p className="mt-1.5 text-xs text-muted">
            Optional, and only the organizer sees it. Worth adding when two of you share a
            first name.
          </p>
        </details>
      </form>

      {state?.duplicate && (
        <div className="mt-3 rounded-xl border border-line bg-court p-3">
          <p className="text-sm">
            <span className="font-semibold">{state.duplicate.name}</span> is already on the
            list. Is that you?
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <form action={identityAction} className="contents">
              <input type="hidden" name="userId" value={state.duplicate.id} />
              <input type="hidden" name="next" value={next} />
              <SubmitButton className="btn btn-teal btn-sm">
                <Avatar name={state.duplicate.name} size={20} />
                Yes, that&apos;s me
              </SubmitButton>
            </form>
            <span className="text-xs text-muted">
              If not, add a surname or initial so the two of you don&apos;t get mixed up.
            </span>
          </div>
        </div>
      )}

      {state && !state.ok && !state.duplicate && state.message && (
        <p className="mt-3 text-sm text-amber">{state.message}</p>
      )}
    </div>
  );
}
