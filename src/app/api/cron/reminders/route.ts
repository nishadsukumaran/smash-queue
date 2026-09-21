import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bookings, groups, sessions, venues } from "@/db/schema";
import { pushNow } from "@/lib/push";
import { prettyTime } from "@/lib/format";

/**
 * Daily, early afternoon in the community's time zone: "tonight you're
 * playing". Only to people with a confirmed booking — they asked for this
 * session, so a reminder about it is theirs to receive.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const tz = process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Dubai";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const tonight = await db
    .select({ s: sessions, venue: venues.name })
    .from(sessions)
    .innerJoin(groups, eq(groups.id, sessions.groupId))
    .leftJoin(venues, eq(venues.id, sessions.venueId))
    .where(
      and(
        eq(sessions.date, today),
        inArray(sessions.status, ["scheduled", "live"]),
        isNull(groups.deletedAt),
        isNull(groups.archivedAt),
      ),
    );

  let sent = 0;
  for (const { s, venue } of tonight) {
    const booked = await db
      .select({ userId: bookings.userId })
      .from(bookings)
      .where(and(eq(bookings.sessionId, s.id), eq(bookings.status, "confirmed")));
    const res = await pushNow(
      booked.map((b) => b.userId),
      {
        title: `Today: ${s.name}`,
        body: `${prettyTime(s.startTime)}${venue ? ` at ${venue}` : ""}. Can't make it? Cancel so the waitlist moves.`,
        url: `/s/${s.code}`,
        tag: `reminder-${s.id}`,
      },
    );
    sent += res.sent;
  }

  return NextResponse.json({ ok: true, sessions: tonight.length, sent });
}
