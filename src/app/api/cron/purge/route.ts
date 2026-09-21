import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredCommunities } from "@/lib/purge";

/**
 * Daily: erases communities whose 30-day recovery window has passed.
 *
 * Vercel's scheduler calls this with `Authorization: Bearer $CRON_SECRET`.
 * Without that header — or with no secret configured — it does nothing, so
 * the URL being public costs nothing.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const purged = await purgeExpiredCommunities();
  return NextResponse.json({ ok: true, purged: purged.length });
}
