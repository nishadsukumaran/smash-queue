import { Avatar } from "@/components/Avatar";
import { activeCommunity } from "@/lib/tenant";
import { getLeaderboard } from "@/server/queries";
import { ratingBand } from "@/lib/fairness";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const active = await activeCommunity();
  if (!active) return null;
  const group = active.group;
  const board = await getLeaderboard(group.id);
  const played = board.filter((p) => p.games > 0);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="label">Leaderboard</h2>
        <p className="mt-1 text-xs text-muted">
          Doubles Elo. Everyone starts at 1200 and moves on results, not on opinion.
        </p>
        <div className="mt-3 divide-y divide-line/60">
          {played.map((p, i) => {
            const band = ratingBand(p.user.rating);
            return (
              <div key={p.user.id} className="flex items-center gap-2 py-2">
                <span className="w-6 text-xs text-muted tabular">{i + 1}</span>
                <Avatar name={p.user.name} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.user.name}</p>
                  <p className="text-[.68rem] text-muted">
                    {p.games} games &middot; {p.wins}W {p.losses}L &middot; {p.winRate.toFixed(0)}%
                  </p>
                </div>
                <div className="flex gap-0.5">
                  {p.recentForm.slice(0, 5).map((f, j) => (
                    <span
                      key={j}
                      className={`grid h-4 w-4 place-items-center rounded text-[.55rem] font-bold ${
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
                <div className="w-20 text-right">
                  <p className="text-sm font-bold tabular" style={{ color: band.color }}>
                    {Math.round(p.user.rating)}
                  </p>
                  <p className="text-[.58rem] uppercase tracking-wider text-muted">{band.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label">Partnerships</h2>
        <div className="mt-2 divide-y divide-line/60">
          {played.slice(0, 12).map((p) => (
            <div key={p.user.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="w-32 shrink-0 truncate font-medium">{p.user.name}</span>
              <span className="text-muted">
                plays most with{" "}
                <span className="text-chalk">{p.favouritePartner?.name ?? "-"}</span>
                {p.frequentOpponent && (
                  <>
                    , usually up against{" "}
                    <span className="text-chalk">{p.frequentOpponent.name}</span>
                  </>
                )}
              </span>
              <span className="ml-auto text-xs text-muted tabular">
                {p.sessionsAttended} sessions &middot; {p.avgGamesPerSession.toFixed(1)} games each
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
