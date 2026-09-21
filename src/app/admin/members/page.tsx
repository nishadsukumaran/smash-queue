import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { InvitePanel } from "@/components/InvitePanel";
import { DeleteCommunityForm } from "@/components/DeleteCommunityForm";
import { activeCommunity } from "@/lib/tenant";
import { canOwn, currentAccount } from "@/lib/auth";
import { requestOrigin } from "@/lib/origin";
import { joinPolicyOf } from "@/lib/join-policy";
import { prettyDateTime } from "@/lib/format";
import { ratingBand } from "@/lib/fairness";
import {
  listInvites, listJoinRequests, listRoster, pendingRoleRequests,
} from "@/server/queries";
import {
  addMemberAction, decideJoinAction, setJoinPolicyAction, updateGroupAction,
} from "@/server/form-actions";
import {
  changeRoleAction, communityProfileAction, decideRoleRequestAction, revokeInviteAction,
  rotateInviteCodeAction, setMembershipAction,
} from "@/server/community-actions";
import type { MemberRole } from "@/db/schema";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Owner",
  organizer: "Organizer",
  coordinator: "Coordinator",
  player: "Player",
};

/**
 * Running the roster.
 *
 * Organizers get the day-to-day: letting people in, inviting players, adding
 * roster entries. Owners additionally get the decisions that make the
 * community theirs — who runs it, who can find it, and whether it exists.
 * Those sections are not merely hidden from organizers; the actions behind
 * them refuse anyone who is not an owner.
 */
