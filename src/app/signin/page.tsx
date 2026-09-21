import { redirect } from "next/navigation";
import { SignInForm } from "@/components/SignInForm";
import { currentAccount, pinCandidate } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; expired?: string }>;
}) {
  const { next, expired } = await searchParams;
  const target = safeNext(next);

  // Already signed in: nothing to do here.
  const account = await currentAccount();
  if (account) redirect(account.onboarded ? target : `/welcome?next=${encodeURIComponent(target)}`);

  return <SignInForm next={target} expired={expired === "1"} pinFor={await pinCandidate()} />;
}
