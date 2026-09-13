import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { StaffGate } from "@/components/StaffGate";
import { LiveRefresh } from "@/components/LiveRefresh";
import { getBoard, getSessionByCode, listMembers } from "@/server/queries";
import {
  availabilityAction, checkInAction, noShowAction, promoteAction,
} from "@/server/form-actions";
import { clockTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlayersPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();
  return (
    <StaffGate groupId={session.groupId} next={`/s/${code}/players`}>
      <CheckInList code={code} />
    </StaffGate>
  );
}

async function CheckInList({ code }: { code: string }) {
  const session = await getSessionByCode(code);
  if (!session) notFound();
  const [board, members] = await Promise.all([getBoard(session.id), listMembers(session.groupId)]);
  if (!board) notFound();

  const here = board.roster.filter((r) => r.checkedInAt);
  const expected = board.roster.filter((r) => !r.checkedInAt && r.bookingStatus === "confirmed");
  const waitlist = board.roster
    .filter((r) => r.bookingStatus === "waitlisted")
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));
  const rosterIds = new Set(board.roster.map((r) => r.userId));
  const walkIns = members.filter((m) => !rosterIds.has(m.user.id));

  return (
    <div className="space-y-4">
      <LiveRefresh seconds={8} />

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Checked in" value={String(here.length)} />
        <Tile label="Yet to arrive" value={String(expected.length)} />
        <Tile label="Waitlist" value={String(waitlist.length)} />
      </div>

      <section className="card p-4">
        <h2 className="label">Booked, not here yet</h2>
        {expected.length === 0 && <p className="mt-2 text-sm text-muted">Everyone has arrived.</p>}
        <div className="mt-2 divide-y divide-line/60">
          {expected.map((r) => (
            <div key={r.userId} className="flex items-center gap-2 py-2">
              <Avatar name={r.name} size={30} dim />
              <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
              <form action={checkInAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <input type="hidden" name="userId" value={r.userId} />
                <input type="hidden" name="method" value="manual" />
                <SubmitButton className="btn btn-teal btn-sm" pendingLabel="...">
                  Check in
                </SubmitButton>
              </form>
              <form action={noShowAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <input type="hidden" name="userId" value={r.userId} />
                <SubmitButton className="btn btn-ghost btn-sm">No show</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label">At the venue ({here.length})</h2>
        <div className="mt-2 divide-y divide-line/60">
          {here.map((r) => (
            <div key={r.userId} className="flex items-center gap-2 py-2">
              <Avatar name={r.name} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-[.68rem] text-muted">
                  In at {clockTime(r.checkedInAt)} &middot; {r.gamesPlayed} games
                </p>
              </div>
              {r.onCourt !== null ? (
                <span className="chip chip-live">Court {r.onCourt}</span>
              ) : r.availability === "available" ? (
                <form action={availabilityAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="userId" value={r.userId} />
                  <input type="hidden" name="availability" value="resting" />
                  <SubmitButton className="btn btn-ghost btn-sm">Rest</SubmitButton>
                </form>
              ) : r.availability === "resting" ? (
                <form action={availabilityAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="userId" value={r.userId} />
                  <input type="hidden" name="availability" value="available" />
                  <SubmitButton className="btn btn-teal btn-sm">Back in</SubmitButton>
                </form>
              ) : (
                <span className="chip">Left</span>
              )}
              {r.availability !== "left" && (
                <form action={availabilityAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="userId" value={r.userId} />
                  <input type="hidden" name="availability" value="left" />
                  <SubmitButton className="btn btn-ghost btn-sm">Gone</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      {waitlist.length > 0 && (
        <section className="card p-4">
          <div className="flex items-center gap-2">
            <h2 className="label">Waitlist</h2>
            <form action={promoteAction} className="ml-auto">
              <input type="hidden" name="sessionId" value={session.id} />
              <SubmitButton className="btn btn-ghost btn-sm">Fill free slots</SubmitButton>
            </form>
          </div>
          <ol className="mt-2 divide-y divide-line/60">
            {waitlist.map((r) => (
              <li key={r.userId} className="flex items-center gap-2 py-2">
                <span className="w-5 text-xs text-muted tabular">{r.waitlistPosition}</span>
                <Avatar name={r.name} size={26} dim />
                <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                <form action={checkInAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="userId" value={r.userId} />
                  <input type="hidden" name="method" value="manual" />
                  <SubmitButton className="btn btn-teal btn-sm">Squeeze in</SubmitButton>
                </form>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card p-4">
        <h2 className="label">Walk-in</h2>
        <p className="mt-1 text-xs text-muted">
          Someone turned up without booking. Checking them in adds them to the session.
        </p>
        <form action={checkInAction} className="mt-3 flex gap-2">
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="method" value="manual" />
          <select name="userId" className="input" required defaultValue="">
            <option value="" disabled>
              Choose a member
            </option>
            {walkIns.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
          <SubmitButton className="btn btn-primary">Add</SubmitButton>
        </form>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-xl font-extrabold tabular">{value}</p>
      <p className="text-[.6rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
