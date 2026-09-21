import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { JoinCodeForm } from "@/components/JoinCommunityForm";
import { listPublicCommunities } from "@/server/queries";
import { switchCommunityAction } from "@/server/community-actions";
import { myCommunities } from "@/lib/tenant";
import { currentAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Finding a community.
 *
 * The directory is for Smash Queue members, not the open web: an owner who
 * makes their community public is choosing to be findable by other players,
 * not by search engines and scrapers. Strangers get a front door that explains
 * what this is and how to get in.
 *
 * Even for members, a listing shows only what helps someone decide whether to
 * knock — name, where, how many. Who plays, what they pay and how they rank
 * stay behind the door.
 */
export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const account = await currentAccount();
  const signedIn = Boolean(account?.onboarded);

  if (!signedIn) return <FrontDoor unknownCode={code === "unknown"} />;

  const [listed, mine] = await Promise.all([listPublicCommunities(), myCommunities(account)]);
  const mineIds = new Set(mine.map((m) => m.group.id));

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="label">Communities</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Find your court</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          A community is one badminton crowd — their venues, their sessions, their queue. Join one
          to book its games. Organizers can also invite you by your number,{" "}
          <span className="font-mono text-chalk">#{account!.playerNo}</span>.
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
                  {role !== "player" ? ` · ${role}` : ""}
                </p>
              </div>
              <SubmitButton className="btn btn-ghost btn-sm">Open</SubmitButton>
            </form>
          ))}
        </section>
      )}

      {code === "unknown" && <UnknownCode />}

      <JoinCodeForm signedIn />

      <section className="space-y-2">
        <h2 className="label">Open to new players</h2>
        {listed.length === 0 && (
          <p className="card p-4 text-sm text-muted">
            No community has listed itself publicly yet. A link or a code from an organizer still
            works.
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

      <section className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Run your own?</p>
          <p className="text-xs text-muted">Ask for a community and you&apos;ll be its owner.</p>
        </div>
        <Link href="/communities/new" className="btn btn-ghost btn-sm">
          Start a community
        </Link>
      </section>
    </div>
  );
}

function UnknownCode() {
  return (
    <p className="card border-amber/40 p-4 text-sm text-amber">
      That invite link didn&apos;t match any community. It may have been replaced — ask for the
      current one, or type the code below.
    </p>
  );
}

function FrontDoor({ unknownCode }: { unknownCode: boolean }) {
  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="label">Smash Queue</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Your badminton, in one place</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Book sessions, check in, get a fair spot in the court queue, and keep your record across
          every community you play in. Free, and no password — just your email.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/signin?next=/communities" className="btn btn-primary">
            Sign in or create an account
          </Link>
          <Link href="/guide" className="btn btn-ghost">
            How it works
          </Link>
        </div>
      </section>
      {unknownCode && <UnknownCode />}
      <JoinCodeForm signedIn={false} />
    </div>
  );
}
