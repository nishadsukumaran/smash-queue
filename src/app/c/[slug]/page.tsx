import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { JoinCommunityForm } from "@/components/JoinCommunityForm";
import {
  communitySummary, getGroupBySlug, listOrganizers, schedulePreview,
} from "@/server/queries";
import { switchCommunityAction } from "@/server/community-actions";
import { joinPolicyOf } from "@/lib/join-policy";
import { isMemberOf } from "@/lib/tenant";
import { currentAccount } from "@/lib/auth";
import { money, prettyDate, prettyTime } from "@/lib/format";
import { publicUpcomingForGroup } from "@/server/tournament-queries";
import { TournamentCardView } from "@/components/tournament/bits";

export const dynamic = "force-dynamic";

/**
 * A community's front door.
 *
 * Reachable by link whether or not the community is listed, so an owner can
 * share it anywhere. What it shows is the owner's choice: for a public
 * community, when and where it plays (unless they have switched that off);
 * never who plays, their scores or their money.
 */
export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group || group.archivedAt || group.deletedAt) notFound();

  const account = await currentAccount();
  const signedIn = Boolean(account?.onboarded);
  const showSchedule = group.visibility === "public" && group.settings?.previewSchedule !== false;

  const [summary, staff, member, schedule, cups] = await Promise.all([
    communitySummary(group.id),
    listOrganizers(group.id),
    isMemberOf(group.id, account),
    showSchedule ? schedulePreview(group.id) : Promise.resolve([]),
    publicUpcomingForGroup(group.id),
  ]);
  const policy = joinPolicyOf(group.settings);
  const owners = staff.filter((s) => s.membership.role === "owner");

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
          <span className="chip">
            {policy === "open" ? "Open to join" : policy === "approval" ? "Ask to join" : "By invitation"}
          </span>
        </div>
      </section>

      {schedule.length > 0 && !member && (
        <section className="card p-4">
          <h2 className="label">When they play</h2>
          <ul className="mt-2 divide-y divide-line/60">
            {schedule.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{prettyDate(s.date)}</span>{" "}
                  <span className="text-muted">
                    {prettyTime(s.startTime)}–{prettyTime(s.endTime)}
                    {s.venue ? ` · ${s.venue}` : ""}
                  </span>
                </span>
                <span className="chip">{money(s.fee, s.currency)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Join to book a place and see who&apos;s playing.</p>
        </section>
      )}

      {cups.length > 0 && (
        <section className="space-y-2">
          <h2 className="label px-1">Tournaments open to everyone</h2>
          {cups.map((c) => (
            <TournamentCardView key={c.t.id} c={c} />
          ))}
        </section>
      )}

      <section className="card p-4">
        {member ? (
          <form action={switchCommunityAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="groupId" value={group.id} />
            <input type="hidden" name="next" value="/" />
            <p className="min-w-0 flex-1 text-sm">You&apos;re a member. Open it to see what&apos;s on.</p>
            <SubmitButton className="btn btn-primary btn-sm">Open</SubmitButton>
          </form>
        ) : (
          <>
            <h2 className="label">
              {policy === "approval" ? "Ask to join" : policy === "open" ? "Join" : "By invitation"}
            </h2>
            <p className="mb-3 mt-1 text-xs text-muted">
              {policy === "approval"
                ? "The organizer lets new players in by hand."
                : policy === "open"
                  ? "One tap and you're in."
                  : "This community adds members by invitation."}
            </p>
            <JoinCommunityForm
              groupId={group.id}
              policy={policy}
              signedIn={signedIn}
              returnTo={`/c/${group.slug}`}
            />
          </>
        )}
      </section>

      {owners.length > 0 && (
        <p className="text-center text-xs text-muted">
          Run by {owners.map((o) => o.user.name).join(", ")}.
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
