import { redirect } from "next/navigation";
import { WelcomeForm } from "@/components/WelcomeForm";
import { currentAccount } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { claimedHistory } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  const account = await currentAccount();
  if (!account) redirect(`/signin?next=${encodeURIComponent(target)}`);
  if (account.onboarded) redirect(target);

  const history = await claimedHistory(account.id);
  const claimed = history.games > 0 || history.communities > 0 ? history : null;

  return (
    <div className="card mx-auto max-w-md p-5">
      <p className="label">You&apos;re in</p>
      <h1 className="mt-1 text-xl font-extrabold tracking-tight">Welcome to Smash Queue</h1>
      <p className="mt-2 text-sm text-muted">
        Your player number is{" "}
        <span className="font-mono text-lg font-bold text-shuttle">#{account.playerNo}</span>. Give it
        to an organizer and they can invite you straight in.
      </p>
      <div className="mt-5">
        <WelcomeForm next={target} name={account.name} claimed={claimed} />
      </div>
    </div>
  );
}
