import Link from "next/link";
import { EntryChip, Flash, TournamentCardView } from "@/components/tournament/bits";
import { SubmitButton } from "@/components/SubmitButton";
import { browseTournaments, myTournamentEntries, viewerFor } from "@/server/tournament-queries";
import { answerPartnerAction } from "@/server/tournament-actions";
import { canOrganize, currentAccount } from "@/lib/auth";
import { activeCommunity } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Every tournament this person can see: public ones from any community, and
 * the members-only ones of communities they belong to.
 */
export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; e?: string }>;
}) {
  const sp = await searchParams;
  const account = await currentAccount();
  const viewer = await viewerFor(account);
  const [all, mine, active] = await Promise.all([
    browseTournaments(viewer),
    account ? myTournamentEntries(account.id) : Promise.resolve([]),
    activeCommunity(account),
  ]);

  const upcoming = all.filter((c) => ["open", "closed", "live"].includes(c.t.status));
  const past = all.filter((c) => c.t.status === "completed").reverse().slice(0, 10);
  const requests = mine.filter((m) => m.awaitingMe);
  const organizes = active && canOrganize(account, active.group.id);

  return (
    <div className="space-y-4">
      <Flash m={sp.m} e={sp.e} />
      <section className="card p-5">
        <p className="label">Tournaments</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Play for something</h1>
        <p className="mt-2 max-w-lg text-sm text-muted">
          Tournaments from your communities, and open ones any SmashQ player can enter. Pick a
          category, name your partner by their player number, and you&apos;re in.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!account && <Link href="/signin?next=/tournaments" className="btn btn-primary">Sign in to enter</Link>}
          {organizes && <Link href="/admin/tournaments/new" className="btn btn-ghost">Host a tournament</Link>}
        </div>
      </section>

      {requests.length > 0 && (
        <section className="card border-amber/50 p-4">
          <h2 className="label text-amber">Partner requests</h2>
          <ul className="mt-2 space-y-2">
            {requests.map((r) => (
              <li key={r.entry.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{r.enteredByName}</span> wants you for{" "}
                  <Link href={`/t/${r.tournament.code}?c=${r.category.id}`} className="text-teal hover:underline">
                    {r.category.name} · {r.tournament.name}
                  </Link>
                </span>
                <form action={answerPartnerAction} className="flex gap-2">
                  <input type="hidden" name="entryId" value={r.entry.id} />
                  <input type="hidden" name="next" value="/tournaments" />
                  <SubmitButton className="btn btn-primary btn-sm" name="answer" value="yes">Accept</SubmitButton>
                  <SubmitButton className="btn btn-ghost btn-sm" name="answer" value="no">Decline</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine.filter((m) => !m.awaitingMe && m.entry.status !== "withdrawn" && ["open", "closed", "live"].includes(m.tournament.status)).length > 0 && (
        <section className="card p-4">
          <h2 className="label">You&apos;re entered</h2>
          <ul className="mt-2 divide-y divide-line/60">
            {mine
              .filter((m) => !m.awaitingMe && m.entry.status !== "withdrawn" && ["open", "closed", "live"].includes(m.tournament.status))
              .map((m) => (
                <li key={m.entry.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Link href={`/t/${m.tournament.code}?c=${m.category.id}`} className="min-w-0 flex-1 hover:text-shuttle">
                    <span className="font-semibold">{m.tournament.name}</span>
                    <span className="text-muted"> · {m.category.name}{m.partnerName ? ` with ${m.partnerName}` : ""}</span>
                  </Link>
                  <EntryChip status={m.entry.status} />
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="label px-1">Coming up</h2>
        {upcoming.length === 0 && (
          <p className="card p-4 text-sm text-muted">
            No tournaments announced right now. When a community you&apos;re in announces one, it shows up here.
          </p>
        )}
        {upcoming.map((c) => (
          <TournamentCardView key={c.t.id} c={c} />
        ))}
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="label px-1">Results</h2>
          {past.map((c) => (
            <TournamentCardView key={c.t.id} c={c} />
          ))}
        </section>
      )}
    </div>
  );
}
