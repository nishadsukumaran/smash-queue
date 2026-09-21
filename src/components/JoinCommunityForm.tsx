"use client";

import { useActionState } from "react";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { identityAction } from "@/server/form-actions";
import { joinCommunityAction, joinWithCodeAction } from "@/server/community-actions";
import { JOIN_IDLE, type JoinFormState } from "@/server/community-types";
import type { JoinPolicy } from "@/db/schema";

/**
 * Knocking on a community's door.
 *
 * One component for both doors — a known community from the directory, and a
 * code somebody was handed — because the difference between them is one
 * hidden field and the wording. Two components would be two places for the
 * approval copy to drift out of step with what the server actually does.
 *
 * The name field appears only when this phone has no identity yet. Somebody
 * who already plays somewhere should not have to retype their name to join a
 * second community, and asking would quietly create a second record carrying
 * none of their games.
 */
export function JoinCommunityForm({
  groupId,
  code,
  policy,
  knownAs,
  label,
}: {
  groupId?: string;
  code?: string;
  policy: JoinPolicy;
  /** The name already on this phone, if there is one. */
  knownAs?: string | null;
  label?: string;
}) {
  const [state, action] = useActionState<JoinFormState, FormData>(
    code ? joinWithCodeAction : joinCommunityAction,
    JOIN_IDLE,
  );

  const needsApproval = policy === "approval";

  if (state?.ok && state.status === "waiting") {
    return (
      <div className="rounded-xl border border-teal/40 bg-court p-4">
        <p className="label text-teal">Request sent</p>
        <p className="mt-1 text-sm">
          The organizer will let you in. Nothing more to do — this phone already knows who you
          are, so you won&apos;t type your name again.
        </p>
      </div>
    );
  }

  if (policy === "closed") {
    return (
      <p className="text-sm text-muted">
        This community adds members by invitation. Ask whoever runs it for a link.
      </p>
    );
  }

  return (
    <div>
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto]">
        {groupId && <input type="hidden" name="groupId" value={groupId} />}
        {code && <input type="hidden" name="code" value={code} />}

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
            required
          />
        )}

        <SubmitButton
          className="btn btn-primary"
          pendingLabel={needsApproval ? "Sending..." : "Joining..."}
        >
          {label ?? (needsApproval ? "Ask to join" : "Join")}
        </SubmitButton>

        {needsApproval && (
          <input
            className="input sm:col-span-2"
            name="note"
            maxLength={300}
            placeholder="Anything that helps them place you (optional)"
            aria-label="A note for the organizer"
          />
        )}
      </form>

      {state && !state.ok && state.duplicate && (
        <div className="mt-3 rounded-xl border border-line bg-court p-3">
          <p className="text-sm">
            <span className="font-semibold">{state.duplicate.name}</span> is already on this
            community&apos;s list. Is that you?
          </p>
          <form action={identityAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={state.duplicate.id} />
            <input type="hidden" name="next" value="/" />
            <SubmitButton className="btn btn-teal btn-sm">
              <Avatar name={state.duplicate.name} size={20} />
              Yes, that&apos;s me
            </SubmitButton>
            <span className="text-xs text-muted">
              If not, add a surname so the two of you don&apos;t get mixed up.
            </span>
          </form>
        </div>
      )}

      {state && !state.ok && !state.duplicate && (
        <p className="mt-2 text-sm text-amber">{state.message}</p>
      )}
    </div>
  );
}

/** The "I was given a code" box, for somebody who has no link to click. */
export function JoinCodeForm() {
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
      <p className="mt-1 text-xs text-muted">
        Eight characters from whoever runs the community.
      </p>
      <form action={action} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          className="input font-mono uppercase tracking-[.2em]"
          name="code"
          placeholder="XXXXXXXX"
          maxLength={12}
          autoComplete="off"
          aria-label="Invite code"
          required
        />
        <input
          className="input"
          name="name"
          placeholder="Your name"
          autoComplete="name"
          maxLength={40}
        />
        <SubmitButton className="btn btn-primary" pendingLabel="Checking...">
          Join
        </SubmitButton>
      </form>
      {state && !state.ok && <p className="mt-2 text-sm text-amber">{state.message}</p>}
    </section>
  );
}
