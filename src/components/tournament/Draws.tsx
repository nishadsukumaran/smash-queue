import type { TournamentMatch } from "@/db/schema";
import type { CategoryView, EntryView } from "@/server/tournament-queries";
import { roundName } from "@/lib/tournament-engine";
import { SubmitButton } from "@/components/SubmitButton";
import { clearResultAction, recordResultAction, scheduleMatchAction } from "@/server/tournament-actions";
import { placeName } from "./bits";

/**
 * A category's draw: group tables, then the bracket, then the podium.
 * Staff get a result form folded into every match that can be played.
 */
export function Draws({
  cat,
  entries,
  canScore,
  next,
  meIds,
}: {
  cat: CategoryView;
  entries: Map<string, EntryView>;
  canScore: boolean;
  next: string;
  meIds: Set<string>;
}) {
  const label = (id: string | null) => (id ? entries.get(id)?.label ?? "—" : null);
  const mine = (id: string | null) => {
    const e = id ? entries.get(id) : null;
    return Boolean(e && (meIds.has(e.player1Id) || (e.player2Id && meIds.has(e.player2Id))));
  };
  const group = cat.matches.filter((m) => m.stage === "group");
  const ko = cat.matches.filter((m) => m.stage === "knockout");
  const rounds = ko.length ? Math.max(...ko.map((m) => m.round)) : 0;

  if (cat.matches.length === 0) {
    return <p className="text-sm text-muted">The draw hasn&apos;t been made yet.</p>;
  }

  return (
    <div className="space-y-5">
      {cat.placings.length > 0 && (
        <div className="court court-live p-4">
          <p className="label relative">Results</p>
          <ol className="relative mt-2 space-y-1.5">
            {cat.placings.map((p) => (
              <li key={`${p.place}-${p.entryId}`} className="flex items-baseline gap-3">
                <span className={`w-24 text-xs font-extrabold uppercase tracking-wider ${p.place === 1 ? "text-shuttle" : "text-muted"}`}>
                  {placeName(p.place)}
                </span>
                <span className={`font-bold ${p.place === 1 ? "text-lg text-shuttle" : ""}`}>{label(p.entryId)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {cat.tables.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {cat.tables.map((t) => (
            <div key={t.label} className="card overflow-x-auto p-3">
              <p className="label">{cat.tables.length > 1 || cat.format === "groups_knockout" ? `Group ${t.label}` : "Table"}</p>
              <table className="mt-2 w-full min-w-[20rem] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="py-1 pr-2 font-semibold">#</th>
                    <th className="py-1 pr-2 font-semibold">Team</th>
                    <th className="py-1 pr-2 text-right font-semibold">P</th>
                    <th className="py-1 pr-2 text-right font-semibold">W</th>
                    <th className="py-1 pr-2 text-right font-semibold">Games</th>
                    <th className="py-1 text-right font-semibold">Pts +/-</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => {
                    const through = cat.format === "groups_knockout" && i < cat.advancePerGroup;
                    return (
                      <tr key={r.entryId} className={`border-t border-line/60 ${mine(r.entryId) ? "text-shuttle" : ""}`}>
                        <td className="py-1.5 pr-2 tabular text-muted">{i + 1}</td>
                        <td className="py-1.5 pr-2 font-semibold">
                          {label(r.entryId)}
                          {through && cat.groupStageDone && <span className="chip chip-teal ml-2">Through</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular">{r.played}</td>
                        <td className="py-1.5 pr-2 text-right tabular font-bold">{r.won}</td>
                        <td className="py-1.5 pr-2 text-right tabular">{r.gamesFor}-{r.gamesAgainst}</td>
                        <td className="py-1.5 text-right tabular">{r.pointsFor - r.pointsAgainst > 0 ? "+" : ""}{r.pointsFor - r.pointsAgainst}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {group.length > 0 && (
        <details className="card p-3" open={canScore || !cat.groupStageDone}>
          <summary className="label cursor-pointer">
            {cat.format === "round_robin" ? "Matches" : "Group matches"} · {group.filter((m) => m.status === "completed").length}/{group.length} played
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {group.map((m) => (
              <MatchCard key={m.id} m={m} label={label} mine={mine} canScore={canScore} bestOf={cat.bestOf} next={next}
                caption={`${cat.tables.length > 1 ? `Group ${m.groupLabel} · ` : ""}Round ${m.round}`} />
            ))}
          </div>
        </details>
      )}

      {ko.length > 0 && (
        <div>
          <p className="label mb-2">Knockout</p>
          <div className="-mx-4 overflow-x-auto px-4 pb-2">
            <div className="flex min-w-max gap-3">
              {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
                <div key={r} className="flex w-64 flex-col justify-around gap-2">
                  <p className="label text-center">{roundName(r, rounds)}</p>
                  {ko
                    .filter((m) => m.round === r)
                    .map((m) => (
                      <MatchCard key={m.id} m={m} label={label} mine={mine} canScore={canScore} bestOf={cat.bestOf} next={next} />
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({
  m,
  label,
  mine,
  canScore,
  bestOf,
  next,
  caption,
}: {
  m: TournamentMatch;
  label: (id: string | null) => string | null;
  mine: (id: string | null) => boolean;
  canScore: boolean;
  bestOf: number;
  next: string;
  caption?: string;
}) {
  const done = m.status === "completed";
  const walkover = done && !m.scores;
  const side = (id: string | null, s: "A" | "B") => {
    const won = Boolean(id) && m.winnerEntryId === id;
    const lost = (done || m.status === "bye") && Boolean(id) && !won;
    return (
      <div className={`flex items-center gap-2 ${won ? "font-bold text-chalk" : lost ? "text-muted" : ""} ${mine(id) ? "text-shuttle" : ""}`}>
        <span className="min-w-0 flex-1 truncate">
          {id ? label(id) : m.status === "bye" ? <span className="text-muted">Bye</span> : <span className="text-muted">TBD</span>}
        </span>
        {m.scores && (
          <span className="tabular flex gap-1.5 text-xs">
            {m.scores.map((g, i) => (
              <span key={i} className={(s === "A" ? g[0] > g[1] : g[1] > g[0]) ? "font-bold text-chalk" : "text-muted"}>
                {s === "A" ? g[0] : g[1]}
              </span>
            ))}
          </span>
        )}
        {walkover && won && <span className="chip">W/O</span>}
      </div>
    );
  };

  if (m.status === "bye" && !canScore) {
    return (
      <div className="rounded-xl border border-dashed border-line/70 p-2.5 text-sm opacity-70">
        {side(m.entryAId, "A")}
        {side(m.entryBId, "B")}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-2.5 text-sm ${m.status === "ready" ? "border-teal/40 bg-surface" : "border-line bg-court"}`}>
      {(caption || m.court || m.scheduledAt) && (
        <p className="mb-1 flex gap-2 text-[10.5px] font-bold uppercase tracking-wider text-muted">
          {caption && <span>{caption}</span>}
          {(m.court || m.scheduledAt) && (
            <span className="ml-auto text-teal">
              {[m.court && `Court ${m.court}`, m.scheduledAt].filter(Boolean).join(" · ")}
            </span>
          )}
        </p>
      )}
      <div className="space-y-1">
        {side(m.entryAId, "A")}
        <div className="h-px bg-line/70" />
        {side(m.entryBId, "B")}
      </div>

      {canScore && (m.status === "ready" || done) && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-teal">{done ? "Edit result" : "Enter result"}</summary>
          <form action={recordResultAction} className="mt-2 space-y-2">
            <input type="hidden" name="matchId" value={m.id} />
            <input type="hidden" name="next" value={next} />
            {Array.from({ length: bestOf }, (_, i) => i + 1).map((g) => (
              <div key={g} className="flex items-center gap-2">
                <span className="w-14 text-xs text-muted">Game {g}</span>
                <input className="input w-16 px-2 py-1.5 text-center" name={`g${g}a`} inputMode="numeric" pattern="[0-9]*"
                  defaultValue={m.scores?.[g - 1]?.[0] ?? ""} aria-label={`Game ${g}, ${label(m.entryAId)}`} />
                <span className="text-muted">–</span>
                <input className="input w-16 px-2 py-1.5 text-center" name={`g${g}b`} inputMode="numeric" pattern="[0-9]*"
                  defaultValue={m.scores?.[g - 1]?.[1] ?? ""} aria-label={`Game ${g}, ${label(m.entryBId)}`} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Saving...">Save result</SubmitButton>
              <SubmitButton className="btn btn-ghost btn-sm" name="walkover" value="A">W/O to top</SubmitButton>
              <SubmitButton className="btn btn-ghost btn-sm" name="walkover" value="B">W/O to bottom</SubmitButton>
            </div>
          </form>
          {done && (
            <form action={clearResultAction} className="mt-2">
              <input type="hidden" name="matchId" value={m.id} />
              <input type="hidden" name="next" value={next} />
              <SubmitButton className="btn btn-danger btn-sm" pendingLabel="Clearing...">Clear result</SubmitButton>
            </form>
          )}
          <form action={scheduleMatchAction} className="mt-2 flex items-center gap-2">
            <input type="hidden" name="matchId" value={m.id} />
            <input type="hidden" name="next" value={next} />
            <input className="input w-20 px-2 py-1.5 text-sm" name="court" placeholder="Court" defaultValue={m.court ?? ""} />
            <input className="input w-24 px-2 py-1.5 text-sm" name="time" placeholder="Time" defaultValue={m.scheduledAt ?? ""} />
            <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="...">Set</SubmitButton>
          </form>
        </details>
      )}
    </div>
  );
}
