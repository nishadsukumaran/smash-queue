import Link from "next/link";
import { MemberGate, canSeeSession } from "@/components/MemberGate";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Elapsed } from "@/components/Elapsed";
import { Shuttle } from "@/components/Shuttle";
import { CountUp } from "@/components/motion/CountUp";
import { WinBurst, lastFinished } from "@/components/motion/WinBurst";
import { getBoard, getSessionByCode, listAnnouncements } from "@/server/queries";
import { currentUserId, isStaffFor } from "@/lib/identity";
import { canStaff, currentAccount } from "@/lib/auth";
import { markAnnouncementsRead } from "@/server/actions";
import { Announcements } from "@/components/Announcements";
import { availabilityAction, cancelAction, checkInAction, joinAction } from "@/server/form-actions";
import { estimateQueuePosition } from "@/lib/queue-engine";
import { clockTime, money, minutesSince } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Stagger index, kept out of the markup so the JSX stays readable. */
const step = (i: number) => ({ "--i": i }) as CSSProperties;

export default async function SessionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();
  if (!(await canSeeSession(session.groupId)))
    return <MemberGate groupId={session.groupId} code={session.code}>{null}</MemberGate>;

  const [board, userId] = await Promise.all([getBoard(session.id), currentUserId()]);
  if (!board) notFound();

  const [account, pinStaff] = await Promise.all([currentAccount(), isStaffFor(session.groupId)]);
  const staff = canStaff(account, session.groupId) || pinStaff;
  const notices = await listAnnouncements(session.groupId, {
    sessionId: session.id,
    viewerId: userId,
  });

  // Marked read on render rather than behind a button. They have been shown
  // the text; asking them to also acknowledge it is a second job nobody does,
  // and an unread badge that never clears is worse than none.
  const unreadIds = notices.filter((n) => n.unread).map((n) => n.announcement.id);
  if (userId && unreadIds.length) await markAnnouncementsRead(unreadIds, userId);

  const me = board.roster.find((r) => r.userId === userId) ?? null;
  const confirmed = board.roster.filter((r) => r.bookingStatus === "confirmed");
  const waitlist = board.roster
    .filter((r) => r.bookingStatus === "waitlisted")
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));

  const isLive = session.status === "live";
  const freeCourts = board.courts.filter((c) => !c.match).length;
  const queue = userId ? estimateQueuePosition(userId, board.ranked, freeCourts) : null;

  const myMatch = board.matches.find(
    (m) =>
      (m.status === "playing" || m.status === "pending") &&
      [...m.teamA, ...m.teamB].some((p) => p.id === userId),
  );
  const partner = myMatch
    ? [...myMatch.teamA, ...myMatch.teamB].find(
        (p) =>
          p.id !== userId &&
          myMatch.teamA.some((x) => x.id === p.id) === myMatch.teamA.some((x) => x.id === userId),
      )
    : null;
  const opponents = myMatch
    ? (myMatch.teamA.some((p) => p.id === userId) ? myMatch.teamB : myMatch.teamA)
    : [];

  const justFinished = isLive ? lastFinished(board.matches) : null;

  return (
    <div className="space-y-4 pb-6">
      {isLive && <LiveRefresh seconds={6} />}
      {isLive && <WinBurst match={justFinished} />}

      <Announcements
        rows={notices}
        groupId={session.groupId}
        sessionId={session.id}
        canPost={staff}
        collapseRead
        title="Tell everyone playing tonight"
      />

      {!userId && (
        <div className="card rise border-shuttle/40 p-4">
          <p className="text-sm font-semibold">First, who are you?</p>
          <p className="mt-1 text-sm text-muted">
            Tap your name from the group list, or add yourself if you&apos;re new. No password,
            nothing to install.
          </p>
          <Link href={`/who?next=/s/${session.code}`} className="btn btn-primary mt-3">
            Pick your name
          </Link>
        </div>
      )}

      {/* ------------------------------------------------ your status ---- */}
      {userId && (
        <>
          {myMatch ? (
            /*
             * The one screen state that has to work from three metres away,
             * held at arm's length, in a hall with the lights on. Court number
             * is the largest thing on the phone for a reason.
             */
            <section className="court court-live celebrate rise p-5">
              <div className="relative">
                <div className="flex items-center gap-2">
                  <span className="live-dot" />
                  <span className="chip chip-live">
                    {myMatch.status === "playing" ? "Playing now" : "You're up"}
                  </span>
                  {myMatch.startedAt && (
                    <span className="ml-auto text-sm font-semibold text-shuttle tabular">
                      <Elapsed since={myMatch.startedAt.getTime()} />
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline gap-3">
                  <span className="text-[.66rem] uppercase tracking-[.22em] text-muted">Court</span>
                  <span className="pop text-6xl font-extrabold leading-none tracking-tight text-shuttle">
                    {myMatch.court}
                  </span>
                  <span className="ml-auto text-shuttle/70 shuttle-spin">
                    <Shuttle size={26} />
                  </span>
                </div>

                <div className="mt-5 rounded-xl border border-line/70 bg-ink/40 p-3">
                  <p className="label">With you</p>
                  {partner ? (
                    <div className="mt-1.5 flex items-center gap-2 rise" style={step(1)}>
                      <Avatar name={partner.name} size={32} onCourt />
                      <span className="text-base font-bold">{partner.name}</span>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted">Just you so far.</p>
                  )}

                  <div className="court-net my-3" />

                  <p className="label">Against</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                    {opponents.map((p, i) => (
                      <span key={p.id} className="flex items-center gap-2 rise" style={step(i + 2)}>
                        <Avatar name={p.name} size={28} />
                        <span className="text-sm font-semibold">{p.name}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <p className="mt-3 text-center text-xs text-muted">
                  {myMatch.status === "playing"
                    ? `First to ${session.pointsTo}. Good luck.`
                    : "Head to the court, the coordinator is about to start you."}
                </p>
              </div>
            </section>
          ) : (
            <section className="card rise p-4">
              <p className="label">Your status</p>

              {me?.checkedInAt ? (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`chip ${me.availability === "available" ? "chip-teal" : "chip-amber"}`}
                    >
                      {me.availability === "available"
                        ? "Waiting"
                        : me.availability === "resting"
                          ? "Resting"
                          : "Left"}
                    </span>
                    {queue && me.availability === "available" && (
                      <span className="text-sm font-bold text-shuttle">{queue.label}</span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Games" value={me.gamesPlayed} i={0} />
                    <Stat
                      label="Waiting"
                      value={minutesSince(me.lastFinishedAt ?? me.checkedInAt)}
                      suffix="m"
                      i={1}
                    />
                    <Stat
                      label="Fewer games"
                      value={
                        board.roster.filter(
                          (r) =>
                            r.checkedInAt &&
                            r.availability !== "left" &&
                            r.gamesPlayed < me.gamesPlayed,
                        ).length
                      }
                      i={2}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {me.availability === "available" ? (
                      <form action={availabilityAction}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <input type="hidden" name="availability" value="resting" />
                        <SubmitButton className="btn btn-ghost btn-sm">Sit out a game</SubmitButton>
                      </form>
                    ) : (
                      <form action={availabilityAction}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <input type="hidden" name="availability" value="available" />
                        <SubmitButton className="btn btn-teal btn-sm" haptic="confirm">
                          I&apos;m back in
                        </SubmitButton>
                      </form>
                    )}
                    <form action={availabilityAction}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="availability" value="left" />
                      <SubmitButton className="btn btn-danger btn-sm">Heading home</SubmitButton>
                    </form>
                  </div>

                  <p className="mt-3 text-xs text-muted">
                    Checked in at {clockTime(me.checkedInAt)} &middot; Fee{" "}
                    {me.paymentStatus === "paid" ? (
                      <span className="text-teal">paid</span>
                    ) : me.paymentStatus === "waived" ? (
                      <span className="text-muted">waived</span>
                    ) : (
                      <span className="text-amber">
                        {money(session.fee, session.currency)} pending
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <div className="mt-2">
                  {me?.bookingStatus === "confirmed" || me?.bookingStatus === "waitlisted" ? (
                    <p className="text-sm text-muted">
                      {me.bookingStatus === "waitlisted"
                        ? `You are number ${me.waitlistPosition} on the waitlist.`
                        : "You are booked in. Scan the QR code at the venue to check in."}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">You have not booked this session yet.</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!me || me.bookingStatus === "cancelled" || me.bookingStatus === "no_show" ? (
                      <form action={joinAction}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <SubmitButton
                          className="btn btn-primary"
                          pendingLabel="Booking..."
                          haptic="confirm"
                        >
                          {confirmed.length >= session.capacity ? "Join waitlist" : "Join session"}
                        </SubmitButton>
                      </form>
                    ) : (
                      <form action={cancelAction}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <SubmitButton className="btn btn-danger btn-sm">Cancel my slot</SubmitButton>
                      </form>
                    )}
                    {isLive && (
                      <form action={checkInAction}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <input type="hidden" name="method" value="self" />
                        <SubmitButton className="btn btn-teal" haptic="confirm">
                          I&apos;m at the venue
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* ---------------------------------------------------- courts ----- */}
      {isLive && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="label">Courts</h2>
            <span className="ml-auto text-xs text-muted">
              {board.checkedInCount} checked in &middot; fairness {board.fairness.score}%
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {board.courts.map((c, i) => (
              <div
                key={c.court}
                className={`court rise p-4 ${c.match ? "court-live" : "court-open"}`}
                style={step(i)}
              >
                <div className="relative flex items-center gap-2">
                  <span className="text-sm font-extrabold">Court {c.court}</span>
                  <span className={`chip ${c.match ? "chip-live" : "chip-teal"}`}>
                    {c.match ? (c.match.status === "playing" ? "Playing" : "Starting") : "Open"}
                  </span>
                  {c.match?.startedAt && (
                    <span className="ml-auto text-xs text-muted tabular">
                      <Elapsed since={c.match.startedAt.getTime()} />
                    </span>
                  )}
                </div>
                {c.match ? (
                  <div className="relative mt-3 space-y-2">
                    <TeamLine players={c.match.teamA} highlight={userId} />
                    <div className="court-net" />
                    <TeamLine players={c.match.teamB} highlight={userId} />
                  </div>
                ) : (
                  <p className="relative mt-4 text-sm text-muted">Waiting for the coordinator.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------- next up ------ */}
      {isLive && board.ranked.length > 0 && (
        <section className="card p-4">
          <div className="flex items-center gap-2">
            <h2 className="label">Next up</h2>
            <span className="ml-auto text-[.65rem] uppercase tracking-wider text-muted">
              fewest games first
            </span>
          </div>
          <ol className="mt-2 space-y-1">
            {board.ranked.slice(0, 8).map((r, i) => {
              const mine = r.player.id === userId;
              return (
                <li
                  key={r.player.id}
                  className={`rise flex items-center gap-2 rounded-xl px-2 py-1.5 ${
                    mine ? "queue-me" : ""
                  }`}
                  style={step(i)}
                >
                  <span
                    className={`w-5 text-center text-xs tabular ${
                      i === 0 ? "font-bold text-shuttle" : "text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <Avatar name={r.player.name} size={24} dim={!mine} />
                  <span className={`min-w-0 flex-1 truncate text-sm ${mine ? "font-bold" : ""}`}>
                    {r.player.name}
                    {mine && <span className="ml-1.5 text-xs text-shuttle">you</span>}
                  </span>
                  <span className="text-xs text-muted tabular">
                    {r.player.gamesPlayed} games &middot; {Math.round(r.waitedMs / 60000)}m
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ------------------------------------------------- the list ------ */}
      <section className="card p-4">
        <div className="flex items-center gap-2">
          <h2 className="label">
            {isLive ? "Everyone here" : "Confirmed"} ({confirmed.length}/{session.capacity})
          </h2>
        </div>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {confirmed.map((r, i) => (
            <div
              key={r.userId}
              className="rise flex items-center gap-2 rounded-lg px-1 py-1"
              style={step(Math.min(i, 16))}
            >
              <Avatar
                name={r.name}
                size={26}
                dim={!r.checkedInAt}
                onCourt={isLive && r.onCourt !== null}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
              {isLive &&
                (r.onCourt !== null ? (
                  <span className="chip chip-live">C{r.onCourt}</span>
                ) : r.checkedInAt ? (
                  <span className="text-xs text-muted tabular">{r.gamesPlayed}</span>
                ) : (
                  <span className="chip">Not here</span>
                ))}
            </div>
          ))}
        </div>

        {waitlist.length > 0 && (
          <>
            <h3 className="label mt-4">Waitlist</h3>
            <ol className="mt-2 space-y-1">
              {waitlist.map((r) => (
                <li key={r.userId} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-xs text-muted tabular">{r.waitlistPosition}</span>
                  <Avatar name={r.name} size={22} dim />
                  <span className="truncate">{r.name}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <p className="safe-bottom text-center text-xs text-muted">
        Share this session: <span className="font-mono text-chalk">/s/{session.code}</span>
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix = "",
  i = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  i?: number;
}) {
  return (
    <div className="pop rounded-xl border border-line bg-court p-2" style={step(i)}>
      <p className="text-lg font-extrabold">
        <CountUp value={value} suffix={suffix} />
      </p>
      <p className="text-[.62rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function TeamLine({
  players,
  highlight,
}: {
  players: { id: string; name: string }[];
  highlight?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {players.map((p) => {
        const mine = p.id === highlight;
        return (
          <span key={p.id} className="flex items-center gap-1.5">
            <Avatar name={p.name} size={22} onCourt={mine} />
            <span className={`text-sm font-semibold ${mine ? "text-shuttle" : ""}`}>{p.name}</span>
          </span>
        );
      })}
    </div>
  );
}
