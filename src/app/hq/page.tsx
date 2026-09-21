import Link from "next/link";
import { CreateCommunityForm } from "@/components/CreateCommunityForm";
import { SubmitButton } from "@/components/SubmitButton";
import { listCommunities } from "@/server/queries";
import { archiveCommunityAction, switchCommunityAction } from "@/server/community-actions";
import { prettyDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlatformHome() {
  const communities = await listCommunities();
  const live = communities.filter((c) => !c.group.archivedAt);
  const archived = communities.filter((c) => c.group.archivedAt);

  const totals = live.reduce(
    (acc, c) => ({
      members: acc.members + c.members,
      sessions: acc.sessions + c.sessions,
      pending: acc.pending + c.pending,
    }),
    { members: 0, sessions: 0, pending: 0 },
  );

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap gap-4">
          <Stat label="Communities" value={live.length} />
          <Stat label="Members" value={totals.members} />
          <Stat label="Sessions run" value={totals.sessions} />
          <Stat label="Waiting to join" value={totals.pending} tone={totals.pending ? "amber" : undefined} />
        </div>
      </section>

      <CreateCommunityForm />

      <section className="space-y-2">
        <h2 className="label">Live ({live.length})</h2>
        {live.length === 0 && (
          <p className="card p-4 text-sm text-muted">
            None yet. The form above makes the first one.
          </p>
        )}
        {live.map((c) => (
          <Row key={c.group.id} card={c} />
        ))}
      </section>

      {archived.length > 0 && (
        <details className="card p-3">
          <summary className="cursor-pointer text-xs text-muted">
            {archived.length} archived
          </summary>
          <div className="mt-3 space-y-2">
            {archived.map((c) => (
              <Row key={c.group.id} card={c} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p
        className={`text-2xl font-extrabold tracking-tight ${tone === "amber" ? "text-amber" : ""}`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Row({ card }: { card: Awaited<ReturnType<typeof listCommunities>>[number] }) {
  const { group, members, pending, sessions, organizers } = card;
  const archived = Boolean(group.archivedAt);

  return (
    <article className={`card p-4 ${archived ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{group.name}</h3>
            <span className={`chip ${group.visibility === "public" ? "chip-teal" : ""}`}>
              {group.visibility === "public" ? "Public" : "Private"}
            </span>
            {archived && <span className="chip chip-amber">Archived</span>}
          </div>
          <p className="mt-1 text-xs text-muted">
            /c/{group.slug}
            {group.location ? ` · ${group.location}` : ""} · since {prettyDate(group.createdAt.toISOString().slice(0, 10))}
          </p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="chip">{members} members</span>
            <span className="chip">{sessions} sessions</span>
            {pending > 0 && <span className="chip chip-amber">{pending} waiting</span>}
          </p>
          <p className="mt-2 text-xs text-muted">
            {organizers.length === 0 ? (
              <span className="text-amber">Nobody is running this one.</span>
            ) : (
              <>Run by {organizers.map((o) => o.name).join(", ")}</>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/hq/c/${group.id}`} className="btn btn-ghost btn-sm">
            Manage
          </Link>
          {/* Opens the community in the normal app, as its organizer sees it. */}
          <form action={switchCommunityAction}>
            <input type="hidden" name="groupId" value={group.id} />
            <input type="hidden" name="next" value="/admin" />
            <SubmitButton className="btn btn-ghost btn-sm">Open</SubmitButton>
          </form>
          <form action={archiveCommunityAction}>
            <input type="hidden" name="groupId" value={group.id} />
            <input type="hidden" name="archived" value={archived ? "0" : "1"} />
            <SubmitButton className="btn btn-ghost btn-sm">
              {archived ? "Restore" : "Archive"}
            </SubmitButton>
          </form>
        </div>
      </div>
    </article>
  );
}
