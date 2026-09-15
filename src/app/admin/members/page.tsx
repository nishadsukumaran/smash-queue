import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { getGroup, listMembers } from "@/server/queries";
import {
  addMemberAction, memberActiveAction, memberRoleAction, selfSignupAction, updateGroupAction,
} from "@/server/form-actions";
import { ratingBand } from "@/lib/fairness";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const group = await getGroup();
  if (!group) return null;
  const members = await listMembers(group.id);

  const selfSignup = group.settings?.allowSelfSignup !== false;

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

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="label">Anyone with the link can join</h2>
            <p className="mt-1 text-xs text-muted">
              {selfSignup
                ? "A new player who opens the session link can add themselves to the group. Duplicate names are refused, so nobody ends up with two records."
                : "Self sign-up is off. Only you can add members, and a new player has to ask."}
            </p>
          </div>
          <form action={selfSignupAction}>
            <input type="hidden" name="groupId" value={group.id} />
            <input type="hidden" name="allow" value={selfSignup ? "0" : "1"} />
            <SubmitButton className={selfSignup ? "btn btn-ghost btn-sm" : "btn btn-teal btn-sm"}>
              {selfSignup ? "Turn off" : "Turn on"}
            </SubmitButton>
          </form>
        </div>
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
