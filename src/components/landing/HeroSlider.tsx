"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Words } from "@/components/landing/Words";

export type Slide = { line: string; accentFrom: number; caption: string; icon: ReactNode };

const ADVANCE_MS = 4800;

/**
 * The feature slider that carries the hero.
 *
 * The swipe is CSS scroll-snap — it works before this component hydrates and
 * would work if it never did, which is the right default for something that is
 * the first screen of an installed app. What JavaScript adds is auto-advance
 * and the active dot, and it withdraws the first the instant somebody takes
 * over: touching, dragging, tabbing to a dot or hiding the tab all stop it for
 * good, because a carousel that keeps moving under your thumb is worse than
 * one that never moved.
 */
export function HeroSlider({ slides }: { slides: Slide[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(false);

  // Only start auto-advance after mount, and never when motion is reduced.
  useEffect(() => {
    setAuto(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, []);

  /*
   * Positions come from the slides themselves, never from the scroller's
   * clientWidth. The scroller carries horizontal padding so a sliver of the
   * next slide shows, which makes a slide narrower than the box that holds it
   * — 348 against 380 on a phone. Dividing by clientWidth drifts by a whole
   * slide a few positions in, and the dots start lying about where you are.
   */
  const offsets = useCallback(() => {
    const el = ref.current;
    if (!el) return [] as number[];
    const kids = Array.from(el.children) as HTMLElement[];
    if (kids.length === 0) return [];
    const base = kids[0].offsetLeft;
    return kids.map((k) => k.offsetLeft - base);
  }, []);

  const goTo = useCallback(
    (i: number, smooth = true) => {
      const el = ref.current;
      const xs = offsets();
      if (!el || xs[i] === undefined) return;
      el.scrollTo({ left: xs[i], behavior: smooth ? "smooth" : "auto" });
    },
    [offsets],
  );

  const indexAt = useCallback(
    (scrollLeft: number) => {
      const xs = offsets();
      if (xs.length === 0) return 0;
      let best = 0;
      for (let i = 1; i < xs.length; i++) {
        if (Math.abs(xs[i] - scrollLeft) < Math.abs(xs[best] - scrollLeft)) best = i;
      }
      return best;
    },
    [offsets],
  );

  // Track the snapped slide from scroll position rather than an observer: the
  // nearest slide offset is correct mid-fling as well as at rest.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(indexAt(el.scrollLeft)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [indexAt]);

  // Hand control over permanently on the first deliberate interaction.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = () => setAuto(false);
    el.addEventListener("pointerdown", stop, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("keydown", stop);
    return () => {
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("keydown", stop);
    };
  }, []);

  useEffect(() => {
    if (!auto) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const el = ref.current;
      if (!el) return;
      const next = (indexAt(el.scrollLeft) + 1) % slides.length;
      // Wrapping back to the first slide jumps rather than scrolls the whole
      // way back, which would run the entire reel past you in reverse.
      goTo(next, next !== 0);
    };
    const id = setInterval(tick, ADVANCE_MS);
    return () => clearInterval(id);
  }, [auto, goTo, indexAt, slides.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <div
        ref={ref}
        className="slider -mx-4 px-4 sm:mx-0 sm:px-0"
        // A carousel of statements, not a set of tab panels.
        aria-roledescription="carousel"
        aria-label="What SmashQ does"
        tabIndex={0}
      >
        {slides.map((s, i) => (
          <div
            key={s.line}
            className="slide px-1"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
          >
            <div className="flex flex-col items-center gap-4 px-2 text-center">
              <span className="plate plate-cyan">{s.icon}</span>
              <h2 className="poster-sm max-w-md">
                <Words accentFrom={s.accentFrom}>{s.line}</Words>
              </h2>
              <p className="caption max-w-xs">{s.caption}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        {slides.map((s, i) => (
          <button
            key={s.line}
            type="button"
            onClick={() => {
              setAuto(false);
              goTo(i);
            }}
            aria-label={`Show: ${s.line}`}
            aria-current={i === active}
            className={`dot ${i === active ? "dot-on" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
