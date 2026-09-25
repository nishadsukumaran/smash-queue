"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Confetti } from "@/components/motion/Confetti";
import { LogoMark } from "@/components/Logo";
import { PALETTE } from "@/lib/palette";
import { buzz } from "@/lib/haptics";

/**
 * The moment the whole check-in flow exists for: scan, tap, you're in.
 *
 * It fires once per session-and-player, tracked in sessionStorage — somebody
 * who reopens the QR link to show a friend gets the confirmation without the
 * fireworks going off a second time.
 */
export function CheckedIn({
  name,
  at,
  sessionCode,
  queueNote,
}: {
  name: string;
  at: string;
  sessionCode: string;
  queueNote?: string;
}) {
  const [fire, setFire] = useState(false);

  useEffect(() => {
    const key = `sq:checkin:${sessionCode}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked; celebrate anyway */
    }
    if (seen) return;
    setFire(true);
    buzz("confirm");
  }, [sessionCode]);

  const first = name.trim().split(/\s+/)[0];

  return (
    <>
      {fire && <Confetti count={90} duration={3000} />}
      <div className="celebrate card led edge-electric overflow-hidden p-7 text-center">
        <div className="relative">
          {/* The shuttle lands, the court lights come up under it. */}
          <div className="relative mx-auto h-20 w-20">
            <span className="absolute inset-0 rounded-full bg-shuttle/20 blur-xl" />
            <span className="shuttle-drop absolute inset-0 flex items-center justify-center text-shuttle">
              <LogoMark size={64} knock={PALETTE.surface} label={null} />
            </span>
          </div>

          <p className="chip chip-live mx-auto mt-5 w-fit rise" style={{ "--i": 1 } as React.CSSProperties}>
            <span className="live-dot" /> Checked in
          </p>

          <h2
            className="mt-3 text-3xl font-extrabold leading-tight tracking-tight rise"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            {first}, you&apos;re in
          </h2>

          <p className="mt-2 text-sm text-muted rise" style={{ "--i": 3 } as React.CSSProperties}>
            {at} &middot; you are in the queue
          </p>

          {queueNote && (
            <p
              className="mt-3 text-base font-bold text-shuttle rise"
              style={{ "--i": 4 } as React.CSSProperties}
            >
              {queueNote}
            </p>
          )}

          <Link
            href={`/s/${sessionCode}`}
            className="btn btn-primary mt-6 w-full rise"
            style={{ "--i": 5 } as React.CSSProperties}
            onClick={() => buzz("tap")}
          >
            See my place in the queue
          </Link>
        </div>
      </div>
    </>
  );
}
