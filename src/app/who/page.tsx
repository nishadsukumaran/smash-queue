import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { NewPlayerForm } from "@/components/NewPlayerForm";
import { joinPolicyOf } from "@/lib/join-policy";
import { SubmitButton } from "@/components/SubmitButton";
import { getGroup, listMembers } from "@/server/queries";
import { identityAction } from "@/server/form-actions";
import { currentUserId } from "@/lib/identity";
import { ratingBand } from "@/lib/fairness";

export const dynamic = "force-dynamic";

export default async function WhoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const group = await getGroup();
  if (!group) return <p className="card p-4 text-muted">No group yet.</p>;

  const [members, userId] = await Promise.all([listMembers(group.id), currentUserId()]);
  const policy = joinPolicyOf(group.settings);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Who are you?</h1>
        <p className="mt-1 text-sm text-muted">
          Tap your name once. This phone remembers you after that. No password, no signup.
        </p>
      </div>

      {policy !== "closed" && (
        <NewPlayerForm
          groupId={group.id}
          next={next ?? "/"}
          needsApproval={policy === "approval"}
        />
      )}

      <div className="card divide-y divide-line">
        {members.map(({ user }) => {
          const band = ratingBand(user.rating);
          return (
            <form key={user.id} action={identityAction} className="flex items-center gap-3 p-3">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="next" value={next ?? "/"} />
              <Avatar name={user.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="text-xs" style={{ color: band.color }}>
                  {band.label} &middot; {Math.round(user.rating)}
                </p>
              </div>
              {userId === user.id ? (
                <span className="chip chip-live">That&apos;s you</span>
              ) : (
                <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="...">
                  Select
                </SubmitButton>
              )}
            </form>
          );
        })}
      </div>

      {group.settings?.allowSelfSignup === false && (
        <p className="text-center text-xs text-muted">
          Not on the list? The organizer adds members for this group &mdash; ask them, or see{" "}
          <Link href="/admin/members" className="text-teal underline">
            Members
          </Link>
          .
        </p>
      )}
    </div>
  );
}
