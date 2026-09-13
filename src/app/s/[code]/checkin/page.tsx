import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { Shuttle } from "@/components/Shuttle";
import { NewPlayerForm } from "@/components/NewPlayerForm";
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

  if (me?.checkedInAt)
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto w-fit text-shuttle">
          <Shuttle size={48} />
        </div>
        <p className="chip chip-live mx-auto mt-4 w-fit">Checked in</p>
        <h2 className="mt-3 text-xl font-extrabold">{me.name}, you&apos;re in</h2>
        <p className="mt-1 text-sm text-muted">
          Checked in at {clockTime(me.checkedInAt)}. You are in the queue.
        </p>
        <Link href={`/s/${session.code}`} className="btn btn-primary mt-5">
          See my place in the queue
        </Link>
      </div>
    );

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
      <div className="card p-4 text-center">
        <p className="label">Check in</p>
        <h2 className="mt-1 text-lg font-bold">{session.name}</h2>
        <p className="mt-1 text-sm text-muted">Tap your name to join the queue.</p>
      </div>

      {group?.settings?.allowSelfSignup !== false && (
        <div className="card p-4">
          <h3 className="label">First time with this group?</h3>
          <p className="mt-1 text-sm text-muted">
            Add yourself, then check in. You only do this once.
          </p>
          <NewPlayerForm
            groupId={session.groupId}
            next={`/s/${session.code}/checkin?t=${encodeURIComponent(t ?? "")}`}
            compact
          />
        </div>
      )}

      <div className="card divide-y divide-line">
        {members.map(({ user }) => (
          <form key={user.id} action={checkInAction} className="flex items-center gap-3 p-3">
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
