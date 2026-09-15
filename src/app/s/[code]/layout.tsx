import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionByCode, getVenue } from "@/server/queries";
import { isStaffFor } from "@/lib/identity";
import { money, prettyDate, prettyTime } from "@/lib/format";

export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();

  const [venue, staff] = await Promise.all([getVenue(session.venueId), isStaffFor(session.groupId)]);

  const tabs = [
    { href: `/s/${session.code}`, label: "Session" },
    ...(staff
      ? [
          { href: `/s/${session.code}/board`, label: "Court board" },
          { href: `/s/${session.code}/players`, label: "Check-in" },
          { href: `/s/${session.code}/payments`, label: "Payments" },
        ]
      : []),
    { href: `/s/${session.code}/games`, label: "Games" },
    { href: `/s/${session.code}/summary`, label: "Summary" },
  ];

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          {session.status === "live" && (
            <>
              <span className="live-dot" />
              <span className="chip chip-live">Live</span>
            </>
          )}
          {session.status === "scheduled" && <span className="chip chip-teal">Open for booking</span>}
          {session.status === "closed" && <span className="chip">Closed</span>}
          <span className="ml-auto font-mono text-xs text-muted">{session.code}</span>
        </div>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight">{session.name}</h1>
        <p className="text-sm text-muted">
          {prettyDate(session.date)} &middot; {prettyTime(session.startTime)} to{" "}
          {prettyTime(session.endTime)}
          {venue ? ` · ${venue.name}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip">{session.courtCount} courts</span>
          <span className="chip">{money(session.fee, session.currency)}</span>
          <span className="chip">to {session.pointsTo} points</span>
          <span className="chip">{session.gameType}</span>
        </div>
        {session.notes && <p className="mt-3 text-xs text-muted">{session.notes}</p>}
      </div>

      <nav className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-2">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className="btn btn-ghost btn-sm whitespace-nowrap">
              {t.label}
            </Link>
          ))}
          {staff && (
            <Link href={`/s/${session.code}/qr`} className="btn btn-ghost btn-sm whitespace-nowrap">
              QR code
            </Link>
          )}
          <Link href="/guide" className="btn btn-ghost btn-sm whitespace-nowrap">
            Guide
          </Link>
        </div>
      </nav>

      {children}
    </div>
  );
}
