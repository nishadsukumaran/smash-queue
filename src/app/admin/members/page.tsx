import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { getGroup, listJoinRequests, listRoster } from "@/server/queries";
import {
  addMemberAction, decideJoinAction, memberActiveAction, memberRoleAction,
  setJoinPolicyAction, updateGroupAction,
} from "@/server/form-actions";
import { joinPolicyOf } from "@/lib/join-policy";
import { prettyDateTime } from "@/lib/format";
import { ratingBand } from "@/lib/fairness";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const group = await getGroup();
  if (!group) return null;
  const [members, requests] = await Promise.all([
    listRoster(group.id),
    listJoinRequests(group.id),
  ]);

  const policy = joinPolicyOf(group.settings);
  const policies = [
    { key: "open" as const, title: "Open", blurb: "Anyone with the link adds themselves and is in straight away." },
    { key: "approval" as const, title: "Approval", blurb: "They ask, you decide. Requests appear here." },
    { key: "closed" as const, title: "Closed", blurb: "Only you add members. Nobody can ask." },
  ];

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="label">Group</h2>
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
            <span className="label">Staff PIN</span>
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
        <p className="mt-2 text-xs text-muted">
          Changing the PIN signs nobody out. Coordinators who already unlocked this phone stay
          unlocked until they lock it.
        </p>
      </section>

      {requests.length > 0 && (
        <section className="card border-shuttle/40 p-4">
          <h2 className="label text-shuttle">
            Waiting to join ({requests.length})
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {requests.map(({ membership, user }) => (
              <li key={membership.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={user.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-xs text-muted">
                    {membership.requestedAt ? prettyDateTime(membership.requestedAt) : "just now"}
                    {user.phone ? ` · ${user.phone}` : ""}
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
                  policy === o.key
                    ? "border-shuttle bg-shuttle/10"
                    : "border-line hover:border-teal"
                }`}
              >
                <span
                  className={`text-sm font-bold ${policy === o.key ? "text-shuttle" : "text-chalk"}`}
                >
                  {o.title}
                </span>
                <span className="mt-1 block text-xs text-muted">{o.blurb}</span>
              </button>
            </form>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Duplicate names are refused whichever you pick, so nobody ends up with two records and
          half their history on each.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="label">Add a member</h2>
        <p className="mt-1 text-xs text-muted">
          Names usually come straight out of the WhatsApp group. Rating is optional and settles
          itself once scores start going in.
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
        <div className="mt-2 divide-y divide-line/60">
          {members.map(({ user, membership }) => {
            const band = ratingBand(user.rating);
            return (
              <div key={membership.id} className="flex flex-wrap items-center gap-2 py-2">
                <Avatar name={user.name} size={32} dim={membership.status !== "active"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-[.68rem]" style={{ color: band.color }}>
                    {band.label} &middot; {Math.round(user.rating)} &middot; {user.ratingGames} rated games
                  </p>
                </div>
                <form action={memberRoleAction}>
                  <input type="hidden" name="membershipId" value={membership.id} />
                  <select
                    name="role"
                    defaultValue={membership.role}
                    className="input !w-auto !py-1 text-xs"
                  >
                    <option value="player">Player</option>
                    <option value="coordinator">Coordinator</option>
                    <option value="organizer">Organizer</option>
                  </select>
                  <SubmitButton className="btn btn-ghost btn-sm ml-1">Save</SubmitButton>
                </form>
                <form action={memberActiveAction}>
                  <input type="hidden" name="membershipId" value={membership.id} />
                  <input type="hidden" name="active" value={membership.status === "active" ? "0" : "1"} />
                  <SubmitButton className="btn btn-ghost btn-sm">
                    {membership.status === "active" ? "Deactivate" : "Reactivate"}
                  </SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
