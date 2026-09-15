import type { Metadata } from "next";
import Link from "next/link";
import { Shuttle } from "@/components/Shuttle";
import { GUIDE_HTML, GUIDE_SECTIONS } from "@/generated/guide";
import { APP_VERSION, RELEASE_CHANNEL, SUPPORT_EMAIL, supportMailto } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Guide — Smash Queue",
  description: "How to book, check in, run the courts and read the queue.",
};

/**
 * The guide, rendered from docs/USER-GUIDE.md at build time. Static on purpose:
 * it needs no database, so it is the one page that still answers when
 * everything else is having a bad night.
 */
export default function GuidePage() {
  return (
    <div className="space-y-5">
      <header className="card relative overflow-hidden p-5">
        <div className="absolute -right-6 -top-6 text-shuttle/10">
          <Shuttle size={120} />
        </div>
        <p className="label">Guide</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          Book. Check in. Queue. Play.
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Everything the app does, for players, whoever is running the night, and whoever
          organises the group. Skim the part that is yours.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip chip-amber">
            {RELEASE_CHANNEL} &middot; {APP_VERSION}
          </span>
          <a href={supportMailto("Question about the guide")} className="chip chip-teal">
            {SUPPORT_EMAIL}
          </a>
        </div>
      </header>

      <nav aria-label="Guide sections" className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-2">
          {GUIDE_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="btn btn-ghost btn-sm whitespace-nowrap">
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      <article
        className="prose-court card px-5 py-6"
        dangerouslySetInnerHTML={{ __html: GUIDE_HTML }}
      />

      <div className="flex flex-wrap justify-center gap-2 pb-2">
        <Link href="/" className="btn btn-primary">
          Back to sessions
        </Link>
        <Link href="/who" className="btn btn-ghost">
          Pick your name
        </Link>
      </div>
    </div>
  );
}
