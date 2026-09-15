import Link from "next/link";
import { Shuttle } from "@/components/Shuttle";
import { getGroup, listSessions, getRoster } from "@/server/queries";
import { currentUserId, isStaffFor } from "@/lib/identity";
import { money, prettyDate, prettyTime } from "@/lib/format";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function Home() {
  const group = await getGroup();
  if (!group)
    return (
      <div className="card p-6">
        <p className="text-muted">No group yet. Run <code className="text-shuttle">npm run setup</code>.</p>
      </div>
    );

  const [all, userId, staff] = await Promise.all([
    listSessions(group.id),
    currentUserId(),
    isStaffFor(group.id),
  ]);

  const live = all.filter((s) => s.status === "live");
  const upcoming = all
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = all.filter((s) => s.status === "closed").slice(0, 4);

  const rosters = await Promise.all([...live, ...upcoming].map((s) => getRoster(s.id)));
  const rosterFor = (id: string) => {
    const index = [...live, ...upcoming].findIndex((s) => s.id === id);
    return rosters[index] ?? [];
  };

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-5">
        <div className="absolute -right-8 -top-8 text-shuttle/10">
          <Shuttle size={150} />
        </div>
        <p className="label">{group.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          Book. Check in. Queue. Play.
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          The coordinator stays in control. The software handles the headache.
        </p>
        <p className="mt-3 max-w-md text-xs text-muted">
          Something not right? Tell us at{" "}
          <a href={supportMailto("Feedback")} className="text-teal hover:underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          and it gets fixed.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!userId && (
            <Link href="/who" className="btn btn-primary">
              Pick your name
            </Link>
          )}
          <Link href="/guide" className="btn btn-ghost">
            How it works
          </Link>
          <Link href="/admin" className="btn btn-ghost">
            {staff ? "Organizer" : "Organizer sign in"}
          </Link>
        </div>
      </section>

      {live.length > 0 && (
        <section className="space-y-3">
          <h2 className="label">Happening now</h2>
          {live.map((s) => {
            const roster = rosterFor(s.id);
            const checkedIn = roster.filter((r) => r.checkedInAt && r.availability !== "left").length;
            return (
              <Link key={s.id} href={`/s/${s.code}`} className="court block p-4">
                <div className="flex items-center gap-2">
                  <span className="live-dot" />
                  <span className="chip chip-live">Live</span>
                  <span className="ml-auto font-mono text-xs text-muted">{s.code}</span>
                </div>
                <h3 className="mt-2 text-lg font-bold">{s.name}</h3>
                <p className="text-sm text-muted">
                  {prettyDate(s.date)} &middot; {prettyTime(s.startTime)} to {prettyTime(s.endTime)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="chip">{checkedIn} checked in</span>
                  <span className="chip">{s.courtCount} courts</span>
                  <span className="chip">{money(s.fee, s.currency)}</span>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="label">Upcoming sessions</h2>
        {upcoming.length === 0 && (
          <p className="card p-4 text-sm text-muted">Nothing scheduled yet.</p>
        )}
        {upcoming.map((s) => {
          const roster = rosterFor(s.id);
          const confirmed = roster.filter((r) => r.bookingStatus === "confirmed").length;
          const waiting = roster.filter((r) => r.bookingStatus === "waitlisted").length;
          const mine = roster.find((r) => r.userId === userId);
          const full = confirmed >= s.capacity;
          return (
            <Link key={s.id} href={`/s/${s.code}`} className="card block p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">{s.name}</h3>
                  <p className="text-sm text-muted">
                    {prettyDate(s.date)} &middot; {prettyTime(s.startTime)} &middot; {money(s.fee, s.currency)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`chip ${full ? "chip-amber" : "chip-teal"}`}>
                      {confirmed} / {s.capacity} {full ? "full" : "booked"}
                    </span>
                    {waiting > 0 && <span className="chip">{waiting} waiting</span>}
                    {mine?.bookingStatus === "confirmed" && <span className="chip chip-live">You are in</span>}
                    {mine?.bookingStatus === "waitlisted" && (
                      <span className="chip chip-amber">Waitlist #{mine.waitlistPosition}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-xs text-muted">{s.code}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="label">Recent sessions</h2>
          <div className="card divide-y divide-line">
            {past.map((s) => (
              <Link key={s.id} href={`/s/${s.code}/summary`} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">{prettyDate(s.date)}</p>
                </div>
                <span className="chip">Summary</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
