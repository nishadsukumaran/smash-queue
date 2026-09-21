import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { getLeaderboard } from "@/server/queries";
import { activeCommunity } from "@/lib/tenant";
import { currentUserId } from "@/lib/identity";
import { ratingBand } from "@/lib/fairness";

export const dynamic = "force-dynamic";

/**
 * Who else is in the group.
 *
 * Player-facing, unlike the organizer's leaderboard: no money, no roles, no
 * contact details. Phone numbers stay with the organizer — people hand those
 * over so they can be reached about a session, not so the roster can become a
 * directory of everyone's number.
 *
 * Sorted by name rather than rating. A leaderboard tells you who is winning;
 * this answers "who plays here", which is the question somebody new actually
 * has.
 */
export default async function MembersDirectoryPage() {
  const membership = await activeCommunity();
  if (!membership) redirect("/communities");
  const group = membership.group;

  const [board, meId] = await Promise.all([getLeaderboard(group.id), currentUserId()]);
  const people = [...board].sort((a, b) => a.user.name.localeCompare(b.user.name));

  const active = people.filter((p) => p.games > 0).length;
  const totalGames = people.reduce((n, p) => n + p.games, 0);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <p className="label">{group.name}</p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight">
          {people.length} {people.length === 1 ? "member" : "members"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {active} have played, {totalGames.toLocaleString()} games between them.
        </p>
      </section>

      <section className="card divide-y divide-line">
        {people.length === 0 && (
          <p className="p-4 text-sm text-muted">Nobody yet. You could be first.</p>
        )}
        {people.map((p) => {
          const band = ratingBand(p.user.rating);
          const isMe = p.user.id === meId;
          return (
            <div
              key={p.user.id}
              className={`flex items-center gap-3 p-3 ${isMe ? "bg-surface-2/40" : ""}`}
            >
              <Avatar name={p.user.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {p.user.name}
                  {isMe && <span className="ml-2 text-xs font-normal text-teal">you</span>}
                </p>
                <p className="text-xs text-muted">
                  {p.games === 0
                    ? "No games yet"
                    : `${p.games} ${p.games === 1 ? "game" : "games"} · ${p.winRate.toFixed(0)}% won`}
                </p>
              </div>
              {p.games > 0 && (
                <span className="chip shrink-0" style={{ color: band.color }}>
                  {band.label}
                </span>
              )}
            </div>
          );
        })}
      </section>

      <p className="text-center text-xs text-muted">
        Want your own numbers?{" "}
        <Link href="/me" className="text-teal hover:underline">
          Your profile
        </Link>
      </p>
    </div>
  );
}
