import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CountUp } from "@/components/motion/CountUp";
import { SummaryCheer } from "@/components/motion/SummaryCheer";
import { Shuttle } from "@/components/Shuttle";
import { getSessionByCode, getSessionSummary } from "@/server/queries";
import { money, prettyDate } from "@/lib/format";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

export default async function SummaryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();
  const s = await getSessionSummary(session.id);
  if (!s) notFound();

  const cur = session.currency;
  const tone =
    s.fairness.score >= 88 ? "text-teal" : s.fairness.score >= 72 ? "text-amber" : "text-rose";

  const ordered = [...s.roster]
    .filter((r) => r.checkedInAt)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name));

  // The night's form guide: most wins, ties broken by fewer games, so somebody
  // who went 4 from 4 tops somebody who went 4 from 9.
  const podium = [...s.roster]
    .filter((r) => r.checkedInAt && r.wins > 0)
    .sort((a, b) => b.wins - a.wins || a.gamesPlayed - b.gamesPlayed || a.name.localeCompare(b.name))
    .slice(0, 3);

  const step = (i: number) => ({ "--i": i }) as CSSProperties;
  const wellRun = s.fairness.score >= 88;

  return (
    <div className="space-y-4">
      <SummaryCheer sessionCode={code} fire={wellRun} />

      <section className="card celebrate rise overflow-hidden p-6 text-center">
        <div className="relative">
          <p className="label">Session fairness</p>
          <p className={`mt-1 text-6xl font-extrabold leading-none ${tone}`}>
            <CountUp value={s.fairness.score} suffix="%" duration={1200} />
          </p>
          <p className="mt-2 text-sm text-muted">
            {s.fairness.verdict} &middot; everyone played between {s.fairness.min} and{" "}
            {s.fairness.max} games
          </p>
          {s.fairness.spread <= 1 && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-teal">
              <span className="shuttle-drop inline-flex">
                <Shuttle size={13} />
              </span>
              Within the one-game target. Nobody went home short.
            </p>
          )}
        </div>
      </section>

      {podium.length > 0 && (
        <section className="card p-4">
          <h2 className="label">Form guide</h2>
          <div className="mt-3 space-y-2">
            {podium.map((r, i) => (
              <div
                key={r.userId}
                className={`pop flex items-center gap-3 rounded-xl border p-2.5 ${
                  i === 0
                    ? "trophy border-shuttle/45 bg-shuttle/10"
                    : "border-line bg-court"
                }`}
                style={step(i)}
              >
                <span
                  className={`w-6 text-center text-sm font-extrabold tabular ${
                    i === 0 ? "text-shuttle" : "text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <Avatar name={r.name} size={32} onCourt={i === 0} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{r.name}</span>
                <span className="shrink-0 text-right">
                  <span
                    className={`text-lg font-extrabold tabular ${
                      i === 0 ? "text-shuttle" : "text-chalk"
                    }`}
                  >
                    <CountUp value={r.wins} />
                  </span>
                  <span className="ml-1 text-xs text-muted">
                    from {r.gamesPlayed}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Players" value={s.players} i={0} />
        <Tile label="Games" value={s.gamesPlayed} i={1} />
        <Tile label="Avg per player" value={s.avgGames} decimals={1} i={2} />
        <Tile label="Avg wait" value={s.avgWaitMinutes} suffix=" min" i={3} />
      </section>

      <section className="card p-4">
        <h2 className="label">Money</h2>
        <div className="mt-3 space-y-2 text-sm">
          <Row label="Expected" value={money(s.revenue, cur)} />
          <Row label="Collected" value={money(s.collected, cur)} tone="good" />
          {s.pending > 0 && <Row label="Outstanding" value={money(s.pending, cur)} tone="warn" />}
          {s.costs.map((c) => (
            <Row key={c.label} label={c.label} value={`- ${money(c.amount, cur)}`} muted />
          ))}
          <div className="border-t border-line pt-2">
            <Row
              label="Balance"
              value={money(s.balance, cur)}
              tone={s.balance >= 0 ? "good" : "bad"}
            />
          </div>
        </div>
        {s.pending > 0 && (
          <p className="mt-3 text-xs text-muted">
            Unpaid:{" "}
            {s.roster
              .filter((r) => r.checkedInAt && r.paymentStatus === "unpaid")
              .map((r) => r.name)
              .join(", ")}
          </p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="label">Games per player</h2>
        <div className="mt-3 space-y-1.5">
          {ordered.map((r, i) => {
            const pct = s.fairness.max > 0 ? (r.gamesPlayed / s.fairness.max) * 100 : 0;
            const short = r.gamesPlayed <= s.fairness.min;
            return (
              <div
                key={r.userId}
                className="rise flex items-center gap-2"
                style={step(Math.min(i, 18))}
              >
                <Avatar name={r.name} size={24} dim />
                <span className="w-28 shrink-0 truncate text-sm sm:w-40">{r.name}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-court">
                  <div
                    className={`bar-fill h-full rounded-full ${short ? "bg-amber" : "bg-shuttle"}`}
                    style={{ width: `${Math.max(4, pct)}%`, ...step(Math.min(i, 18)) }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-xs text-muted tabular">
                  {r.gamesPlayed} &middot; {r.wins}W
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {(s.noShows.length > 0 || s.overrideCount > 0) && (
        <section className="card p-4 text-sm">
          <h2 className="label">Notes</h2>
          {s.noShows.length > 0 && (
            <p className="mt-2 text-muted">
              No shows: <span className="text-chalk">{s.noShows.join(", ")}</span>
            </p>
          )}
          {s.overrideCount > 0 && (
            <p className="mt-1 text-muted">
              The coordinator changed the suggested four{" "}
              <span className="text-chalk">{s.overrideCount}</span>{" "}
              {s.overrideCount === 1 ? "time" : "times"}.
            </p>
          )}
        </section>
      )}

      <p className="text-center text-xs text-muted">
        {prettyDate(session.date)} &middot;{" "}
        <Link href={`/s/${code}/games`} className="text-teal underline">
          every game
        </Link>
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  decimals = 0,
  suffix = "",
  i = 0,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  i?: number;
}) {
  return (
    <div className="card pop p-3 text-center" style={{ "--i": i } as CSSProperties}>
      <p className="text-xl font-extrabold">
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </p>
      <p className="text-[.6rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
  muted?: boolean;
}) {
  const color =
    tone === "good" ? "text-teal" : tone === "warn" ? "text-amber" : tone === "bad" ? "text-rose" : "";
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted" : ""}>{label}</span>
      <span className={`font-semibold tabular ${color}`}>{value}</span>
    </div>
  );
}