export default async function MembersPage() {
  const active = await activeCommunity();
  if (!active) return null;
  const group = active.group;
  const account = await currentAccount();
  const isOwner = canOwn(account, group.id);

  const [members, requests, invites, roleAsks, origin] = await Promise.all([
    listRoster(group.id),
    listJoinRequests(group.id),
    listInvites(group.id),
    isOwner ? pendingRoleRequests(group.id) : Promise.resolve([]),
    requestOrigin(),
  ]);
  const openInvites = invites.filter((i) => !i.revokedAt && i.expiresAt.getTime() > Date.now());
  const ownerCount = members.filter(
    (m) => m.membership.role === "owner" && m.membership.status === "active",
  ).length;

  const policy = joinPolicyOf(group.settings);
  const policies = [
    { key: "open" as const, title: "Open", blurb: "Anyone with the link joins straight away." },
    { key: "approval" as const, title: "Approval", blurb: "They ask, you decide. Requests appear here." },
    { key: "closed" as const, title: "Invitation only", blurb: "Nobody can ask. You invite people." },
  ];

  return (
    <div className="space-y-4">
      {requests.length > 0 && (
        <section className="card border-shuttle/40 p-4">
          <h2 className="label text-shuttle">Waiting to join ({requests.length})</h2>
          <ul className="mt-3 divide-y divide-line">
            {requests.map(({ membership, user }) => (
              <li key={membership.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={user.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {user.name} <span className="font-mono text-xs text-muted">#{user.playerNo}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {membership.requestedAt ? prettyDateTime(membership.requestedAt) : "just now"}
                  </p>
                  {membership.note && (
                    <p className="mt-1 text-xs text-chalk/80">&ldquo;{membership.note}&rdquo;</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <form action={decideJoinAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="membershipId" value={membership.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <SubmitButton className="btn btn-primary btn-sm">Let in</SubmitButton>
                  </form>
                  <form action={decideJoinAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="membershipId" value={membership.id} />
                    <input type="hidden" name="decision" value="decline" />
                    <SubmitButton className="btn btn-ghost btn-sm">Decline</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isOwner && roleAsks.length > 0 && (
        <section className="card border-teal/40 p-4">
          <h2 className="label text-teal">Asking to help run it ({roleAsks.length})</h2>
          <ul className="mt-3 divide-y divide-line">
            {roleAsks.map(({ request, user }) => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={user.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {user.name} wants to be {request.role === "organizer" ? "an organizer" : "a coordinator"}
                  </p>
                  <p className="text-xs text-muted">{prettyDateTime(request.createdAt)}</p>
                  {request.note && (
                    <p className="mt-1 text-xs text-chalk/80">&ldquo;{request.note}&rdquo;</p>
                  )}
                </div>
                <form action={decideRoleRequestAction} className="flex gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <SubmitButton className="btn btn-primary btn-sm" name="decision" value="approve">
                    Approve
                  </SubmitButton>
                  <SubmitButton className="btn btn-ghost btn-sm" name="decision" value="decline">
                    Decline
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <h2 className="label">Invite people</h2>
        <div className="mt-3">
          <InvitePanel
            groupId={group.id}
            inviteCode={group.inviteCode}
            origin={origin}
            isOwner={isOwner}
          />
        </div>
        <form action={rotateInviteCodeAction} className="mt-3">
          <input type="hidden" name="groupId" value={group.id} />
          <SubmitButton className="btn btn-ghost btn-sm">Replace the shareable code</SubmitButton>
        </form>

        {openInvites.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="label">Not accepted yet ({openInvites.length})</p>
            <ul className="mt-2 divide-y divide-line/60">
              {openInvites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {inv.userId
                        ? "A player, by number"
                        : (inv.name ?? inv.email ?? "Link without a name")}
                      {inv.role !== "player" && <span className="chip ml-2">{ROLE_LABEL[inv.role]}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {inv.email && inv.name ? `${inv.email} · ` : ""}sent {prettyDateTime(inv.createdAt)} ·
                      expires {prettyDateTime(inv.expiresAt)}
                    </p>
                  </div>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <SubmitButton className="btn btn-ghost btn-sm">Withdraw</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="label">How people join</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {policies.map((o) => (
            <form key={o.key} action={setJoinPolicyAction}>
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="policy" value={o.key} />
              <button
                type="submit"
                aria-pressed={policy === o.key}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  policy === o.key ? "border-shuttle bg-shuttle/10" : "border-line hover:border-teal"
                }`}
              >
                <span className={`text-sm font-bold ${policy === o.key ? "text-shuttle" : "text-chalk"}`}>
                  {o.title}
                </span>
                <span className="mt-1 block text-xs text-muted">{o.blurb}</span>
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label">Add someone without an account</h2>
        <p className="mt-1 text-xs text-muted">
          A roster entry for somebody who plays but isn&apos;t on Smash Queue. When they register on
          a phone they&apos;ve used as this name, their history comes with them.
        </p>
        <form action={addMemberAction} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="groupId" value={group.id} />
          <input className="input" name="name" placeholder="Full name" required />
          <input className="input" name="phone" placeholder="Phone (optional)" />
          <input className="input" name="rating" type="number" defaultValue={1200} min={600} max={2200} />
          <SubmitButton className="btn btn-primary">Add</SubmitButton>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="label">Members ({members.length})</h2>
        {!isOwner && (
          <p className="mt-1 text-xs text-muted">Only an owner can change who runs the community.</p>
        )}
        <div className="mt-2 divide-y divide-line/60">
          {members.map(({ user, membership }) => {
            const band = ratingBand(membership.rating);
            const senior = membership.role === "owner" || membership.role === "organizer";
            const lastOwner = membership.role === "owner" && ownerCount <= 1;
            const canRemove = !lastOwner && (senior ? isOwner : true);
            return (
              <div key={membership.id} className="flex flex-wrap items-center gap-2 py-2">
                <Avatar name={user.name} size={32} dim={membership.status !== "active"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {user.name} <span className="font-mono text-xs text-muted">#{user.playerNo}</span>
                  </p>
                  <p className="text-[.68rem]" style={{ color: band.color }}>
                    {band.label} &middot; {Math.round(membership.rating)} &middot; {membership.ratingGames} rated games
                  </p>
                </div>
                {isOwner && membership.status === "active" ? (
                  <form action={changeRoleAction} className="flex items-center gap-1">
                    <input type="hidden" name="membershipId" value={membership.id} />
                    <select
                      name="role"
                      defaultValue={membership.role}
                      className="input !w-auto !py-1 text-xs"
                      aria-label={`Role for ${user.name}`}
                      disabled={lastOwner}
                    >
                      <option value="player">Player</option>
                      <option value="coordinator">Coordinator</option>
                      <option value="organizer">Organizer</option>
                      <option value="owner">Co-owner</option>
                    </select>
                    {!lastOwner && <SubmitButton className="btn btn-ghost btn-sm">Save</SubmitButton>}
                  </form>
                ) : (
                  <span className="chip">{ROLE_LABEL[membership.role]}</span>
                )}
                {canRemove && (
                  <form action={setMembershipAction}>
                    <input type="hidden" name="membershipId" value={membership.id} />
                    <input type="hidden" name="active" value={membership.status === "active" ? "0" : "1"} />
                    <SubmitButton className="btn btn-ghost btn-sm">
                      {membership.status === "active" ? "Remove" : "Bring back"}
                    </SubmitButton>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label">Community</h2>
        <form action={updateGroupAction} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="groupId" value={group.id} />
          <label className="block sm:col-span-2">
            <span className="label">Name</span>
            <input className="input mt-1" name="name" defaultValue={group.name} required />
          </label>
          <label className="block">
            <span className="label">Default fee ({group.currency})</span>
            <input className="input mt-1" name="defaultFee" type="number" min={0} step={5} defaultValue={group.defaultFee} />
          </label>
          <label className="block">
            <span className="label">Coordinator PIN</span>
            <input className="input mt-1" name="staffPin" inputMode="numeric" placeholder="unchanged" maxLength={8} autoComplete="off" />
          </label>
          <label className="block sm:col-span-3">
            <span className="label">Location</span>
            <input className="input mt-1" name="location" defaultValue={group.location ?? ""} />
          </label>
          <div className="flex items-end">
            <SubmitButton className="btn btn-primary w-full">Save</SubmitButton>
          </div>
        </form>
      </section>

      {isOwner && (
        <section className="card p-4">
          <h2 className="label">Who can find it</h2>
          <form action={communityProfileAction} className="mt-3 space-y-3">
            <input type="hidden" name="groupId" value={group.id} />
            <select className="input" name="visibility" defaultValue={group.visibility}>
              <option value="private">Private — only people with your link, code or invitation</option>
              <option value="public">Public — any Smash Queue member can find it and ask to join</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="previewSchedule"
                value="1"
                defaultChecked={group.settings?.previewSchedule !== false}
                className="accent-shuttle"
              />
              When public, show when and where you play to people who haven&apos;t joined
            </label>
            <textarea
              className="input min-h-16 resize-y"
              name="description"
              maxLength={500}
              defaultValue={group.description ?? ""}
              placeholder="A line or two for newcomers: who plays, what standard, when."
              aria-label="Description"
            />
            <SubmitButton className="btn btn-primary btn-sm">Save</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-muted">
            Whatever you choose, only members see who&apos;s booked, the scores, the roster and the
            money.
          </p>
        </section>
      )}

      {isOwner && (
        <section className="card border-rose/30 p-4">
          <h2 className="label text-rose">Delete this community</h2>
          <p className="mt-1 text-xs text-muted">
            It disappears for every member at once. Any owner can bring it back for 30 days from
            their profile; after that it is erased for good — sessions, scores, payments, roster.
            Members keep their accounts. Nobody at Smash Queue can undo this for you.
          </p>
          <DeleteCommunityForm groupId={group.id} name={group.name} />
        </section>
      )}
    </div>
  );
}
