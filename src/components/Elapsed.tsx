"use client";

import { useEffect, useState } from "react";
import { duration } from "@/lib/format";

/** Live game clock. Rendered client-side so it ticks between server refreshes. */
export function Elapsed({ since, className = "" }: { since: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className={`tabular ${className}`}>{duration(now - since)}</span>;
}
