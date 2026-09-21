import Link from "next/link";
import { AcceptInviteForm } from "@/components/AcceptInviteForm";
import { SubmitButton } from "@/components/SubmitButton";
import { inspectInvite, switchCommunityAction } from "@/server/community-actions";
import { currentAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The other end of a personal invitation.
 *
 * The link is read here and spent only when the person presses Accept.
 * Redeeming on load would look tidier and would be wrong: mail clients and
 * link scanners fetch URLs in emails all the time, and a single-use
 * invitation burned by a scanner is one the recipient can never use.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await inspectInvite(token);

  if (!invite) {
    return (
      <div className="card mx-auto max-w-sm p-5">
        <p className="label">Invitation</p>
        <h1 className="mt-1 text-lg font-bold">This link doesn&apos;t work any more</h1>
        <p className="mt-2 text-sm text-muted">
          It has either been used, withdrawn, or gone past its two weeks. Ask whoever sent it for
          a fresh one — it takes them a few seconds.
        </p>
        <Link href="/communities" className="btn btn-ghost mt-4 w-full">
          Browse communities
        </Link>
      </div>
    );
  }

  const account = await currentAccount();

  if (invite.alreadyIn) {
    return (
      <div className="card mx-auto max-w-sm p-5">
        <p className="label">Invitation</p>
        <h1 className="mt-1 text-lg font-bold">You&apos;re already in {invite.groupName}</h1>
        <p className="mt-2 text-sm text-muted">Nothing to accept. Go and see what&apos;s on.</p>
        <form action={switchCommunityAction} className="mt-4">
          <input type="hidden" name="groupId" value={invite.groupId} />
          <input type="hidden" name="next" value="/" />
          <SubmitButton className="btn btn-primary w-full">Open {invite.groupName}</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-sm p-5">
      <p className="label">You&apos;re invited</p>
      <h1 className="mt-1 text-xl font-extrabold tracking-tight">{invite.groupName}</h1>
      <p className="mt-2 text-sm text-muted">
        {invite.role === "player"
          ? "Accept and you're on the list — no waiting for approval, because you were asked for by name."
          : `You've been invited to help run this one, as ${
              invite.role === "owner" ? "a co-owner" : invite.role === "organizer" ? "an organizer" : "a coordinator"
            }.`}
      </p>

      <div className="mt-4">
        {account?.onboarded ? (
          <>
            <p className="mb-3 text-sm text-muted">
              Joining as <span className="font-semibold text-chalk">{account.name}</span>{" "}
              <span className="font-mono">#{account.playerNo}</span>
            </p>
            <AcceptInviteForm token={invite.token} />
          </>
        ) : (
          <Link
            href={`/signin?next=${encodeURIComponent(`/i/${invite.token}`)}`}
            className="btn btn-primary w-full"
          >
            Sign in or create an account to accept
          </Link>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        <Link href={`/c/${invite.slug}`} className="text-teal hover:underline">
          What is {invite.groupName}?
        </Link>
      </p>
    </div>
  );
}
