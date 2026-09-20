"use client";

import { useEffect, useState } from "react";
import { Confetti } from "@/components/motion/Confetti";

/**
 * A night where everybody got their games deserves a small celebration the
 * first time somebody opens the summary. Once per session per device — the
 * report is also a working document, and confetti on the tenth read is noise.
 */
export function SummaryCheer({ sessionCode, fire }: { sessionCode: string; fire: boolean }) {
  const [go, setGo] = useState(false);

  useEffect(() => {
    if (!fire) return;
    const key = `sq:summary:${sessionCode}`;
    try {
      if (localStorage.getItem(key) === "1") return;
      localStorage.setItem(key, "1");
    } catch {
      /* storage blocked; fall through and celebrate */
    }
    setGo(true);
  }, [fire, sessionCode]);

  return go ? <Confetti count={110} duration={3400} /> : null;
}
