import Link from "next/link";
import { PlatformGate } from "@/components/StaffGate";
import { SubmitButton } from "@/components/SubmitButton";
import { signOutAction } from "@/server/auth-actions";
import { currentAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The platform console.
 *
 * Kept at its own path rather than folded into /admin, because the two are
 * different jobs held by different people: /admin runs one community, this
 * decides which communities exist and who runs them. Merging them would mean
 * every organizer's screen carried a door they must never open.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const account = await currentAccount();

  return (
    <PlatformGate next="/hq">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div>
            <p className="label">Platform</p>
            <h1 className="text-xl font-extrabold">Communities</h1>
          </div>
          <form action={signOutAction} className="ml-auto flex items-center gap-2">
            {account && (
              <span className="hidden text-xs text-muted sm:inline">{account.name}</span>
            )}
            <SubmitButton className="btn btn-ghost btn-sm">Sign out</SubmitButton>
          </form>
        </div>

        <nav className="-mx-4 overflow-x-auto px-4">
          <div className="flex min-w-max gap-2">
            <Link href="/hq" className="btn btn-ghost btn-sm whitespace-nowrap">
              All communities
            </Link>
            <Link href="/" className="btn btn-ghost btn-sm whitespace-nowrap">
              Back to the app
            </Link>
          </div>
        </nav>

        {children}
      </div>
    </PlatformGate>
  );
}
