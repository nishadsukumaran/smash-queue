"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { finishMatchAction } from "@/server/form-actions";

/** Finish a game. The score is optional on purpose, per the PRD. */
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

  if (!open)
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Finish game
        </button>
      </div>
    );

  return (
    <div className="mt-1 rounded-xl border border-line bg-court p-3">
      <p className="label">Score (optional)</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[.7rem] text-muted">{labelA}</p>
          <input
            className="input mt-1 text-center text-lg"
            inputMode="numeric"
            value={a}
            onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder={String(pointsTo)}
          />
        </div>
        <span className="pt-4 text-muted">v</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[.7rem] text-muted">{labelB}</p>
          <input
            className="input mt-1 text-center text-lg"
            inputMode="numeric"
            value={b}
            onChange={(e) => setB(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="24"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={finishMatchAction} className="contents">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="scoreA" value={a} />
          <input type="hidden" name="scoreB" value={b} />
          <SubmitButton
            className="btn btn-primary btn-sm"
            disabled={a === "" || b === ""}
            pendingLabel="Saving..."
          >
            Save score
          </SubmitButton>
        </form>
        <form action={finishMatchAction} className="contents">
          <input type="hidden" name="matchId" value={matchId} />
          <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="...">
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
