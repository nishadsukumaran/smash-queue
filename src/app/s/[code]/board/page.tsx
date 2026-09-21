import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Elapsed } from "@/components/Elapsed";
import { StaffGate } from "@/components/StaffGate";
import { CourtAssigner } from "@/components/CourtAssigner";
import { FinishGame } from "@/components/FinishGame";
import { CountUp } from "@/components/motion/CountUp";
import { WinBurst } from "@/components/motion/WinBurst";
import { lastFinished } from "@/components/motion/last-finished";
import { Shuttle } from "@/components/Shuttle";
import { getBoard, getSessionByCode } from "@/server/queries";
import {
  cancelMatchAction, closeSessionAction, preferenceAction, removePreferenceAction,
  sessionSettingsAction, startMatchAction, startSessionAction,
} from "@/server/form-actions";
import { money } from "@/lib/format";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

/** Stagger index, kept out of the markup so the JSX stays readable. */
const step = (i: number) => ({ "--i": i }) as CSSProperties;

export default async function BoardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();

  return (
    <StaffGate groupId={session.groupId} next={`/s/${code}/board`}>
      <Board code={code} />
    </StaffGate>
  );
}

async function Board({ code }: { code: string }) {
  const session = await getSessionByCode(code);
  if (!session) notFound();
  const board = await getBoard(session.id);
  if (!board) notFound();

  const pool = board.ranked.map((r) => ({
    id: r.player.id,
    name: r.player.name,
    games: r.player.gamesPlayed,
    waitedMinutes: Math.round(r.waitedMs / 60000),
    rating: r.player.rating,
  }));
  const nameById = new Map(board.roster.map((r) => [r.userId, r.name]));

  if (session.status === "scheduled")
    return (
      <div className="card rise p-6 text-center">
        <div className="mx-auto w-fit text-shuttle/70 shuttle-drop">
          <Shuttle size={44} />
        </div>
        <p className="mt-4 text-sm text-muted">This session has not started yet.</p>
        <form action={startSessionAction} className="mt-4">
          <input type="hidden" name="sessionId" value={session.id} />
          <SubmitButton className="btn btn-primary">Open the session</SubmitButton>
        </form>
        <p className="mt-3 text-xs text-muted">
          It also opens automatically the first time somebody checks in.
        </p>
      </div>
    );

  if (session.status === "closed")
    return (
      <div className="card p-5 text-center">
        <p className="text-sm text-muted">This session is closed.</p>
        <Link href={`/s/${code}/summary`} className="btn btn-primary mt-3">
          View summary
        </Link>
      </div>
    );

  const busy = board.courts.filter((c) => c.match).length;

  return (
    <div className="space-y-4">
      <LiveRefresh seconds={5} />

      <WinBurst match={lastFinished(board.matches)} />

      <div className="grid grid-cols-4 gap-2">
        <Tile label="Checked in" value={board.checkedInCount} i={0} />
        <Tile label="Waiting" value={board.availableCount} i={1} />
        <Tile label="Courts" value={busy} of={session.courtCount} i={2} />
        <Tile
          label="Fairness"
          value={board.fairness.score}
          suffix="%"
          i={3}
          tone={board.fairness.score >= 88 ? "good" : board.fairness.score >= 72 ? "warn" : "bad"}
        />
      </div>

      {/* ------------------------------------------------------ courts --- */}
      <div className="grid gap-3 lg:grid-cols-2">
        {board.courts.map((c, ci) => {
          const m = c.match;
          return (
            <div
              key={c.court}
              className={`court rise p-4 ${m ? "court-live" : "court-open"}`}
              style={step(ci)}
            >
              <div className="relative flex items-center gap-2">
                <span className="text-base font-extrabold">Court {c.court}</span>
                <span className={`chip ${m ? "chip-live" : "chip-teal"}`}>
                  {m ? (m.status === "playing" ? "Playing" : "Ready") : "Open"}
                </span>
                {m?.startedAt && (
                  <span className="ml-auto text-sm font-semibold text-muted">
                    <Elapsed since={m.startedAt.getTime()} />
                  </span>
                )}
              </div>

              {m ? (
                <div className="relative mt-3">
                  <Team players={m.teamA} label="Team A" />
                  <div className="court-net my-2" />
                  <Team players={m.teamB} label="Team B" />

                  <div className="mt-4 flex flex-wrap gap-2">
                    {m.status === "pending" && (
                      <form action={startMatchAction}>
                        <input type="hidden" name="matchId" value={m.id} />
                        <SubmitButton className="btn btn-primary btn-sm">Start game</SubmitButton>
                      </form>
                    )}
                    {m.status === "playing" && (
                      <FinishGame
                        matchId={m.id}
                        pointsTo={session.pointsTo}
                        labelA={m.teamA.map((p) => p.name.split(" ")[0]).join(" + ")}
                        labelB={m.teamB.map((p) => p.name.split(" ")[0]).join(" + ")}
                      />
                    )}
                    <form action={cancelMatchAction}>
                      <input type="hidden" name="matchId" value={m.id} />
                      <SubmitButton className="btn btn-ghost btn-sm">Cancel</SubmitButton>
                    </form>
                  </div>
                </div>
              ) : c.recommendation ? (
                <CourtAssigner
                  sessionId={session.id}
                  court={c.court}
                  pool={pool}
                  recommended={c.recommendation.playerIds}
                  suggestedTeamA={c.recommendation.teamA}
                  reasons={c.recommendation.reasons}
                />
              ) : (
                <p className="relative mt-4 text-sm text-muted">
                  Not enough players free to fill this court yet.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ----------------------------------------------------- next up --- */}
      <section className="card p-4">
        <div className="flex items-center gap-2">
          <h2 className="label">Next players</h2>
          <span className="ml-auto text-xs text-muted">
            fewest games and longest wait first
          </span>
        </div>
        <ol className="mt-2 divide-y divide-line/60">
          {board.ranked.length === 0 && (
            <li className="py-3 text-sm text-muted">Everyone available is on court.</li>
          )}
          {board.ranked.map((r, i) => (
            <li
              key={r.player.id}
              className="rise flex items-center gap-2 py-2"
              style={step(Math.min(i, 14))}
            >
              <span
                className={`w-5 text-xs tabular ${i < 4 ? "font-bold text-shuttle" : "text-muted"}`}
              >
                {i + 1}
              </span>
              <Avatar name={r.player.name} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.player.name}</span>
              <span className="text-xs text-muted tabular">
                {r.player.gamesPlayed} games
              </span>
              <span className="w-14 text-right text-xs text-muted tabular">
                {Math.round(r.waitedMs / 60000)} min
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------- preferences --- */}
      <section className="card p-4">
        <h2 className="label">Pairing preferences</h2>
        <p className="mt-1 text-xs text-muted">
          Temporary, for this session only. Fairness still comes first.
        </p>

        {board.prefs.length > 0 && (
          <ul className="mt-3 space-y-1">
            {board.prefs.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className={`chip ${p.kind === "pair" ? "chip-teal" : "chip-amber"}`}>
                  {p.kind === "pair" ? "Together" : "Apart"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {nameById.get(p.userAId)} and {nameById.get(p.userBId)}
                </span>
                <form action={removePreferenceAction}>
                  <input type="hidden" name="preferenceId" value={p.id} />
                  <SubmitButton className="btn btn-ghost btn-sm">Remove</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={preferenceAction} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="sessionId" value={session.id} />
          <select name="userAId" className="input" required defaultValue="">
            <option value="" disabled>
              Player
            </option>
            {board.roster.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.name}
              </option>
            ))}
          </select>
          <select name="userBId" className="input" required defaultValue="">
            <option value="" disabled>
              Player
            </option>
            {board.roster.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.name}
              </option>
            ))}
          </select>
          <select name="kind" className="input" defaultValue="pair">
            <option value="pair">Same team</option>
            <option value="separate">Different games</option>
          </select>
          <SubmitButton className="btn btn-ghost">Add</SubmitButton>
        </form>
      </section>

      {/* ----------------------------------------------------- controls -- */}
      <section className="card p-4">
        <h2 className="label">Session controls</h2>
        <form action={sessionSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="sessionId" value={session.id} />
          <label className="block">
            <span className="label">Courts</span>
            <input className="input mt-1" name="courtCount" type="number" min={1} max={12} defaultValue={session.courtCount} />
          </label>
          <label className="block">
            <span className="label">Game type</span>
            <select className="input mt-1" name="gameType" defaultValue={session.gameType}>
              <option value="casual">Casual</option>
              <option value="balanced">Casual balanced</option>
              <option value="competitive">Competitive</option>
              <option value="social">Social mixing</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Ends</span>
            <input className="input mt-1" name="endTime" type="time" defaultValue={session.endTime} />
          </label>
          <div className="flex items-end">
            <SubmitButton className="btn btn-ghost w-full">Update</SubmitButton>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="text-xs text-muted">
            Collected {money(board.totals.collected, session.currency)} of{" "}
            {money(board.totals.expected, session.currency)}
          </span>
          <Link href={`/s/${code}/payments`} className="btn btn-ghost btn-sm">
            Payments
          </Link>
          <Link href={`/s/${code}/players`} className="btn btn-ghost btn-sm">
            Check-in
          </Link>
          <form action={closeSessionAction} className="ml-auto">
            <input type="hidden" name="sessionId" value={session.id} />
            <input type="hidden" name="code" value={code} />
            <SubmitButton className="btn btn-danger btn-sm" pendingLabel="Closing...">
              Close session
            </SubmitButton>
          </form>
        </div>
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  of,
  suffix = "",
  tone,
  i = 0,
}: {
  label: string;
  value: number;
  /** Renders as "3/6" — the denominator is fixed, so only the numerator counts up. */
  of?: number;
  suffix?: string;
  tone?: "good" | "warn" | "bad";
  i?: number;
}) {
  const color =
    tone === "good"
      ? "text-teal"
      : tone === "warn"
        ? "text-amber"
        : tone === "bad"
          ? "text-rose"
          : "text-chalk";
  return (
    <div className="card pop p-3 text-center" style={step(i)}>
      <p className={`text-xl font-extrabold ${color}`}>
        <CountUp value={value} suffix={suffix} />
        {of !== undefined && <span className="text-muted">/{of}</span>}
      </p>
      <p className="text-[.6rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function Team({ players, label }: { players: { id: string; name: string }[]; label: string }) {
  return (
    <div>
      <p className="text-[.6rem] uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {players.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5">
            <Avatar name={p.name} size={24} onCourt />
            <span className="text-sm font-semibold">{p.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
