import { redirect } from "next/navigation";
import { getGroupByInviteCode } from "@/server/queries";

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
  const group = await getGroupByInviteCode(code.replace(/[^A-Za-z0-9]/g, ""));
  if (!group || group.archivedAt) redirect("/communities?code=unknown");
  redirect(`/c/${group.slug}`);
}
