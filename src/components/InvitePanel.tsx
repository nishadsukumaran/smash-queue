"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { createInviteAction } from "@/server/community-actions";
import { COMMUNITY_IDLE, type CommunityFormState } from "@/server/community-types";

/**
 * Inviting people, two ways, because organizers invite two different ways.
 *
 * The shareable link is the WhatsApp case: one message, twenty people, no
 * addresses typed. It hands whoever follows it to the community's join
 * policy, since a code in a group chat is not the organizer vouching for
 * anyone in particular.
 *
 * A personal invitation is the organizer naming someone in advance, so
 * accepting it *is* the approval. That is the difference worth the extra
 * table, and the copy here says so out loud rather than leaving the organizer
 * to discover it.
 */
export function InvitePanel({
  groupId,
  inviteCode,
  origin,
}: {
  groupId: string;
  inviteCode: string;
  origin: string;
}) {
  const [state, action] = useActionState<CommunityFormState, FormData>(
    createInviteAction,
    COMMUNITY_IDLE,
  );
  const shareUrl = `${origin}/join/${inviteCode}`;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold">Share a link</h3>
        <p className="mt-1 text-xs text-muted">
          Anyone who opens it lands on your community and joins the way your join policy says —
          straight in, or waiting for you. Rotate it if it ends up somewhere it shouldn&apos;t.
        </p>
        <Copyable value={shareUrl} className="mt-2" />
        <p className="mt-2 text-xs text-muted">
          Or have them type the code <span className="font-mono text-chalk">{inviteCode}</span> at{" "}
          <span className="font-mono">{origin.replace(/^https?:\/\//, "")}/communities</span>.
        </p>
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-bold">Invite one person</h3>
        <p className="mt-1 text-xs text-muted">
          They skip the queue — you have already said yes by inviting them. Leave the email blank
          to just get a link you can send yourself.
        </p>

        <form action={action} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input type="hidden" name="groupId" value={groupId} />
          <input className="input" name="name" placeholder="Their name (optional)" maxLength={60} />
          <input
            className="input"
            name="email"
            type="email"
            placeholder="them@example.com (optional)"
            autoComplete="off"
          />
          <select className="input !w-auto" name="role" defaultValue="player" aria-label="Join as">
            <option value="player">Player</option>
            <option value="coordinator">Coordinator</option>
            <option value="organizer">Organizer</option>
          </select>
          <SubmitButton className="btn btn-primary" pendingLabel="Making...">
            Invite
          </SubmitButton>
        </form>

        {state && (
          <div className="mt-3">
            <p className={`text-sm ${state.ok ? "text-teal" : "text-amber"}`}>{state.message}</p>
            {state.ok && state.url && <Copyable value={state.url} className="mt-2" />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A link and a copy button.
 *
 * Selecting a long URL on a phone is genuinely hard, and every one of these
 * is going to be pasted into WhatsApp. Falls back to a plain selectable field
 * where the clipboard API is unavailable, which is most in-app browsers.
 */
function Copyable({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="input min-w-0 flex-1 font-mono text-xs"
        aria-label="Invite link"
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            // No clipboard permission. The field is selected and selectable,
            // which is the manual version of the same thing.
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
