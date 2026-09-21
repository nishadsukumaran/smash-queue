import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { JoinCodeForm } from "@/components/JoinCommunityForm";
import { listPublicCommunities } from "@/server/queries";
import { switchCommunityAction } from "@/server/community-actions";
import { myCommunities } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * The front door for somebody who belongs nowhere yet.
 *
 * Deliberately thin on detail. A public community shows its name, where it
 * plays and how many members it has — enough to decide whether to knock, and
 * nothing that would make the membership gate decorative. Who is playing
 * tonight, what they pay and how they rank are all behind the door.
 */
export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const [listed, mine] = await Promise.all([listPublicCommunities(), myCommunities()]);
  const mineIds = new Set(mine.map((m) => m.group.id));

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="label">Communities</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Find your court</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          A community is one badminton crowd — their venues, their sessions, their queue. Join one
          to see when it plays.
        </p>
      </section>

      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="label">Yours</h2>
          {mine.map(({ group, role }) => (
            <form
              key={group.id}
              action={switchCommunityAction}
              className="card flex flex-wrap items-center gap-3 p-4"
            >
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="next" value="/" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{group.name}</p>
                <p className="text-xs text-muted">
                  {group.location ?? "—"}
                  {role !== "player" ? ` · you are an ${role}` : ""}
                </p>
              </div>
              <SubmitButton className="btn btn-ghost btn-sm">Open</SubmitButton>
            </form>
          ))}
        </section>
      )}

      {code === "unknown" && (
        <p className="card border-amber/40 p-4 text-sm text-amber">
          That invite link didn&apos;t match any community. It may have been replaced — ask for
          the current one, or type the code below.
        </p>
      )}

      <JoinCodeForm />

      <section className="space-y-2">
        <h2 className="label">Open to new players</h2>
        {listed.length === 0 && (
          <p className="card p-4 text-sm text-muted">
            No community has listed itself publicly yet. If you were given a link or a code, that
            still works.
          </p>
        )}
        {listed.map(({ group, members }) => (
          <Link key={group.id} href={`/c/${group.slug}`} className="card block p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold">{group.name}</h3>
              {mineIds.has(group.id) && <span className="chip chip-teal">You&apos;re in</span>}
              <span className="ml-auto chip">{members} members</span>
            </div>
            {group.location && <p className="mt-1 text-xs text-muted">{group.location}</p>}
            {group.description && (
              <p className="mt-2 line-clamp-2 text-sm text-muted">{group.description}</p>
            )}
          </Link>
        ))}
      </section>

      <p className="text-center text-xs text-muted">
        Running a group that isn&apos;t here?{" "}
        <Link href="/guide" className="text-teal hover:underline">
          See how it works
        </Link>
      </p>
    </div>
  );
}
