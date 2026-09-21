import Link from "next/link";
import { MemberGate, canSeeSession } from "@/components/MemberGate";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Elapsed } from "@/components/Elapsed";
import { getBoard, getSessionByCode, listAnnouncements } from "@/server/queries";
import { currentUserId, isStaffFor } from "@/lib/identity";
import { canStaff, currentAccount } from "@/lib/auth";
import { markAnnouncementsRead } from "@/server/actions";
import { Announcements } from "@/components/Announcements";
import { availabilityAction, cancelAction, checkInAction, joinAction } from "@/server/form-actions";
import { estimateQueuePosition } from "@/lib/queue-engine";
import { clockTime, money, minutesSince } from "@/lib/format";

export const dynamic = "force-dynamic";

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

  return (
    <div className="space-y-4">
      {isLive && <LiveRefresh seconds={6} />}

      <Announcements
        rows={notices}
        groupId={session.groupId}
        sessionId={session.id}
        canPost={staff}
        collapseRead
        title="Tell everyone playing tonight"
      />

      {!userId && (
        <div className="card border-shuttle/40 p-4">
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
        <section className="card p-4">
          <p className="label">Your status</p>

          {myMatch ? (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <span className="chip chip-live">
                  {myMatch.status === "playing" ? "Playing now" : "You're up"}
                </span>
                <span className="text-lg font-extrabold">Court {myMatch.court}</span>
                {myMatch.startedAt && (
                  <span className="ml-auto text-sm text-muted">
                    <Elapsed since={myMatch.startedAt.getTime()} />
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="label">With you</p>
                  {partner && (
                    <div className="mt-1 flex items-center gap-2">
                      <Avatar name={partner.name} size={28} />
                      <span className="text-sm font-semibold">{partner.name}</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="label">Against</p>
                  <div className="mt-1 space-y-1">
                    {opponents.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <Avatar name={p.name} size={28} dim />
                        <span className="text-sm">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : me?.checkedInAt ? (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <span className={`chip ${me.availability === "available" ? "chip-teal" : "chip-amber"}`}>
                  {me.availability === "available" ? "Waiting" : me.availability === "resting" ? "Resting" : "Left"}
                </span>
                {queue && me.availability === "available" && (
                  <span className="text-sm font-semibold text-shuttle">{queue.label}</span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Games" value={String(me.gamesPlayed)} />
                <Stat label="Waiting" value={`${minutesSince(me.lastFinishedAt ?? me.checkedInAt)}m`} />
                <Stat
                  label="Fewer games"
                  value={String(
                    board.roster.filter(
                      (r) => r.checkedInAt && r.availability !== "left" && r.gamesPlayed < me.gamesPlayed,
                    ).length,
                  )}
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
                    <SubmitButton className="btn btn-teal btn-sm">I&apos;m back in</SubmitButton>
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
                  <span className="text-amber">{money(session.fee, session.currency)} pending</span>
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
                    <SubmitButton className="btn btn-primary" pendingLabel="Booking...">
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
                    <SubmitButton className="btn btn-teal">I&apos;m at the venue</SubmitButton>
                  </form>
                )}
              </div>
            </div>
          )}
        </section>
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
            {board.courts.map((c) => (
              <div key={c.court} className={`court p-4 ${c.match ? "court-live" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold">Court {c.court}</span>
                  <span className={`chip ${c.match ? "chip-live" : "chip-teal"}`}>
                    {c.match ? (c.match.status === "playing" ? "Playing" : "Starting") : "Open"}
                  </span>
                  {c.match?.startedAt && (
                    <span className="ml-auto text-xs text-muted">
                      <Elapsed since={c.match.startedAt.getTime()} />
                    </span>
                  )}
                </div>
                {c.match ? (
                  <div className="mt-3 space-y-2">
                    <TeamLine players={c.match.teamA} />
                    <div className="court-net" />
                    <TeamLine players={c.match.teamB} />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">Waiting for the coordinator.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------- next up ------ */}
      {isLive && board.ranked.length > 0 && (
        <section className="card p-4">
          <h2 className="label">Next up</h2>
          <ol className="mt-2 space-y-1">
            {board.ranked.slice(0, 8).map((r, i) => (
              <li
                key={r.player.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                  r.player.id === userId ? "bg-surface-2" : ""
                }`}
              >
                <span className="w-5 text-xs text-muted tabular">{i + 1}</span>
                <Avatar name={r.player.name} size={24} dim />
                <span className="min-w-0 flex-1 truncate text-sm">{r.player.name}</span>
                <span className="text-xs text-muted tabular">
                  {r.player.gamesPlayed} games &middot; {Math.round(r.waitedMs / 60000)}m
                </span>
              </li>
            ))}
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
          {confirmed.map((r) => (
            <div key={r.userId} className="flex items-center gap-2 rounded-lg px-1 py-1">
              <Avatar name={r.name} size={26} dim={!r.checkedInAt} />
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

      <p className="text-center text-xs text-muted">
        Share this session: <span className="font-mono text-chalk">/s/{session.code}</span>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-court p-2">
      <p className="text-lg font-extrabold tabular">{value}</p>
      <p className="text-[.62rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function TeamLine({ players }: { players: { id: string; name: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {players.map((p) => (
        <span key={p.id} className="flex items-center gap-1.5">
          <Avatar name={p.name} size={22} />
          <span className="text-sm font-semibold">{p.name}</span>
        </span>
      ))}
    </div>
  );
}
