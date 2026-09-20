"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that rolls up to its value instead of appearing at it.
 *
 * Server-rendered pages hand this the final number, so the text content is
 * correct before hydration and correct again a beat later — a crawler or a
 * screen reader never sees a lie, only the finished figure.
 */
export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  suffix = "",
  className = "",
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // First paint animates up from zero; later changes tween from wherever the
    // number already was, so a live score nudging 12 -> 13 does not reset.
    const start = mounted.current ? from.current : 0;
    mounted.current = true;
    if (reduce || start === value) {
      setShown(value);
      from.current = value;
      return;
    }

    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      // easeOutExpo: fast off the mark, long settle. Reads as momentum.
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={`tabular ${className}`}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
