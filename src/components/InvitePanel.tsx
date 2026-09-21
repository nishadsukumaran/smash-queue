"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { createInviteAction } from "@/server/community-actions";
import { COMMUNITY_IDLE, type CommunityFormState } from "@/server/community-types";

/**
 * Inviting people, three ways, because people get invited three ways.
 *
 * - The shareable link: one message, twenty people. Follows the join policy,
 *   because a link in a chat is not the organizer vouching for anyone.
 * - By player number: someone who already has an account. It lands in their
 *   app and only they can accept.
 * - By email or as a bare link: someone who doesn't have one yet.
 *
 * The last two are the organizer naming someone in advance, so accepting skips
 * the queue. Inviting someone to help *run* the community is an owner's call,
 * so the role picker only appears for owners.
 */
export function InvitePanel({
  groupId,
  inviteCode,
  origin,
  isOwner,
}: {
  groupId: string;
  inviteCode: string;
  origin: string;
  isOwner: boolean;
}) {
  const [byNo, byNoAction] = useActionState<CommunityFormState, FormData>(
    createInviteAction,
    COMMUNITY_IDLE,
  );
  const [byEmail, byEmailAction] = useActionState<CommunityFormState, FormData>(
    createInviteAction,
    COMMUNITY_IDLE,
  );
  const shareUrl = `${origin}/join/${inviteCode}`;

  const RolePicker = () =>
    isOwner ? (
      <select className="input !w-auto" name="role" defaultValue="player" aria-label="Join as">
        <option value="player">Player</option>
        <option value="coordinator">Coordinator</option>
        <option value="organizer">Organizer</option>
        <option value="owner">Co-owner</option>
      </select>
    ) : (
      <input type="hidden" name="role" value="player" />
    );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold">Share a link</h3>
        <p className="mt-1 text-xs text-muted">
          Anyone who opens it and signs in joins the way your join policy says — straight in, or
          waiting for you. Replace it if it ends up somewhere it shouldn&apos;t.
        </p>
        <Copyable value={shareUrl} className="mt-2" />
        <p className="mt-2 text-xs text-muted">
          Or they type the code <span className="font-mono text-chalk">{inviteCode}</span> under
          Communities.
        </p>
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-bold">Invite a player by number</h3>
        <p className="mt-1 text-xs text-muted">
          Everyone with an account has a player number on their profile. The invitation waits in
          their app; they skip the queue because you asked for them.
        </p>
        <form action={byNoAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input type="hidden" name="groupId" value={groupId} />
          <input
            className="input font-mono"
            name="playerNo"
            inputMode="numeric"
            placeholder="e.g. 1047"
            maxLength={7}
            required
            aria-label="Player number"
          />
          <RolePicker />
          <SubmitButton className="btn btn-primary" pendingLabel="Sending...">
            Invite
          </SubmitButton>
        </form>
        {byNo && (
          <p className={`mt-2 text-sm ${byNo.ok ? "text-teal" : "text-amber"}`}>{byNo.message}</p>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-bold">Invite by email, or get a link</h3>
        <p className="mt-1 text-xs text-muted">
          For someone who isn&apos;t on Smash Queue yet. Leave the email blank to just get a link
          you can send yourself. Works once, for two weeks.
        </p>
        <form action={byEmailAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input type="hidden" name="groupId" value={groupId} />
          <input className="input" name="name" placeholder="Their name (optional)" maxLength={60} />
          <input
            className="input"
            name="email"
            type="email"
            placeholder="them@example.com (optional)"
            autoComplete="off"
          />
          <RolePicker />
          <SubmitButton className="btn btn-primary" pendingLabel="Making...">
            Invite
          </SubmitButton>
        </form>
        {byEmail && (
          <div className="mt-3">
            <p className={`text-sm ${byEmail.ok ? "text-teal" : "text-amber"}`}>{byEmail.message}</p>
            {byEmail.ok && byEmail.url && <Copyable value={byEmail.url} className="mt-2" />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A link and a copy button. Selecting a long URL on a phone is hard, and every
 * one of these is going to be pasted somewhere.
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
            // No clipboard permission: the field is selected, which is the
            // manual version of the same thing.
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
