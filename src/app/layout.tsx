import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Shuttle } from "@/components/Shuttle";
import { SiteFooter } from "@/components/SiteFooter";
import { APP_NAME, RELEASE_CHANNEL } from "@/lib/brand";
import { Avatar } from "@/components/Avatar";
import { currentUserId, staffGroups } from "@/lib/identity";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: RELEASE_CHANNEL ? `${APP_NAME} ${RELEASE_CHANNEL}` : APP_NAME,
  description:
    "Book. Check in. Queue. Play. Badminton session management that runs itself. Built by AIOps.",
  manifest: "/manifest.webmanifest",
  // iOS ignores the manifest's icons for the home screen; it wants this.
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Smash Queue" },
};

export const viewport: Viewport = {
  themeColor: "#06100D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

async function me() {
  const id = await currentUserId();
  if (!id) return null;
  const rows = await db.select().from(users).where(eq(users.id, id));
  return rows[0] ?? null;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, staff] = await Promise.all([me(), staffGroups()]);

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-ink/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:gap-3">
            <Link
              href="/"
              className="group flex shrink-0 items-center gap-2 font-extrabold tracking-tight"
            >
              <span className="text-shuttle transition-transform duration-300 group-hover:-rotate-[25deg] group-active:scale-90">
                <Shuttle size={24} />
              </span>
              <span className="text-[1.02rem]">
                Smash<span className="text-shuttle">Queue</span>
              </span>
            </Link>
            {RELEASE_CHANNEL && (
              <span className="chip chip-amber shrink-0" title={`${RELEASE_CHANNEL} release. Things may still change.`}>
                {RELEASE_CHANNEL}
              </span>
            )}
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {staff.length > 0 && <span className="chip chip-teal hidden sm:inline-flex">Staff</span>}
              {user ? (
                <Link
                  href="/me"
                  className="flex min-w-0 items-center gap-2 rounded-full border border-line bg-surface px-2 py-1"
                >
                  <Avatar name={user.name} size={24} />
                  <span className="max-w-20 truncate text-xs font-semibold sm:max-w-32">{user.name}</span>
                </Link>
              ) : (
                <Link href="/signin" className="btn btn-ghost btn-sm shrink-0 whitespace-nowrap">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pt-4">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
