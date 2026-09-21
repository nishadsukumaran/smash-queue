import Link from "next/link";
import { OrganizerGate } from "@/components/StaffGate";
import { SubmitButton } from "@/components/SubmitButton";
import { CommunitySwitcher } from "@/components/CommunitySwitcher";
import { signOutAction } from "@/server/auth-actions";
import { currentAccount, isPlatformAdmin } from "@/lib/auth";
import { activeCommunity, myCommunities } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Organizer screens for whichever community is active.
 *
 * The gate is checked against that community specifically: being an organizer
 * of one community grants nothing in another, and the switcher only offers
 * the ones this account actually belongs to.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const account = await currentAccount();
  const active = await activeCommunity(account);

  if (!active) {
    return (
      <div className="card mx-auto max-w-sm p-5">
        <p className="label">Organizer</p>
        <h2 className="mt-1 text-lg font-bold">No community open</h2>
        <p className="mt-1 text-sm text-muted">
          {isPlatformAdmin(account)
            ? "Pick one from the platform console, or create the first."
            : account
              ? "You don't run a community yet. Whoever runs yours can appoint you."
              : "Sign in with the email your community has on file."}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {isPlatformAdmin(account) && (
            <Link href="/hq" className="btn btn-primary w-full">
              Platform console
            </Link>
          )}
          {!account && (
            <Link href="/signin?next=/admin" className="btn btn-primary w-full">
              Email me a sign-in link
            </Link>
          )}
          <Link href="/communities" className="btn btn-ghost w-full">
            Communities
          </Link>
        </div>
      </div>
    );
  }

  const group = active.group;
  const mine = (await myCommunities(account)).filter((m) => m.role === "organizer");

  const tabs = [
    { href: "/admin", label: "Sessions" },
    { href: "/admin/new", label: "New session" },
    { href: "/admin/members", label: "Members" },
    { href: "/admin/venues", label: "Venues" },
    { href: "/admin/stats", label: "Statistics" },
  ];

  return (
    <OrganizerGate groupId={group.id} next="/admin">
      <div className="space-y-4">
        <CommunitySwitcher mine={mine} activeId={group.id} next="/admin" />

        <div className="flex items-center gap-2">
          <div>
            <p className="label">Organizer</p>
            <h1 className="text-xl font-extrabold">{group.name}</h1>
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
            {tabs.map((t) => (
              <Link key={t.href} href={t.href} className="btn btn-ghost btn-sm whitespace-nowrap">
                {t.label}
              </Link>
            ))}
            {isPlatformAdmin(account) && (
              <Link href="/hq" className="btn btn-ghost btn-sm whitespace-nowrap">
                Platform
              </Link>
            )}
          </div>
        </nav>

        {children}
      </div>
    </OrganizerGate>
  );
}
