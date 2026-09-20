import Link from "next/link";
import { OrganizerGate } from "@/components/StaffGate";
import { SubmitButton } from "@/components/SubmitButton";
import { signOutAction } from "@/server/auth-actions";
import { currentAccount } from "@/lib/auth";
import { getGroup } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const group = await getGroup();
  const account = await currentAccount();
  if (!group)
    return (
      <div className="card p-5 text-sm text-muted">
        No group yet. Run <code className="text-shuttle">npm run setup</code> to create the demo
        group and seed data.
      </div>
    );

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
          </div>
        </nav>

        {children}
      </div>
    </OrganizerGate>
  );
}
