import Link from "next/link";
import { activeCommunity } from "@/lib/tenant";
import { getRoster, listSessions } from "@/server/queries";
import { money, prettyDate, prettyTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const active = await activeCommunity();
  if (!active) return null;
  const group = active.group;

  const all = await listSessions(group.id);
  const rosters = await Promise.all(all.map((s) => getRoster(s.id)));

  const live = all.filter((s) => s.status === "live");
  const upcoming = all.filter((s) => s.status === "scheduled");
  const closed = all.filter((s) => s.status === "closed");

  const totals = closed.reduce(
    (acc, s, i) => {
      const roster = rosters[all.indexOf(s)];
      acc.collected += roster.filter((r) => r.paymentStatus === "paid").length * s.fee;
      acc.attendance += roster.filter((r) => r.checkedInAt).length;
      return acc;
    },
    { collected: 0, attendance: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Sessions run" value={String(closed.length)} />
        <Tile
          label="Avg attendance"
          value={closed.length ? (totals.attendance / closed.length).toFixed(0) : "0"}
        />
        <Tile label="Collected" value={money(totals.collected, group.currency)} />
      </div>

      {live.length > 0 && (
        <section className="space-y-2">
          <h2 className="label">Live now</h2>
          {live.map((s) => (
            <Link key={s.id} href={`/s/${s.code}/board`} className="court block p-4">
              <div className="flex items-center gap-2">
                <span className="live-dot" />
                <span className="font-bold">{s.name}</span>
                <span className="ml-auto chip chip-live">Open the board</span>
              </div>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="label">Scheduled</h2>
        {upcoming.length === 0 && (
          <p className="card p-4 text-sm text-muted">
            Nothing on the calendar.{" "}
            <Link href="/admin/new" className="text-teal underline">
              Create a session
            </Link>
            .
          </p>
        )}
        {upcoming.map((s) => {
          const roster = rosters[all.indexOf(s)];
          const confirmed = roster.filter((r) => r.bookingStatus === "confirmed").length;
          const waiting = roster.filter((r) => r.bookingStatus === "waitlisted").length;
          return (
            <div key={s.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{s.name}</p>
                  <p className="text-sm text-muted">
                    {prettyDate(s.date)} &middot; {prettyTime(s.startTime)} &middot; {s.courtCount} courts
                    &middot; {money(s.fee, s.currency)}
                  </p>
                </div>
                <span className="chip">
                  {confirmed}/{s.capacity}
                </span>
                {waiting > 0 && <span className="chip chip-amber">{waiting} waiting</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/s/${s.code}`} className="btn btn-ghost btn-sm">
                  Booking page
                </Link>
                <Link href={`/s/${s.code}/qr`} className="btn btn-ghost btn-sm">
                  QR code
                </Link>
                <Link href={`/s/${s.code}/board`} className="btn btn-primary btn-sm">
                  Court board
                </Link>
                <span className="ml-auto self-center font-mono text-xs text-muted">{s.code}</span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="label">History</h2>
        <div className="card divide-y divide-line">
          {closed.map((s) => {
            const roster = rosters[all.indexOf(s)];
            return (
              <Link
                key={s.id}
                href={`/s/${s.code}/summary`}
                className="flex items-center gap-3 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">
                    {prettyDate(s.date)} &middot; {roster.filter((r) => r.checkedInAt).length} players
                  </p>
                </div>
                <span className="chip">Summary</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-lg font-extrabold tabular">{value}</p>
      <p className="text-[.6rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
