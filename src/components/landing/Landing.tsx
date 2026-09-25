import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BrandShuttle, LogoMark } from "@/components/Logo";
import { CountUp } from "@/components/motion/CountUp";
import { Words } from "@/components/landing/Words";
import { HeroSlider, type Slide } from "@/components/landing/HeroSlider";
import { InstallButton } from "@/components/landing/InstallButton";
import { PALETTE } from "@/lib/palette";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";
import type { CommunityTeaser } from "@/server/queries";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * The signed-out front door, built for the way it is actually opened.
 *
 * Most people meet this as an installed app rather than a web page: no browser
 * chrome, no address bar, one screen. So the first screen is the whole pitch —
 * the one thing that matters (it is free), a slider carrying the features one
 * statement at a time, and the two buttons. Everything else is below the fold
 * for the minority who scroll, and nothing below the fold is load-bearing.
 */
export function Landing({
  stats,
  teasers,
}: {
  stats: { communities: number; players: number; sessions: number; games: number };
  teasers: CommunityTeaser[];
}) {
  return (
    <div className="pb-8">
      <Hero />
      <Proof stats={stats} />
      <Tournaments />
      <Communities teasers={teasers} count={stats.communities} />
      <Close />
    </div>
  );
}

/* ----------------------------------------------------------------- hero */

const icon = {
  queue: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M3 6h18M3 12h12M3 18h7" />
    </svg>
  ),
  qr: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM19.5 19.5v.01" strokeLinecap="round" />
    </svg>
  ),
  board: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="2.5" y="4.5" width="19" height="14" rx="2" />
      <path d="M12 4.5v14M2.5 11.5h19" strokeLinecap="round" />
    </svg>
  ),
  rating: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  money: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19" strokeLinecap="round" />
    </svg>
  ),
  cup: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4.5v1.5A3 3 0 0 0 7 10.4M17 6h2.5v1.5A3 3 0 0 1 17 10.4M9.5 20h5M12 14v6" />
    </svg>
  ),
};

const SLIDES: Slide[] = [
  { line: "Nobody sits out.", accentFrom: 1, caption: "The queue balances skill and turns, every game.", icon: icon.queue },
  { line: "Scan. Tap. Playing.", accentFrom: 2, caption: "A QR at the door puts them straight in the queue.", icon: icon.qr },
  { line: "The board is public.", accentFrom: 2, caption: "Who is on court, who is next, how long you waited.", icon: icon.board },
  { line: "Your record travels.", accentFrom: 1, caption: "One player number, every community you play in.", icon: icon.rating },
  { line: "The fee adds itself up.", accentFrom: 1, caption: "Who paid, who owes, what the night cost.", icon: icon.money },
  { line: "Run a real draw.", accentFrom: 2, caption: "Tournaments with seeded groups, prizes and results.", icon: icon.cup },
];

