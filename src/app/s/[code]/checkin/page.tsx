import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { Shuttle } from "@/components/Shuttle";
import { CheckedIn } from "@/components/motion/CheckedIn";
import { NewPlayerForm } from "@/components/NewPlayerForm";
import { joinPolicyOf } from "@/lib/join-policy";
import { getGroup, getRoster, getSessionByCode, listMembers } from "@/server/queries";
import { checkInAction } from "@/server/form-actions";
import { currentUserId } from "@/lib/identity";
import { verifyCheckInToken } from "@/lib/qr";
import { clockTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ code }, { t }] = await Promise.all([params, searchParams]);
  const session = await getSessionByCode(code);
  if (!session) notFound();

  const valid = Boolean(t && verifyCheckInToken(t, session.id));
  const [roster, members, userId, group] = await Promise.all([
    getRoster(session.id),
    listMembers(session.groupId),
    currentUserId(),
    getGroup(session.groupId),
  ]);

  const me = roster.find((r) => r.userId === userId) ?? null;
  // Roster only covers people with a booking. Somebody who just added themselves
  // at the door is a member with no booking, and should still be greeted by name
  // rather than sent hunting through a list of thirty.
  const meMember = members.find((m) => m.user.id === userId)?.user ?? null;

  if (!valid)
    return (
      <div className="card p-5 text-center">
        <p className="chip chip-amber">Code not valid</p>
        <h2 className="mt-3 text-lg font-bold">That QR code is out of date</h2>
        <p className="mt-2 text-sm text-muted">
          Ask the coordinator to show the current code, or check in from the session page.
        </p>
        <Link href={`/s/${session.code}`} className="btn btn-ghost mt-4">
          Open session
        </Link>
      </div>
    );

  if (me?.checkedInAt) {
    // How many people are already waiting ahead — the one number a player
    // actually wants the second they walk through the door.
    const waiting = roster.filter(
      (r) => r.checkedInAt && r.availability === "available" && r.onCourt === null,
    ).length;
    return (
      <CheckedIn
        name={me.name}
        at={`Checked in at ${clockTime(me.checkedInAt)}`}
        sessionCode={session.code}
        queueNote={waiting > 1 ? `${waiting - 1} ahead of you` : "You are first up"}
      />
    );
  }

  if (meMember)
    return (
      <div className="card p-6 text-center">
        <h2 className="text-xl font-extrabold">{meMember.name}</h2>
        <p className="mt-1 text-sm text-muted">Tap once to join tonight&apos;s queue.</p>
        <form action={checkInAction} className="mt-5">
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="method" value="qr" />
          <input type="hidden" name="token" value={t} />
          <SubmitButton className="btn btn-primary w-full" pendingLabel="Checking in...">
            Check me in
          </SubmitButton>
        </form>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-5 text-center rise">
        <div className="rally-bg opacity-30">
          <span style={{ "--dur": "6s", "--delay": "0s" } as React.CSSProperties}>
            <Shuttle size={30} />
          </span>
          <span style={{ "--dur": "7.5s", "--delay": "2.4s" } as React.CSSProperties}>
            <Shuttle size={20} />
          </span>
        </div>
        <div className="relative">
          <p className="label">Check in</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight">{session.name}</h2>
          <p className="mt-1 text-sm text-muted">Tap your name to join the queue.</p>
        </div>
      </div>

      {joinPolicyOf(group?.settings) !== "closed" && (
        <div className="card p-4">
          <h3 className="label">First time with this group?</h3>
          <p className="mt-1 text-sm text-muted">
            {joinPolicyOf(group?.settings) === "approval"
              ? "Ask the organizer to let you in. They can also check you in by hand tonight."
              : "Add yourself, then check in. You only do this once."}
          </p>
          <NewPlayerForm
            groupId={session.groupId}
            next={`/s/${session.code}/checkin?t=${encodeURIComponent(t ?? "")}`}
            needsApproval={joinPolicyOf(group?.settings) === "approval"}
            compact
          />
        </div>
      )}

      <div className="card divide-y divide-line">
        {members.map(({ user }, i) => (
          <form
            key={user.id}
            action={checkInAction}
            className="flex items-center gap-3 p-3 rise"
            style={{ "--i": Math.min(i, 14) } as React.CSSProperties}
          >
            <input type="hidden" name="sessionId" value={session.id} />
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="method" value="qr" />
            <input type="hidden" name="token" value={t} />
            <Avatar name={user.name} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{user.name}</span>
            {roster.find((r) => r.userId === user.id)?.checkedInAt ? (
              <span className="chip chip-live">In</span>
            ) : (
              <SubmitButton className="btn btn-teal btn-sm" pendingLabel="...">
                Check in
              </SubmitButton>
            )}
          </form>
        ))}
      </div>
    </div>
  );
}
