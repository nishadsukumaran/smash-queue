"use client";

import { useEffect, useRef } from "react";

/**
 * A burst of shuttlecocks, drawn on a canvas that covers the viewport and then
 * removes itself.
 *
 * Deliberately not a dependency: canvas-confetti is 8kB for round paper dots,
 * and round paper dots are not what this app is about. The particles here are
 * cork-and-feather, they tumble the way a shuttle tumbles, and the whole thing
 * is about sixty lines.
 */
export function Confetti({
  fire = true,
  count = 70,
  duration = 2600,
}: {
  fire?: boolean;
  count?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const COLORS = ["#D7F75B", "#3DD9A4", "#FFC24B", "#EAF6F0", "#8BD3FF"];

    // Two launch points, left and right of centre, like a pair of serves.
    const particles = Array.from({ length: count }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -1 : 1) * (0.5 + Math.random() * 0.55);
      const speed = 9 + Math.random() * 9;
      return {
        x: fromLeft ? w * 0.18 : w * 0.82,
        y: h * 0.52,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed * (0.85 + Math.random() * 0.5),
        spin: (Math.random() - 0.5) * 0.3,
        rot: Math.random() * Math.PI * 2,
        size: 5 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1,
      };
    });

    const started = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const elapsed = now - started;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        // Gravity plus heavy drag: a shuttle sheds horizontal speed fast, which
        // is what gives the burst its distinctive fountain shape.
        p.vy += 0.42;
        p.vx *= 0.975;
        p.vy *= 0.988;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        p.life = Math.max(0, 1 - elapsed / duration);

        if (p.y > h + 40) continue;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;

        // The cork.
        ctx.beginPath();
        ctx.arc(0, -p.size * 0.5, p.size * 0.42, 0, Math.PI * 2);
        ctx.fill();

        // The feather skirt, flaring away from the cork.
        ctx.globalAlpha = p.life * 0.62;
        ctx.beginPath();
        ctx.moveTo(-p.size * 0.38, -p.size * 0.35);
        ctx.lineTo(-p.size * 0.85, p.size * 1.15);
        ctx.lineTo(p.size * 0.85, p.size * 1.15);
        ctx.lineTo(p.size * 0.38, -p.size * 0.35);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      if (elapsed < duration) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [fire, count, duration]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
}