function Hero() {
  return (
    <section className="court court-live celebrate led edge-electric first-screen relative -mx-4 flex flex-col overflow-hidden px-5 py-6 sm:mx-0 sm:rounded-card sm:px-10 sm:py-10">
      <div className="hero-arc opacity-30">
        <span style={{ "--dur": "10s", "--delay": "0s" } as CSSProperties} className="text-shuttle">
          <BrandShuttle size={26} />
        </span>
        <span style={{ "--dur": "12s", "--delay": "4s" } as CSSProperties} className="text-teal">
          <BrandShuttle size={18} />
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* The one thing. */}
        <div className="rise flex flex-col items-center gap-3 sm:gap-4" style={step(0)}>
          <LogoMark size={40} knock={PALETTE.surface} label={null} />
          <span className="free-pill">
            <BrandShuttle size={14} />
            Free forever
          </span>
          <h1 className="poster text-center">
            Your club.
            <br />
            <span className="text-shuttle">No charge.</span>
          </h1>
          <p className="caption max-w-xs text-center">
            One community, every session, no card and no trial.
          </p>
        </div>

        {/* The features, one statement at a time. */}
        <div className="rise mt-6 flex min-h-0 flex-1 flex-col" style={step(1)}>
          <HeroSlider slides={SLIDES} />
        </div>

        <div className="rise mt-6 flex flex-wrap justify-center gap-2" style={step(2)}>
          <Link
            href="/signin?next=/communities"
            className="btn btn-primary px-5 py-3 text-sm sm:px-7 sm:py-3.5 sm:text-base"
          >
            Start free
          </Link>
          <InstallButton className="btn btn-ghost px-5 py-3 text-sm sm:px-7 sm:py-3.5 sm:text-base" />
          <Link
            href="/guide"
            className="btn btn-ghost px-5 py-3 text-sm sm:px-7 sm:py-3.5 sm:text-base"
          >
            How it works
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- proof */

const PROOF_THRESHOLD = { games: 200, players: 40 };

const PROMISES: [string, string][] = [
  ["Free", "your first community"],
  ["No password", "just your email"],
  ["±1 game", "busiest to quietest player"],
];

/** The platform's numbers once they argue for it, its promises until then. */
function Proof({
  stats,
}: {
  stats: { communities: number; players: number; sessions: number; games: number };
}) {
  const real = stats.games >= PROOF_THRESHOLD.games && stats.players >= PROOF_THRESHOLD.players;
  const cells: [ReactNode, string][] = real
    ? [
        [<CountUp key="c" value={stats.communities} />, "communities"],
        [<CountUp key="p" value={stats.players} />, "players"],
        [<CountUp key="s" value={stats.sessions} />, "sessions run"],
        [<CountUp key="g" value={stats.games} />, "games played"],
      ]
    : PROMISES.map(([h, t]) => [h, t] as [ReactNode, string]);

  return (
    <section className={`mt-4 grid gap-2.5 ${real ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-3"}`}>
      {cells.map(([head, tail], i) => (
        <div key={String(tail)} className="card led pop p-5" style={step(i)}>
          <p className="poster-xs text-shuttle">{head}</p>
          <p className="mt-1.5 text-sm text-muted">{tail}</p>
        </div>
      ))}
    </section>
  );
}

/* ----------------------------------------------------------- tournaments */

function Tournaments() {
  return (
    <section className="showcase led edge-electric reveal mt-4 px-5 py-9 sm:px-9 sm:py-12">
      <svg
        className="pointer-events-none absolute right-2 top-1/2 hidden h-[280px] w-[320px] -translate-y-1/2 lg:block"
        viewBox="0 0 320 280"
        aria-hidden
      >
        <g className="bracket-line">
          <path d="M8 18h54v34h54M8 86h54V52" />
          <path d="M8 126h54v34h54M8 194h54v-34" />
          <path d="M116 52h46v54h46M116 160h46v-54" />
        </g>
        <path className="bracket-line-hot" d="M208 106h50" />
        <g className="bracket-seed">
          {[18, 86, 126, 194].map((y) => (
            <circle key={y} cx="8" cy={y} r="3.5" />
          ))}
        </g>
        <circle cx="270" cy="106" r="10" fill={PALETTE.volt} />
        <circle cx="270" cy="106" r="17" fill="none" stroke={PALETTE.volt} strokeWidth="1.5" opacity=".45" />
      </svg>

      <div className="relative max-w-lg">
        <p className="eyebrow">Tournaments</p>
        <h2 className="poster-sm mt-3">
          <Words accentFrom={3}>Run a real draw.</Words>
        </h2>
        <p className="caption mt-4">
          Seeded groups into a knockout. Categories, entry fees, waiting lists and prizes.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/tournaments" className="btn btn-primary">
            Browse tournaments
          </Link>
          <Link href="/signin?next=/tournaments" className="btn btn-ghost">
            Host one
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- communities */

function Communities({ teasers, count }: { teasers: CommunityTeaser[]; count: number }) {
  return (
    <section className="showcase showcase-cyan led reveal mt-4 px-5 py-9 sm:px-9 sm:py-12">
      <div className="relative">
        <p className="eyebrow">Communities</p>
        <h2 className="poster-sm mt-3 max-w-lg">
          <Words accentFrom={2}>Find a court.</Words>
        </h2>
        <p className="caption mt-4 max-w-md">
          Start yours free. Its members are yours — never contacted, never shared.
        </p>

        {teasers.length > 0 && (
          <>
            <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {teasers.map((t, i) => (
                <div key={`${t.location}-${i}`} className="rounded-xl border border-line bg-court/80 p-4">
                  <p className="truncate text-sm font-bold">{t.location}</p>
                  <p className="mt-1.5 text-xs text-muted">{t.size}</p>
                  <p className="text-xs text-muted">
                    ~{t.perWeek} {t.perWeek === 1 ? "session" : "sessions"} a week
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Open communities, names withheld. Sign in to see them and ask to join.
            </p>
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/signin?next=/communities" className="btn btn-teal">
            {count >= 6 ? `Browse all ${count}` : "Browse communities"}
          </Link>
          <Link href="/signin?next=/communities/new" className="btn btn-ghost">
            Start one
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- close */

function Close() {
  return (
    <section className="celebrate led edge-electric reveal mt-4 overflow-hidden rounded-card border border-shuttle/40 px-5 py-12 text-center sm:px-8">
      <div className="relative">
        <div className="mx-auto w-fit text-shuttle shuttle-drop">
          <BrandShuttle size={34} angle={90} />
        </div>
        <h2 className="poster-sm mt-5">
          <Words accentFrom={2}>Play more. Admin less.</Words>
        </h2>
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <Link href="/signin?next=/communities" className="btn btn-primary px-7 py-3.5 text-base">
            Start free
          </Link>
          <InstallButton className="btn btn-ghost px-7 py-3.5 text-base" />
        </div>
        <p className="mt-6 text-xs text-muted">
          <a href={supportMailto("Question from the landing page")} className="text-teal hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </section>
  );
}
