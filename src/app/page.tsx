// Drop-in replacement for src/app/page.tsx
// Uses only existing queries, components and Tailwind theme tokens.
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Avatar } from "@/components/Avatar";
import { Announcements } from "@/components/Announcements";
import { CommunitySwitcher } from "@/components/CommunitySwitcher";
import {
  getBoard, getPlayerView, getRoster, getVenue, listAnnouncements, listSessions,
  type BoardData, type PlayerView, type RosterEntry,
} from "@/server/queries";
import { currentUserId, isStaffFor } from "@/lib/identity";
import { canStaff, currentAccount, isPlatformAdmin } from "@/lib/auth";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";
import { activeCommunity, myCommunities } from "@/lib/tenant";
import { markAnnouncementsRead } from "@/server/actions";
import { clockTime, minutesSince, money, prettyDate, prettyDateTime, prettyTime, TIME_ZONE } from "@/lib/format";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

export default async function Home() {
  const account = await currentAccount();
  const active = await activeCommunity(account);
  if (!active) redirect("/communities");
  const group = active.group;

  const [mine, all, userId, staff] = await Promise.all([
    myCommunities(account),
    listSessions(group.id),
    currentUserId(),
    isStaffFor(group.id),
  ]);
  const me = userId ? (await db.select().from(users).where(eq(users.id, userId)))[0] ?? null : null;

  const notices = await listAnnouncements(group.id, { viewerId: userId });
  const unreadIds = notices.filter((n) => n.unread).map((n) => n.announcement.id);
  if (userId && unreadIds.length) await markAnnouncementsRead(unreadIds, userId);

  const live = all.find((s) => s.status === "live") ?? null;
  const upcoming = all.filter((s) => s.status === "scheduled").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const past = all.filter((s) => s.status === "closed").slice(0, 4);

  const [board, pv, upRosters, pastBoards] = await Promise.all([
    live ? getBoard(live.id) : Promise.resolve(null),
    live ? getPlayerView(live.id, userId) : Promise.resolve(null),
    Promise.all(upcoming.map((s) => getRoster(s.id))),
    Promise.all(past.map((s) => getBoard(s.id))),
  ]);
  const liveVenue = live ? await getVenue(live.venueId) : null;

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE });
  const hour = Number(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: TIME_ZONE }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = me?.name.split(" ")[0];

  return (
    <div className="space-y-4">
      <CommunitySwitcher mine={mine} activeId={group.id} />

      {/* greeting + nav */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="rise" style={step(0)}>
          <p className="label">{today}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
            <br />
            <span className="font-semibold text-muted">
              {live ? "Courts are live tonight." : upcoming[0] ? `Next up: ${prettyDate(upcoming[0].date)}.` : "Nothing scheduled yet."}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 rise" style={step(1)}>
          {!userId && <Link href="/who" className="btn btn-primary">Pick your name</Link>}
          <Link href="/guide" className="btn btn-ghost">How it works</Link>
          <Link href="/members" className="btn btn-ghost">Members</Link>
          <Link href="/communities" className="btn btn-ghost">Communities</Link>
          <Link href="/admin" className="btn btn-ghost">{staff || canStaff(account, group.id) ? "Organizer" : "Organizer sign in"}</Link>
          {isPlatformAdmin(account) && <Link href="/hq" className="btn btn-ghost">Platform</Link>}
        </div>
      </div>

      {/* hero row: live session + you */}
      {live && board && (
        <section className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <LiveCard session={live} board={board} venue={liveVenue?.name ?? null} />
          <div className="flex flex-col gap-3">
            {userId ? <YouTonight pv={pv} code={live.code} /> : <GuestCard />}
            <Link href={`/s/${live.code}`} className="card flex items-center gap-3 border-teal/40 bg-teal/10 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal text-[#04241A]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 9V4h5M16 4h5v5M21 15v5h-5M8 20H3v-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">Scan the QR at the door</span>
                <span className="block text-xs text-muted">Check-in is open for {live.name}</span>
              </span>
              <span className="ml-auto font-bold text-teal">→</span>
            </Link>
          </div>
        </section>
      )}

      {/* upcoming + notices */}
      <section className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="label">Upcoming sessions</h2>
          </div>
          {upcoming.length === 0 && <p className="text-sm text-muted">Nothing scheduled yet.</p>}
          <div className="divide-y divide-line/70">
            {upcoming.map((s, i) => {
              const roster = upRosters[i] ?? [];
              const confirmed = roster.filter((r) => r.bookingStatus === "confirmed").length;
              const waiting = roster.filter((r) => r.bookingStatus === "waitlisted").length;
              const my = roster.find((r) => r.userId === userId);
              const full = confirmed >= s.capacity;
              const d = new Date(`${s.date}T12:00:00Z`);
              const dow = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TIME_ZONE });
              const day = d.toLocaleDateString("en-GB", { day: "numeric", timeZone: TIME_ZONE });
              const chip = my?.bookingStatus === "confirmed"
                ? { cls: "chip-live", text: "You are in" }
                : my?.bookingStatus === "waitlisted"
                  ? { cls: "chip-amber", text: `Waitlist #${my.waitlistPosition}` }
                  : full ? { cls: "chip-amber", text: `${confirmed} / ${s.capacity} full` }
                    : { cls: "chip-teal", text: `${confirmed} / ${s.capacity} booked` };
              return (
                <Link key={s.id} href={`/s/${s.code}`} className="rise grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-4 py-3.5 hover:text-shuttle" style={step(i)}>
                  <div className="rounded-xl border border-line bg-court py-1.5 text-center">
                    <div className="label text-[10px]">{dow}</div>
                    <div className="text-xl font-extrabold leading-none tracking-tight text-chalk">{day}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold">{s.name}</div>
                    <div className="mt-0.5 text-xs text-muted">{prettyTime(s.startTime)} · {money(s.fee, s.currency)}</div>
                    <div className="mt-2 h-1 max-w-80 overflow-hidden rounded-full bg-court">
                      <div className={`bar-fill h-full rounded-full ${full ? "bg-amber" : "bg-teal"}`} style={{ width: `${Math.min(100, (confirmed / Math.max(1, s.capacity)) * 100)}%`, ...step(i) }} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`chip whitespace-nowrap ${chip.cls}`}>{chip.text}</span>
                    <span className="text-[11px] text-muted">{waiting > 0 ? `${waiting} waiting` : full ? "Full" : `${s.capacity - confirmed} spots left`}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="card flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label">From the organizer</h2>
            {unreadIds.length > 0 && <span className="chip chip-amber whitespace-nowrap">{unreadIds.length} new</span>}
          </div>
          {notices.length === 0 && <p className="text-sm text-muted">No notices yet.</p>}
          {notices.slice(0, 3).map(({ announcement: a, author, unread }, i) => (
            <article key={a.id} className={`flex gap-3 ${!unread && i > 0 ? "opacity-70" : ""}`}>
              <Avatar name={author.name} size={30} />
              <div className="min-w-0">
                <p className="text-xs text-muted">
                  <span className="font-bold text-chalk">{author.name}</span> · {prettyDateTime(a.createdAt)}
                  {a.pinned && <> · <span className="font-bold text-teal">Pinned</span></>}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-chalk/90">{a.body}</p>
              </div>
            </article>
          ))}
          <Announcements rows={[]} groupId={group.id} canPost={canStaff(account, group.id) || staff} title="Tell the group" />
        </div>
      </section>

      {/* recent */}
      {past.length > 0 && (
        <section>
          <div className="mx-1 mb-3 flex items-baseline justify-between gap-3">
            <h2 className="label">Recent sessions</h2>
            <span className="text-xs text-muted">Fairness = how evenly games were spread</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {past.map((s, i) => {
              const b = pastBoards[i];
              const score = b?.fairness.score ?? 0;
              return (
                <Link key={s.id} href={`/s/${s.code}/summary`} className="card rise flex items-center gap-3.5 p-4 hover:bg-surface-2" style={step(i)}>
                  <FairnessRing score={score} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold leading-tight">{s.name}</div>
                    <div className="mt-0.5 text-xs text-muted">{prettyDate(s.date)} · {b?.roster.filter((r) => r.checkedInAt).length ?? 0} played</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <p className="px-1 pb-2 text-xs text-muted">
        Something not right? Tell us at{" "}
        <a href={supportMailto("Feedback")} className="text-teal hover:underline">{SUPPORT_EMAIL}</a>{" "}
        and it gets fixed.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ pieces */

function LiveCard({ session: s, board, venue }: { session: BoardData["session"]; board: BoardData; venue: string | null }) {
  const byId = new Map(board.roster.map((r) => [r.userId, r.name]));
  const name = (id: string) => byId.get(id) ?? "—";
  const played = board.matches.filter((m) => m.status === "completed").length;
  return (
    <Link href={`/s/${s.code}`} className="court court-live rise flex flex-col gap-5 p-5">
      <div className="relative flex flex-wrap items-center gap-2.5">
        <span className="live-dot" />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-shuttle">Live now</span>
        <span className="text-xs text-muted">{prettyTime(s.startTime)} – {prettyTime(s.endTime)}{venue ? ` · ${venue}` : ""}</span>
        <span className="ml-auto rounded-lg border border-line px-2 py-0.5 font-mono text-xs text-muted">{s.code}</span>
      </div>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl font-extrabold leading-none tracking-tight sm:text-3xl">{s.name}</h2>
        <div className="flex gap-6">
          <Stat n={board.checkedInCount} l="checked in" />
          <Stat n={board.availableCount} l="in queue" />
          <Stat n={played} l="games played" />
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-2.5">
        {board.courts.map((c) => {
          const m = c.match;
          const rec = c.recommendation;
          const tone = m ? "border-shuttle/40 bg-[#0F2A1F] text-shuttle" : rec ? "border-teal/40 bg-[#0D2620] text-teal" : "border-line bg-court text-muted";
          const a = m ? m.teamA.map((p) => p.name) : rec ? rec.teamA.map(name) : ["—", ""];
          const b = m ? m.teamB.map((p) => p.name) : rec ? rec.teamB.map(name) : ["—", ""];
          return (
            <div key={c.court} className={`flex min-h-24 flex-col gap-2 rounded-xl border p-3 ${tone}`}>
              <div className="flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wider">
                <span>Court {c.court}</span>
                <span className="font-mono font-semibold tracking-normal text-muted">{m ? (m.status === "playing" ? clockTime(m.startedAt) : "starting") : rec ? "next" : "open"}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs font-semibold leading-tight text-chalk">
                <div className="min-w-0">
                  <TileName name={a[0]} />
                  <TileName name={a[1]} />
                </div>
                <div className="min-w-0 text-right">
                  <TileName name={b[0]} />
                  <TileName name={b[1]} />
                </div>
              </div>
              <div className="court-net" />
            </div>
          );
        })}
      </div>
      <div className="relative flex flex-wrap items-center gap-2">
        <span className="chip whitespace-nowrap">{s.courtCount} courts</span>
        <span className="chip whitespace-nowrap">{money(s.fee, s.currency)}</span>
        <span className="chip whitespace-nowrap">{s.gameType}</span>
        <span className="ml-auto text-sm font-bold text-shuttle">Open session →</span>
      </div>
    </Link>
  );
}

/** Full name where there is room; just the first name on a phone, where four share a tile. */
function TileName({ name }: { name: string | undefined }) {
  if (!name) return <div>{"\u00a0"}</div>;
  const short = name.trim().split(/\s+/)[0];
  return (
    <div className="truncate" title={name}>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{name}</span>
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div className="tabular text-2xl font-extrabold leading-none tracking-tight sm:text-3xl">{n}</div>
      <div className="mt-1 label text-[10.5px]">{l}</div>
    </div>
  );
}

function YouTonight({ pv, code }: { pv: PlayerView | null; code: string }) {
  const me: RosterEntry | null = pv?.me ?? null;
  if (!pv || !me || !me.checkedInAt) {
    return (
      <div className="card flex flex-1 flex-col justify-between gap-4 p-5">
        <div>
          <p className="label">You tonight</p>
          <h3 className="mt-2 text-xl font-extrabold tracking-tight">{me ? "Booked, not checked in yet." : "You're not in tonight's session."}</h3>
          <p className="mt-2 text-sm text-muted">{me ? "Scan the QR at the door and you're in the queue." : "Open the session to join as a walk-in if there's room."}</p>
        </div>
        <Link href={`/s/${code}`} className="btn btn-ghost">Open session</Link>
      </div>
    );
  }
  const headline = pv.currentMatch
    ? { big: `C${pv.currentMatch.court}`, small: "on court now", line: <>Playing on Court {pv.currentMatch.court}. Finish the game to rejoin the queue.</> }
    : pv.nextMatch
      ? { big: `C${pv.nextMatch.court}`, small: "up next", line: <>You're on Court {pv.nextMatch.court} <span className="text-teal">next</span>. Head over now.</> }
      : { big: pv.queue.position ? `#${pv.queue.position}` : "—", small: "in the queue", line: <>{pv.queue.label}. {pv.freeCourts > 0 ? <span className="text-teal">A court is free.</span> : `${pv.queue.aheadCount} ahead of you.`}</> };
  const waited = minutesSince(me.lastFinishedAt ?? me.checkedInAt);
  return (
    <div className="card flex flex-1 flex-col p-5">
      <p className="label">You tonight</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="tabular text-6xl font-extrabold leading-[.9] tracking-tighter text-shuttle">{headline.big}</span>
        <span className="text-sm font-semibold text-muted">{headline.small}</span>
      </div>
      <p className="mt-3 text-[15px] font-semibold leading-snug">{headline.line}</p>
      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-4">
        <div><div className="tabular text-xl font-extrabold tracking-tight">{me.gamesPlayed}</div><div className="label text-[10px]">games</div></div>
        <div><div className="tabular text-xl font-extrabold tracking-tight">{waited}<span className="text-xs font-bold text-muted"> min</span></div><div className="label text-[10px]">waiting</div></div>
        <div><div className={`text-xl font-extrabold tracking-tight ${me.paymentStatus === "paid" ? "text-teal" : "text-amber"}`}>{me.paymentStatus === "paid" ? "Paid" : me.paymentStatus === "waived" ? "Waived" : "Unpaid"}</div><div className="label text-[10px]">{money(pv.session.fee, pv.session.currency)}</div></div>
      </div>
    </div>
  );
}

function GuestCard() {
  return (
    <div className="card flex flex-1 flex-col justify-between gap-4 p-5">
      <div>
        <p className="label">Playing tonight?</p>
        <h3 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight">Tap your name and you're in the queue.</h3>
        <p className="mt-2 text-sm text-muted">No signup, no password. Your phone remembers you next time.</p>
      </div>
      <Link href="/who" className="btn btn-primary">Pick your name</Link>
    </div>
  );
}

function FairnessRing({ score }: { score: number }) {
  const C = 2 * Math.PI * 19;
  const color = score >= 88 ? "#3DD9A4" : score >= 72 ? "#FFC24B" : "#FF6B6B";
  return (
    <span className="relative inline-block h-[46px] w-[46px] shrink-0">
      <svg width="46" height="46" viewBox="0 0 46 46" className="block">
        <circle cx="23" cy="23" r="19" fill="none" stroke="#0A1A15" strokeWidth="5" />
        <circle cx="23" cy="23" r="19" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(score / 100) * C} ${C}`} transform="rotate(-90 23 23)" />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-[11px] font-extrabold">{score}%</span>
    </span>
  );
}
