"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { assignCourtAction } from "@/server/form-actions";

export type AssignerPlayer = {
  id: string;
  name: string;
  games: number;
  waitedMinutes: number;
  rating: number;
};

/**
 * The one screen the coordinator touches during a game.
 *
 * Opens with the engine's four. Tap a player to drop them, tap anyone in the
 * pool to add them, drag nothing. Whatever ends up here is what gets played,
 * and the difference from the recommendation is recorded quietly.
 */
export function CourtAssigner({
  sessionId,
  court,
  pool,
  recommended,
  suggestedTeamA,
  reasons,
  defaultOpen = false,
}: {
  sessionId: string;
  court: number;
  pool: AssignerPlayer[];
  recommended: string[];
  suggestedTeamA: string[];
  reasons: string[];
  defaultOpen?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(recommended);
  const [teamA, setTeamA] = useState<string[]>(suggestedTeamA);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(defaultOpen);

  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const teamB = selected.filter((id) => !teamA.includes(id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        setTeamA((t) => t.filter((x) => x !== id));
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 4) return prev;
      const next = [...prev, id];
      setTeamA((t) => (t.length < 2 ? [...t, id] : t));
      return next;
    });
  };

  const rotateTeams = () => {
    if (selected.length !== 4) return;
    const orders = [
      [selected[0], selected[1]],
      [selected[0], selected[2]],
      [selected[0], selected[3]],
    ];
    const current = orders.findIndex(
      (o) => o.every((id) => teamA.includes(id)) && teamA.length === 2,
    );
    setTeamA(orders[(current + 1) % orders.length]);
  };

  const ready = selected.length === 4 && teamA.length === 2;
  const changed =
    selected.length === recommended.length &&
    !selected.every((id) => recommended.includes(id));

  const filtered = pool.filter(
    (p) => !selected.includes(p.id) && p.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mt-3">
      <div className="space-y-2">
        <TeamRow
          label="Team A"
          ids={teamA}
          byId={byId}
          onRemove={toggle}
        />
        <div className="court-net" />
        <TeamRow label="Team B" ids={teamB} byId={byId} onRemove={toggle} />
      </div>

      {reasons.length > 0 && !open && (
        <ul className="mt-3 space-y-0.5 text-[.72rem] leading-relaxed text-muted">
          {reasons.slice(0, 2).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={assignCourtAction} className="contents">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="court" value={court} />
          <input type="hidden" name="teamA" value={teamA.join(",")} />
          <input type="hidden" name="teamB" value={teamB.join(",")} />
          <input type="hidden" name="recommended" value={recommended.join(",")} />
          <input type="hidden" name="mode" value={changed ? "manual" : "assisted"} />
          <input type="hidden" name="autoStart" value="1" />
          <SubmitButton className="btn btn-primary" disabled={!ready} pendingLabel="Starting...">
            Start game
          </SubmitButton>
        </form>

        <button type="button" className="btn btn-ghost btn-sm" onClick={rotateTeams} disabled={!ready}>
          Switch teams
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Done" : "Swap players"}
        </button>
        {changed && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSelected(recommended);
              setTeamA(suggestedTeamA);
            }}
          >
            Reset
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-line bg-court p-3">
          <input
            className="input"
            placeholder="Search waiting players"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {filtered.length === 0 && <p className="p-2 text-xs text-muted">Nobody else waiting.</p>}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                disabled={selected.length >= 4}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-40"
              >
                <Avatar name={p.name} size={26} dim />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <span className="text-xs text-muted tabular">
                  {p.games} games &middot; {p.waitedMinutes}m
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamRow({
  label,
  ids,
  byId,
  onRemove,
}: {
  label: string;
  ids: string[];
  byId: Map<string, AssignerPlayer>;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[.6rem] uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {ids.length === 0 && <span className="text-xs text-muted">Pick two players</span>}
        {ids.map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onRemove(id)}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pl-1 pr-2.5"
              title="Tap to remove"
            >
              <Avatar name={p.name} size={22} />
              <span className="text-sm font-semibold">{p.name}</span>
              <span className="text-[.65rem] text-muted tabular">{p.games}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
