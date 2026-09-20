"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { ScoreBoard } from "@/components/motion/ScoreBoard";
import { finishMatchAction } from "@/server/form-actions";
import { buzz } from "@/lib/haptics";

/**
 * Finish a game. The score is optional on purpose, per the PRD.
 *
 * The panel is a scoreboard rather than a form: the coordinator is standing
 * courtside with one hand free, and two big steppers beat two text fields
 * every time. Typing still works — the field is there — but nobody has to.
 */
export function FinishGame({
  matchId,
  pointsTo,
  labelA,
  labelB,
}: {
  matchId: string;
  pointsTo: number;
  labelA: string;
  labelB: string;
}) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const na = a === "" ? 0 : Number(a);
  const nb = b === "" ? 0 : Number(b);
  const both = a !== "" && b !== "";

  const bump = (side: "a" | "b", by: number) => {
    buzz("tap");
    const set = side === "a" ? setA : setB;
    const cur = side === "a" ? na : nb;
    set(String(Math.max(0, Math.min(99, cur + by))));
  };

  if (!open)
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            buzz("tap");
            setOpen(true);
          }}
        >
          Finish game
        </button>
      </div>
    );

  return (
    <div className="pop mt-1 rounded-xl border border-shuttle/35 bg-court p-3">
      <p className="label text-center">Final score</p>

      <div className="mt-2">
        <ScoreBoard a={na} b={nb} labelA={labelA} labelB={labelB} leadColor={both} />
      </div>

      {/* Steppers: the fast path. */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => bump("a", -1)}>
            &minus;
          </button>
          <button type="button" className="btn btn-teal btn-sm flex-1" onClick={() => bump("a", 1)}>
            +
          </button>
        </div>
        <span className="w-6" />
        <div className="flex flex-1 gap-1">
          <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => bump("b", -1)}>
            &minus;
          </button>
          <button type="button" className="btn btn-teal btn-sm flex-1" onClick={() => bump("b", 1)}>
            +
          </button>
        </div>
      </div>

      {/* One tap for the usual result: somebody got to the target. */}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm flex-1 text-xs"
          onClick={() => {
            buzz("tap");
            setA(String(pointsTo));
            setB(b === "" || Number(b) >= pointsTo ? "" : b);
          }}
        >
          {labelA.split(" + ")[0]} to {pointsTo}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm flex-1 text-xs"
          onClick={() => {
            buzz("tap");
            setB(String(pointsTo));
            setA(a === "" || Number(a) >= pointsTo ? "" : a);
          }}
        >
          {labelB.split(" + ")[0]} to {pointsTo}
        </button>
      </div>

      {/* Typing, for the times the score was 33-31. */}
      <div className="mt-2 flex items-center gap-2">
        <input
          className="input text-center"
          inputMode="numeric"
          aria-label={`Score for ${labelA}`}
          value={a}
          onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 2))}
          placeholder={String(pointsTo)}
        />
        <span className="text-xs text-muted">v</span>
        <input
          className="input text-center"
          inputMode="numeric"
          aria-label={`Score for ${labelB}`}
          value={b}
          onChange={(e) => setB(e.target.value.replace(/\D/g, "").slice(0, 2))}
          placeholder="24"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={finishMatchAction} className="contents">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="scoreA" value={a} />
          <input type="hidden" name="scoreB" value={b} />
          <SubmitButton
            className="btn btn-primary btn-sm"
            disabled={!both}
            pendingLabel="Saving..."
            haptic="win"
          >
            Save score
          </SubmitButton>
        </form>
        <form action={finishMatchAction} className="contents">
          <input type="hidden" name="matchId" value={matchId} />
          <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="..." haptic="confirm">
            Completed, no score
          </SubmitButton>
        </form>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Back
        </button>
      </div>
    </div>
  );
}
