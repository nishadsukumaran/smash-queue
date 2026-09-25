import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { PALETTE } from "@/lib/palette";
import { currentAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tournaments · SmashQ",
  description: "Community and open badminton tournaments on SmashQ.",
};

/**
 * Placeholder, standing in for the tournaments module on `feature/tournaments`.
 *
 * It exists so the landing page's "Browse tournaments" button leads somewhere
 * rather than to a 404 in the window between launching the landing page and
 * merging that branch. The branch owns a page at this same path, so the merge
 * will conflict here — take the branch's version wholesale and delete this
 * file; nothing else in the app imports it.
 */
export default async function TournamentsPage() {
  const account = await currentAccount();
  const signedIn = Boolean(account?.onboarded);

  return (
    <div className="space-y-4 pb-10">
      <section className="showcase led edge-electric px-5 py-10 text-center sm:px-8 sm:py-14">
        <div className="relative mx-auto max-w-lg">
          <div className="mx-auto w-fit">
            <LogoMark size={48} knock={PALETTE.surface} label={null} />
          </div>
          <p className="eyebrow mx-auto mt-5 w-fit">Tournaments</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Draws open shortly.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
            Seeded groups into a knockout, categories for men, women, mixed and open, partner
            confirmation, waiting lists and prizes. It is built and in final testing — the first
            tournaments will be listed here.
          </p>

          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {["Groups into knockout", "Singles and doubles", "Entry fees", "Live results"].map((t) => (
              <li key={t} className="chip chip-teal">
                {t}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            {signedIn ? (
              <Link href="/" className="btn btn-primary">
                Back to your courts
              </Link>
            ) : (
              <Link href="/signin?next=/tournaments" className="btn btn-primary">
                Sign in to be ready
              </Link>
            )}
            <Link href="/guide" className="btn btn-ghost">
              How SmashQ works
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
