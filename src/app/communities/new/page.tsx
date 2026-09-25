import { redirect } from "next/navigation";
import { RequestCommunityForm } from "@/components/AccountForms";
import { currentAccount } from "@/lib/auth";
import { canStartFreely } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function NewCommunityPage() {
  const account = await currentAccount();
  if (!account) redirect("/signin?next=/communities/new");
  if (!account.onboarded) redirect("/welcome?next=/communities/new");
  const free = await canStartFreely(account.id, account.platformAdmin);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <section>
        <p className="label">Start a community</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Run your own</h1>
        <p className="mt-2 text-sm text-muted">
          {free
            ? "Your first community is yours to start: it's created straight away, you own it, and you can set up venues, sessions and invitations right after."
            : "You already run a community, so this one goes to the platform for a quick look. Tell us a little about the crowd it's for. Once it's approved you'll own it too."}
        </p>
      </section>
      <RequestCommunityForm direct={free} />
    </div>
  );
}
