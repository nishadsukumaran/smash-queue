import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, users } from "@/db/schema";
import { JoinCommunityForm } from "@/components/JoinCommunityForm";
import { canStaff, currentAccount } from "@/lib/auth";
import { currentUserId, isStaffFor } from "@/lib/identity";
import { isMemberOf } from "@/lib/tenant";
import { joinPolicyOf } from "@/lib/join-policy";

/**
 * Sessions are for members.
 *
 * Somebody holding a session link who is not in its community sees what the
 * night is — the header above this already says when and where — and a way
 * in, but not who is booked, who is on court, or the scores. Staff on the PIN
 * pass, because a coordinator running the board on the club tablet is not
 * necessarily a member on that device.
 *
 * Check-in deliberately does not use this gate. The QR on the wall is how new
 * people arrive, and it has its own join-per-policy form.
 */
export async function MemberGate({
  groupId,
  code,
  children,
}: {
  groupId: string;
  code: string;
  children: React.ReactNode;
}) {
  const account = await currentAccount();
  if (canStaff(account, groupId)) return <>{children}</>;
  if (await isStaffFor(groupId)) return <>{children}</>;
  if (await isMemberOf(groupId, account)) return <>{children}</>;

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group) return null;

  const uid = await currentUserId();
  const me = uid ? (await db.select().from(users).where(eq(users.id, uid)))[0] : null;
  const policy = joinPolicyOf(group.settings);

  return (
    <section className="card p-4">
      <p className="label">Members only</p>
      <h2 className="mt-1 text-lg font-bold">This session belongs to {group.name}</h2>
      <p className="mb-3 mt-1 text-sm text-muted">
        {policy === "closed"
          ? "Join the community to book and see who's playing. It adds members by invitation — ask the organizer for a link."
          : policy === "approval"
            ? "Join the community to book and see who's playing. The organizer lets new players in by hand."
            : "Join the community to book and see who's playing. One tap."}
      </p>
      <JoinCommunityForm groupId={group.id} policy={policy} knownAs={me?.name ?? null} />
      <p className="mt-4 text-xs text-muted">
        Already at the venue?{" "}
        <Link href={`/s/${code}/checkin`} className="text-teal hover:underline">
          Check in here
        </Link>{" "}
        &middot;{" "}
        <Link href={`/c/${group.slug}`} className="text-teal hover:underline">
          About {group.name}
        </Link>
      </p>
    </section>
  );
}

/** The same test the gate applies, for pages that return early. */
export async function canSeeSession(groupId: string) {
  const account = await currentAccount();
  return (
    canStaff(account, groupId) || (await isStaffFor(groupId)) || (await isMemberOf(groupId, account))
  );
}
