import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { getSessionByCode, getSessionSummary } from "@/server/queries";
import { money, prettyDate } from "@/lib/format";

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

  return (
    <div className="space-y-4">
      <section className="card p-5 text-center">
        <p className="label">Session fairness</p>
        <p className={`mt-1 text-5xl font-extrabold tabular ${tone}`}>{s.fairness.score}%</p>
        <p className="mt-1 text-sm text-muted">
          {s.fairness.verdict} &middot; everyone played between {s.fairness.min} and{" "}
          {s.fairness.max} games
        </p>
        {s.fairness.spread <= 1 && (
          <p className="mt-2 text-xs text-teal">
            Within the one-game target. Nobody went home short.
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Players" value={String(s.players)} />
        <Tile label="Games" value={String(s.gamesPlayed)} />
        <Tile label="Avg per player" value={s.avgGames.toFixed(1)} />
        <Tile label="Avg wait" value={`${s.avgWaitMinutes.toFixed(0)} min`} />
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
          {ordered.map((r) => {
            const pct = s.fairness.max > 0 ? (r.gamesPlayed / s.fairness.max) * 100 : 0;
            return (
              <div key={r.userId} className="flex items-center gap-2">
                <Avatar name={r.name} size={24} dim />
                <span className="w-28 shrink-0 truncate text-sm sm:w-40">{r.name}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-court">
                  <div
                    className="h-full rounded-full bg-shuttle"
                    style={{ width: `${Math.max(4, pct)}%` }}
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-xl font-extrabold tabular">{value}</p>
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
