import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { getPlayerStats } from "@/server/queries";
import { signOutAction } from "@/server/form-actions";
import { currentUserId } from "@/lib/identity";
import { ratingBand } from "@/lib/fairness";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const userId = await currentUserId();
  if (!userId)
    return (
      <div className="card p-5 text-center">
        <p className="text-sm text-muted">Nobody selected on this phone yet.</p>
        <Link href="/who" className="btn btn-primary mt-4">
          Pick your name
        </Link>
      </div>
    );

  const stats = await getPlayerStats(userId);
  if (!stats) return <p className="card p-4 text-muted">Player not found.</p>;

  const band = ratingBand(stats.user.rating);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex items-center gap-3">
          <Avatar name={stats.user.name} size={54} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{stats.user.name}</h1>
            <p className="text-sm" style={{ color: band.color }}>
              {band.label} &middot; {Math.round(stats.user.rating)} rating
            </p>
          </div>
          <form action={signOutAction} className="ml-auto">
            <SubmitButton className="btn btn-ghost btn-sm">Not me</SubmitButton>
          </form>
        </div>

        <div className="mt-4 flex gap-1">
          {stats.recentForm.length === 0 && (
            <span className="text-xs text-muted">No games recorded yet.</span>
          )}
          {stats.recentForm.map((f, i) => (
            <span
              key={i}
              className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${
                f === "W"
                  ? "bg-teal/20 text-teal"
                  : f === "L"
                    ? "bg-rose/20 text-rose"
                    : "bg-surface-2 text-muted"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Sessions" value={String(stats.sessionsAttended)} />
        <Tile label="Games" value={String(stats.games)} />
        <Tile label="Won" value={String(stats.wins)} />
        <Tile label="Win rate" value={`${stats.winRate.toFixed(0)}%`} />
      </section>

      <section className="card p-4 text-sm">
        <h2 className="label">Patterns</h2>
        <div className="mt-3 space-y-2">
          <Row
            label="Average games per session"
            value={stats.avgGamesPerSession.toFixed(1)}
          />
          <Row
            label="Favourite partner"
            value={
              stats.favouritePartner
                ? `${stats.favouritePartner.name} (${stats.favouritePartner.games})`
                : "-"
            }
          />
          <Row
            label="Most frequent opponent"
            value={
              stats.frequentOpponent
                ? `${stats.frequentOpponent.name} (${stats.frequentOpponent.games})`
                : "-"
            }
          />
          <Row label="Record" value={`${stats.wins}W ${stats.losses}L`} />
        </div>
      </section>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="truncate font-semibold">{value}</span>
    </div>
  );
}
