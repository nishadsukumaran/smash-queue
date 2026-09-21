import { notFound } from "next/navigation";
import { MemberGate, canSeeSession } from "@/components/MemberGate";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { getMatches, getSessionByCode } from "@/server/queries";
import { confirmScoreAction, scoreAction } from "@/server/form-actions";
import { isStaffFor, currentUserId } from "@/lib/identity";
import { clockTime, duration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GamesPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();
  if (!(await canSeeSession(session.groupId)))
    return <MemberGate groupId={session.groupId} code={session.code}>{null}</MemberGate>;

  const [all, staff, userId] = await Promise.all([
    getMatches(session.id),
    isStaffFor(session.groupId),
    currentUserId(),
  ]);
  const completed = all.filter((m) => m.status === "completed");

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h2 className="label">Completed games</h2>
        <p className="mt-1 text-sm text-muted">
          {completed.length} played
          {completed.filter((m) => m.score).length < completed.length &&
            ` · ${completed.length - completed.filter((m) => m.score).length} without a score`}
        </p>
      </div>

      {completed.length === 0 && (
        <p className="card p-4 text-sm text-muted">Nothing finished yet.</p>
      )}

      {completed.map((m) => {
        const iPlayed = [...m.teamA, ...m.teamB].some((p) => p.id === userId);
        const canEdit = staff || iPlayed;
        return (
          <div key={m.id} className="card p-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="chip">Court {m.court}</span>
              <span>{clockTime(m.startedAt)}</span>
              {m.startedAt && m.finishedAt && (
                <span>&middot; {duration(m.finishedAt.getTime() - m.startedAt.getTime())}</span>
              )}
              {m.mode === "manual" && <span className="chip ml-auto">Coordinator pick</span>}
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <SideBlock players={m.teamA} winner={m.score?.winner === "A"} />
              <div className="text-center">
                {m.score ? (
                  <p className="text-xl font-extrabold tabular">
                    <span className={m.score.winner === "A" ? "text-shuttle" : ""}>{m.score.a}</span>
                    <span className="mx-1 text-muted">-</span>
                    <span className={m.score.winner === "B" ? "text-shuttle" : ""}>{m.score.b}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted">no score</p>
                )}
              </div>
              <SideBlock players={m.teamB} winner={m.score?.winner === "B"} align="right" />
            </div>

            {canEdit && (
              <form action={scoreAction} className="mt-3 flex items-center justify-center gap-2">
                <input type="hidden" name="matchId" value={m.id} />
                <input
                  className="input w-16 text-center"
                  name="scoreA"
                  inputMode="numeric"
                  defaultValue={m.score?.a ?? ""}
                  placeholder="-"
                />
                <span className="text-muted">v</span>
                <input
                  className="input w-16 text-center"
                  name="scoreB"
                  inputMode="numeric"
                  defaultValue={m.score?.b ?? ""}
                  placeholder="-"
                />
                <SubmitButton className="btn btn-ghost btn-sm">
                  {m.score ? "Update" : "Add score"}
                </SubmitButton>
              </form>
            )}

            {m.score && !m.score.confirmed && iPlayed && (
              <form action={confirmScoreAction} className="mt-2 text-center">
                <input type="hidden" name="matchId" value={m.id} />
                <SubmitButton className="btn btn-teal btn-sm">Confirm result</SubmitButton>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SideBlock({
  players,
  winner,
  align = "left",
}: {
  players: { id: string; name: string }[];
  winner?: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={`space-y-1 ${align === "right" ? "text-right" : ""}`}>
      {players.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          <Avatar name={p.name} size={22} dim={!winner} />
          <span className={`truncate text-sm ${winner ? "font-bold" : ""}`}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}
