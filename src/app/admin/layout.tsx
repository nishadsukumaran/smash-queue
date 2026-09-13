import Link from "next/link";
import { StaffGate } from "@/components/StaffGate";
import { SubmitButton } from "@/components/SubmitButton";
import { lockAction } from "@/server/form-actions";
import { getGroup } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const group = await getGroup();
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
    <StaffGate groupId={group.id} next="/admin">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div>
            <p className="label">Organizer</p>
            <h1 className="text-xl font-extrabold">{group.name}</h1>
          </div>
          <form action={lockAction} className="ml-auto">
            <SubmitButton className="btn btn-ghost btn-sm">Lock</SubmitButton>
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
    </StaffGate>
  );
}
