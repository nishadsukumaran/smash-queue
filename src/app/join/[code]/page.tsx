import { redirect } from "next/navigation";
import { getGroupByInviteCode } from "@/server/queries";
import { currentAccount } from "@/lib/auth";
import { JOIN_MISSES_PER_HOUR, joinKey, overLimit, recordMiss } from "@/lib/rate";

export const dynamic = "force-dynamic";

/**
 * The shareable link: /join/<CODE>.
 *
 * It resolves the code and hands over to the community's own page, which
 * already knows how to show what the place is and how to get in. Keeping the
 * join experience in one screen means the WhatsApp link and the directory
 * lead to the same place, and there is only one set of copy to keep honest.
 *
 * A code that matches nothing goes to the directory rather than a 404: a
 * mistyped character is the likeliest reason to be here, and "here is the
 * list, or type the code again" is more use than a dead end.
 */
export default async function JoinByCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  // Codes are four characters, so they only resolve for a signed-in account,
  // and wrong ones count against it. Otherwise this URL would tell a script
  // which of the 1.3 million codes are real, and whose community each opens.
  const account = await currentAccount();
  if (!account) redirect(`/signin?next=${encodeURIComponent(`/join/${clean}`)}`);
  if (await overLimit(joinKey(account.id), JOIN_MISSES_PER_HOUR)) redirect("/communities?code=unknown");

  const group = await getGroupByInviteCode(clean);
  if (!group || group.archivedAt || group.deletedAt) {
    await recordMiss(joinKey(account.id));
    redirect("/communities?code=unknown");
  }
  redirect(`/c/${group.slug}`);
}
