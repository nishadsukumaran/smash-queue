import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { JoinCommunityForm } from "@/components/JoinCommunityForm";
import { communitySummary, getGroupBySlug, listOrganizers } from "@/server/queries";
import { switchCommunityAction } from "@/server/community-actions";
import { joinPolicyOf } from "@/lib/join-policy";
import { isMemberOf } from "@/lib/tenant";
import { currentUserId } from "@/lib/identity";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * A community's public face.
 *
 * Reachable by anyone who has the address, whether the community is listed in
 * the directory or not — the slug is not a secret, and a private community
 * being unlisted is about not being browsed, not about being unreachable by
 * someone holding a link a member sent them.
 *
 * What it shows is the same either way: the name, roughly how big and how
 * busy it is, and a way in. Sessions, the roster and the money stay behind
 * membership.
 */
export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group || group.archivedAt) notFound();

  const [summary, staff, member, uid] = await Promise.all([
    communitySummary(group.id),
    listOrganizers(group.id),
    isMemberOf(group.id),
    currentUserId(),
  ]);

  const me = uid ? (await db.select().from(users).where(eq(users.id, uid)))[0] : null;
  const policy = joinPolicyOf(group.settings);
  const organizers = staff.filter((s) => s.membership.role === "organizer");

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="label">Community</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{group.name}</h1>
        {group.location && <p className="mt-1 text-sm text-muted">{group.location}</p>}
        {group.description && <p className="mt-3 max-w-lg text-sm">{group.description}</p>}

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="chip">{summary.members} members</span>
          {summary.upcoming > 0 && (
            <span className="chip chip-teal">{summary.upcoming} sessions coming up</span>
          )}
          {summary.venues.map((v) => (
            <span key={v} className="chip">
              {v}
            </span>
          ))}
          <span className="chip">{group.visibility === "public" ? "Open to new players" : "By invitation"}</span>
        </div>
      </section>

      <section className="card p-4">
        {member ? (
          <form action={switchCommunityAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="groupId" value={group.id} />
            <input type="hidden" name="next" value="/" />
            <p className="min-w-0 flex-1 text-sm">
              You&apos;re a member here. Open it to see what&apos;s on.
            </p>
            <SubmitButton className="btn btn-primary btn-sm">Open</SubmitButton>
          </form>
        ) : (
          <>
            <h2 className="label">
              {policy === "approval" ? "Ask to join" : policy === "open" ? "Join" : "By invitation"}
            </h2>
            <p className="mb-3 mt-1 text-xs text-muted">
              {policy === "approval"
                ? "The organizer checks new players in by hand. Leave your name and they will let you in."
                : policy === "open"
                  ? "One tap and you're on the list. No password, no signup."
                  : "This one adds members by invitation only."}
            </p>
            <JoinCommunityForm groupId={group.id} policy={policy} knownAs={me?.name ?? null} />
          </>
        )}
      </section>

      {organizers.length > 0 && (
        <p className="text-center text-xs text-muted">
          Run by {organizers.map((o) => o.user.name).join(", ")}.
        </p>
      )}

      <p className="text-center text-xs text-muted">
        <Link href="/communities" className="text-teal hover:underline">
          Other communities
        </Link>
      </p>
    </div>
  );
}
