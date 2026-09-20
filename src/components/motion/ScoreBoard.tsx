"use client";

import { useEffect, useState } from "react";

/**
 * A two-digit scoreboard whose digits flip over when they change — the panel
 * on the wall of a sports hall, not a text input's value.
 *
 * Each digit is keyed by its own value, so React remounts only the digit that
 * actually moved and the animation fires on that one alone. 18 -> 19 flips the
 * unit; 19 -> 20 flips both, which is exactly what the real board does.
 */
function Digit({ char }: { char: string }) {
  return (
    <span
      key={char}
      className="score-digit inline-block w-[.62em] text-center"
      style={{ transformStyle: "preserve-3d" }}
    >
      {char}
    </span>
  );
}

export function ScoreBoard({
  a,
  b,
  labelA,
  labelB,
  leadColor = true,
}: {
  a: number;
  b: number;
  labelA: string;
  labelB: string;
  leadColor?: boolean;
}) {
  const side = (n: number, leading: boolean) => (
    <span
      className={`text-4xl font-extrabold tabular leading-none ${
        leadColor && leading ? "text-shuttle" : "text-chalk"
      }`}
    >
      {String(n)
        .split("")
        .map((c, i) => (
          <Digit key={`${i}-${c}`} char={c} />
        ))}
    </span>
  );

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1 text-right">
        <p className="truncate text-[.66rem] uppercase tracking-wider text-muted">{labelA}</p>
        <div className="mt-1">{side(a, a > b)}</div>
      </div>
      <span className="pt-4 text-sm font-bold text-muted">vs</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[.66rem] uppercase tracking-wider text-muted">{labelB}</p>
        <div className="mt-1">{side(b, b > a)}</div>
      </div>
    </div>
  );
}

/** A score that ticks up as the coordinator types it. Used inside FinishGame. */
export function useDebouncedScore(value: string, ms = 120) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
