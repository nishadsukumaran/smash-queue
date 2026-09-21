import { redirect } from "next/navigation";
import { RequestCommunityForm } from "@/components/AccountForms";
import { currentAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewCommunityPage() {
  const account = await currentAccount();
  if (!account) redirect("/signin?next=/communities/new");
  if (!account.onboarded) redirect("/welcome?next=/communities/new");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <section>
        <p className="label">Start a community</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Run your own</h1>
        <p className="mt-2 text-sm text-muted">
          {account.platformAdmin
            ? "You run the platform, so there's nobody to ask: it's created straight away and you'll own it. To set one up for somebody else, use HQ."
            : "Tell us a little about your crowd. Once it's approved you'll be its owner, and you can set up venues, sessions and invitations straight away."}
        </p>
      </section>
      <RequestCommunityForm direct={account.platformAdmin} />
    </div>
  );
}
