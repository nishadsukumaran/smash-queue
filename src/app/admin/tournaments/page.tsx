import Link from "next/link";
import { activeCommunity } from "@/lib/tenant";
import { listGroupTournaments } from "@/server/tournament-queries";
import { Flash, StatusChip, dateRange } from "@/components/tournament/bits";

export const dynamic = "force-dynamic";

export default async function AdminTournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; e?: string }>;
}) {
  const sp = await searchParams;
  const active = await activeCommunity();
  if (!active) return null;
  const list = await listGroupTournaments(active.group.id);

  return (
    <div className="space-y-3">
      <Flash m={sp.m} e={sp.e} />
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Tournaments</h2>
          <p className="text-sm text-muted">
            Announce one, take entries and fees, make the draws and record results. Members only or
            open to every SmashQ player.
          </p>
        </div>
        <Link href="/admin/tournaments/new" className="btn btn-primary">New tournament</Link>
      </div>

      {list.length === 0 && <p className="card p-4 text-sm text-muted">No tournaments yet.</p>}
      {list.map((t) => (
        <Link key={t.id} href={`/admin/tournaments/${t.id}`} className="card flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold">{t.name}</p>
            <p className="text-xs text-muted">
              {dateRange(t.startDate, t.endDate)} · {t.visibility === "public" ? "Open to all" : "Members only"} · /t/{t.code}
            </p>
          </div>
          <StatusChip status={t.status} />
        </Link>
      ))}
    </div>
  );
}
