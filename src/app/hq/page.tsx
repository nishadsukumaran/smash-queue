import { SubmitButton } from "@/components/SubmitButton";
import { listCommunities, pendingCommunityRequests } from "@/server/queries";
import {
  decideCommunityRequestAction, startCommunityAction, suspendCommunityAction,
} from "@/server/community-actions";
import { prettyDate, prettyDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The platform console, and everything the platform is allowed to do.
 *
 * Approve or decline requests for new communities. See totals. Suspend a
 * community being used for something it shouldn't be. That's the list.
 * There is no link from here into any community, no roster, no organizer
 * names — the promise every owner accepts is that nobody outside their
 * community can see inside it, and this page is where that is easiest to
 * break by accident.
 */
export default async function PlatformHome({
  searchParams,
}: {
  searchParams: Promise<{ started?: string; owner?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const [communities, requests] = await Promise.all([
    listCommunities(),
    pendingCommunityRequests(),
  ]);

  const live = communities.filter((c) => !c.group.archivedAt && !c.group.deletedAt);
  const suspended = communities.filter((c) => c.group.archivedAt && !c.group.deletedAt);
  const totals = live.reduce(
    (acc, c) => ({ members: acc.members + c.members, sessions: acc.sessions + c.sessions }),
    { members: 0, sessions: 0 },
  );

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap gap-6">
          <Stat label="Communities" value={live.length} />
          <Stat label="Memberships" value={totals.members} />
          <Stat label="Sessions run" value={totals.sessions} />
          <Stat label="Waiting for you" value={requests.length} tone={requests.length ? "amber" : undefined} />
        </div>
      </section>

      <section id="start" className="card p-4">
        <h2 className="label">Start a community for someone</h2>
        <p className="mt-1 text-xs text-muted">
          For a group lead who asked you directly. They become its only owner and see the
          ownership notice when they next open the app; you get no access inside it. They need an
          account first; their player number is on their profile. Use your own number to start
          one you&apos;ll run yourself.
        </p>
        {sp.started && (
          <p className="mt-3 text-sm text-teal">
            {sp.started} is set up{sp.owner ? ` and owned by ${sp.owner}` : ""}.
          </p>
        )}
        {sp.error && <p className="mt-3 text-sm text-rose">{sp.error}</p>}
        <form action={startCommunityAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className="input" name="name" required minLength={3} maxLength={60} placeholder="Community name" aria-label="Community name" />
          <input className="input" name="location" maxLength={80} placeholder="Area, e.g. Dubai Marina" aria-label="Location" />
          <input
            className="input font-mono"
            name="ownerPlayerNo"
            inputMode="numeric"
            required
            placeholder="Owner's player number, e.g. 1047"
            aria-label="Owner's player number"
          />
          <input className="input" name="description" maxLength={500} placeholder="One line about them (optional)" aria-label="Description" />
          <div className="sm:col-span-2">
            <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Creating...">
              Create community
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="label">Requests to start a community ({requests.length})</h2>
        {requests.length === 0 && (
          <p className="card p-4 text-sm text-muted">Nothing waiting.</p>
        )}
        {requests.map(({ request, requester }) => (
          <article key={request.id} className="card p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold">{request.name}</h3>
                <p className="mt-1 text-xs text-muted">
                  {request.location ?? "No location given"} &middot; asked{" "}
                  {prettyDateTime(request.createdAt)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  By {requester.name} (#{requester.playerNo}){requester.email ? ` · ${requester.email}` : ""}
                </p>
                {request.description && <p className="mt-2 text-sm">{request.description}</p>}
                {request.details && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{request.details}</p>
                )}
              </div>
            </div>
            <form action={decideCommunityRequestAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="requestId" value={request.id} />
              <input
                className="input min-w-0 flex-1"
                name="note"
                maxLength={300}
                placeholder="A note back to them (optional)"
                aria-label="Note to the requester"
              />
              <SubmitButton className="btn btn-primary btn-sm" name="decision" value="approve">
                Approve
              </SubmitButton>
              <SubmitButton className="btn btn-ghost btn-sm" name="decision" value="decline">
                Decline
              </SubmitButton>
            </form>
          </article>
        ))}
        <p className="text-xs text-muted">
          Approving creates the community with the requester as its owner. From then on it is
          theirs — this console has no way into it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="label">Communities ({live.length})</h2>
        <div className="card divide-y divide-line">
          {live.length === 0 && <p className="p-4 text-sm text-muted">None yet.</p>}
          {live.map((c) => (
            <Row key={c.group.id} card={c} />
          ))}
        </div>
      </section>

      {suspended.length > 0 && (
        <section className="space-y-2">
          <h2 className="label">Suspended ({suspended.length})</h2>
          <div className="card divide-y divide-line">
            {suspended.map((c) => (
              <Row key={c.group.id} card={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`text-2xl font-extrabold tracking-tight ${tone === "amber" ? "text-amber" : ""}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Row({ card }: { card: Awaited<ReturnType<typeof listCommunities>>[number] }) {
  const { group, members, sessions } = card;
  const suspended = Boolean(group.archivedAt);
  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {group.name}
          <span className={`chip ml-2 ${group.visibility === "public" ? "chip-teal" : ""}`}>
            {group.visibility === "public" ? "Public" : "Private"}
          </span>
        </p>
        <p className="text-xs text-muted">
          {group.location ?? "—"} &middot; {members} members &middot; {sessions} sessions &middot;
          since {prettyDate(group.createdAt.toISOString().slice(0, 10))}
        </p>
      </div>
      <form action={suspendCommunityAction}>
        <input type="hidden" name="groupId" value={group.id} />
        <input type="hidden" name="suspended" value={suspended ? "0" : "1"} />
        <SubmitButton className="btn btn-ghost btn-sm">{suspended ? "Restore" : "Suspend"}</SubmitButton>
      </form>
    </div>
  );
}
