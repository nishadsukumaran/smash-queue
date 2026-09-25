import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import type { MyEntry } from "@/server/tournament-queries";
import { answerPartnerAction } from "@/server/tournament-actions";
import { EntryChip, dateRange } from "./bits";

/** Partner requests waiting on this person, and the tournaments they're in. */
export function MyTournaments({ entries, next }: { entries: MyEntry[]; next: string }) {
  const asks = entries.filter((e) => e.awaitingMe);
  const current = entries.filter(
    (e) => !e.awaitingMe && e.entry.status !== "withdrawn" && e.entry.status !== "rejected" && ["open", "closed", "live"].includes(e.tournament.status),
  );
  if (asks.length === 0 && current.length === 0) return null;

  return (
    <section id="tournaments" className={`card p-4 ${asks.length ? "border-amber/50" : ""}`}>
      <div className="flex items-center justify-between">
        <h2 className={`label ${asks.length ? "text-amber" : ""}`}>
          Tournaments{asks.length ? ` · ${asks.length} partner request${asks.length > 1 ? "s" : ""}` : ""}
        </h2>
        <Link href="/tournaments" className="text-xs text-teal hover:underline">All tournaments</Link>
      </div>
      <ul className="mt-2 divide-y divide-line/60">
        {asks.map((r) => (
          <li key={r.entry.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{r.enteredByName}</span> wants you as partner in{" "}
              <Link href={`/t/${r.tournament.code}?c=${r.category.id}`} className="text-teal hover:underline">
                {r.category.name}
              </Link>
              <span className="block text-xs text-muted">
                {r.tournament.name} · {dateRange(r.tournament.startDate, r.tournament.endDate)}
              </span>
            </span>
            <form action={answerPartnerAction} className="flex gap-2">
              <input type="hidden" name="entryId" value={r.entry.id} />
              <input type="hidden" name="next" value={next} />
              <SubmitButton className="btn btn-primary btn-sm" name="answer" value="yes">Accept</SubmitButton>
              <SubmitButton className="btn btn-ghost btn-sm" name="answer" value="no">Decline</SubmitButton>
            </form>
          </li>
        ))}
        {current.map((m) => (
          <li key={m.entry.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
            <Link href={`/t/${m.tournament.code}?c=${m.category.id}`} className="min-w-0 flex-1 hover:text-shuttle">
              <span className="font-semibold">{m.tournament.name}</span>
              <span className="text-muted"> · {m.category.name}{m.partnerName ? ` with ${m.partnerName}` : ""}</span>
            </Link>
            <EntryChip status={m.entry.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
