import { NextResponse, type NextRequest } from "next/server";
import { currentAccount, redeemMagicLink, pruneAuth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

/**
 * The other end of the magic link.
 *
 * A Route Handler rather than a page, because redeeming sets the session
 * cookie and Next only permits cookie writes from a Route Handler or a Server
 * Action. A Server Component that tried would throw at runtime — which it did,
 * before this was moved.
 *
 * It redeems on GET, which is the ergonomics people expect from a link in an
 * email, at the cost of an aggressive mail scanner occasionally burning a token
 * by prefetching it. That is survivable: the failure mode is "request another
 * link", the tokens last fifteen minutes, and the alternative is an extra
 * "click here to confirm" page that every real user has to click through.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const next = safeNext(req.nextUrl.searchParams.get("next") ?? undefined);

  if (token) {
    const userId = await redeemMagicLink(token);
    if (userId) {
      await pruneAuth();
      // A brand-new account confirms its name (and can set a PIN) first.
      const account = await currentAccount();
      const target =
        account && !account.onboarded ? `/welcome?next=${encodeURIComponent(next)}` : next;
      return NextResponse.redirect(new URL(target, req.nextUrl.origin));
    }
  }

  // Never says which of "unknown", "expired" or "already used" it was. The
  // person can do nothing differently, and telling them apart would help
  // anyone probing tokens.
  const back = new URL("/signin", req.nextUrl.origin);
  back.searchParams.set("expired", "1");
  back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}
