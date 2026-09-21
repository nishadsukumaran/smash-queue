import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { AppointOrganizerForm } from "@/components/AppointOrganizerForm";
import { SubmitButton } from "@/components/SubmitButton";
import {
  archiveCommunityAction, communityProfileAction, rotateInviteCodeAction,
  stepDownOrganizerAction, switchCommunityAction,
} from "@/server/community-actions";
import { communitySummary, getGroup, listOrganizers } from "@/server/queries";
import { prettyDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * One community, from the platform's side of the table.
 *
 * Only the things the platform decides: who runs it, whether the world can
 * find it, and whether it is still going. Fees, venues, the roster and the
 * court PIN belong to its organizer and are deliberately absent — a console
 * that duplicates every organizer screen is two places to change one setting.
 */
export default async function ManageCommunity({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = await getGroup(groupId);
  if (!group) notFound();

  const [staff, summary] = await Promise.all([
    listOrganizers(groupId),
    communitySummary(groupId),
  ]);
  const organizers = staff.filter((s) => s.membership.role === "organizer");

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold">{group.name}</h2>
            <p className="mt-1 text-xs text-muted">
              /c/{group.slug}
              {group.location ? ` · ${group.location}` : ""}
            </p>
            <p className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="chip">{summary.members} members</span>
              <span className="chip">{summary.upcoming} sessions coming up</span>
              {summary.venues.map((v) => (
                <span key={v} className="chip">
                  {v}
                </span>
              ))}
            </p>
          </div>
          <form action={switchCommunityAction} className="shrink-0">
            <input type="hidden" name="groupId" value={group.id} />
            <input type="hidden" name="next" value="/admin" />
            <SubmitButton className="btn btn-ghost btn-sm">Open as organizer</SubmitButton>
          </form>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label">Who runs it ({organizers.length})</h2>
        {organizers.length === 0 && (
          <p className="mt-2 text-sm text-amber">
            Nobody can reach this community&apos;s organizer screens. Appoint someone below.
          </p>
        )}
        <div className="mt-2 divide-y divide-line/60">
          {staff.map(({ membership, user }) => (
            <div key={membership.id} className="flex flex-wrap items-center gap-2 py-2">
              <Avatar name={user.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted">
                  {user.email ?? "no sign-in address"} &middot; joined{" "}
                  {prettyDateTime(membership.joinedAt)}
                </p>
              </div>
              <span className="chip">{membership.role}</span>
              <form action={stepDownOrganizerAction}>
                <input type="hidden" name="groupId" value={group.id} />
                <input type="hidden" name="membershipId" value={membership.id} />
                <SubmitButton className="btn btn-ghost btn-sm">Step down</SubmitButton>
              </form>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <p className="label">Appoint someone</p>
          <p className="mb-2 mt-1 text-xs text-muted">
            If they already play here the account attaches to the player they already are, so
            their rating and history stay in one piece.
          </p>
          <AppointOrganizerForm groupId={group.id} />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label">Visibility</h2>
        <form action={communityProfileAction} className="mt-3 space-y-3">
          <input type="hidden" name="groupId" value={group.id} />
          <label className="block">
            <span className="label">Who can find it</span>
            <select className="input mt-1" name="visibility" defaultValue={group.visibility}>
              <option value="private">Private — only people with the link</option>
              <option value="public">Public — listed at /communities</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Description</span>
            <textarea
              className="input mt-1 min-h-16 resize-y"
              name="description"
              maxLength={500}
              defaultValue={group.description ?? ""}
              placeholder="What a stranger reading the directory should know."
            />
          </label>
          <SubmitButton className="btn btn-primary">Save</SubmitButton>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="label">Invite code</h2>
        <p className="mt-2 font-mono text-lg tracking-[.25em] text-shuttle">{group.inviteCode}</p>
        <p className="mt-1 text-xs text-muted">
          Anyone holding this can reach the community. Replacing it kills every link already
          shared, which is the point.
        </p>
        <form action={rotateInviteCodeAction} className="mt-3">
          <input type="hidden" name="groupId" value={group.id} />
          <SubmitButton className="btn btn-ghost btn-sm">Replace the code</SubmitButton>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="label">{group.archivedAt ? "Archived" : "Archive"}</h2>
        <p className="mt-1 text-xs text-muted">
          {group.archivedAt
            ? `Archived ${prettyDateTime(group.archivedAt)}. It is hidden from members and the directory; nothing has been deleted.`
            : "Hides it from members and the directory. Nothing is deleted and it can come back."}
        </p>
        <form action={archiveCommunityAction} className="mt-3">
          <input type="hidden" name="groupId" value={group.id} />
          <input type="hidden" name="archived" value={group.archivedAt ? "0" : "1"} />
          <SubmitButton className="btn btn-ghost btn-sm">
            {group.archivedAt ? "Restore it" : "Archive it"}
          </SubmitButton>
        </form>
      </section>

      <p className="text-center text-xs text-muted">
        <Link href="/hq" className="text-teal hover:underline">
          All communities
        </Link>
      </p>
    </div>
  );
}
