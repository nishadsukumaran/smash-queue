import Link from "next/link";
import type {
  CategoryGender, EntryStatus, PrizeKind, TournamentFormat, TournamentPrize, TournamentStatus,
} from "@/db/schema";
import type { TournamentCard } from "@/server/tournament-queries";
import { money, prettyDate } from "@/lib/format";

/* Small shared pieces for the tournament screens. Server components. */

export function Flash({ m, e }: { m?: string; e?: string }) {
  if (!m && !e) return null;
  return (
    <p
      role="status"
      className={`card p-3 text-sm ${e ? "border-rose/50 text-rose" : "border-teal/50 text-teal"}`}
    >
      {e ?? m}
    </p>
  );
}

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: "Draft",
  open: "Entries open",
  closed: "Entries closed",
  live: "Live",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusChip({ status }: { status: TournamentStatus }) {
  const cls =
    status === "open" ? "chip-teal" : status === "live" ? "chip-live" : status === "cancelled" ? "chip-rose" : status === "draft" ? "chip-amber" : "";
  return <span className={`chip whitespace-nowrap ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export const ENTRY_LABEL: Record<EntryStatus, string> = {
  partner: "Waiting for partner",
  pending: "Waiting for organizer",
  confirmed: "Confirmed",
  waitlisted: "Waiting list",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};

export function EntryChip({ status }: { status: EntryStatus }) {
  const cls =
    status === "confirmed" ? "chip-teal" : status === "rejected" || status === "withdrawn" ? "chip-rose" : "chip-amber";
  return <span className={`chip whitespace-nowrap ${cls}`}>{ENTRY_LABEL[status]}</span>;
}

export const GENDER_LABEL: Record<CategoryGender, string> = {
  men: "Men",
  women: "Women",
  mixed: "Mixed",
  open: "Open",
};

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
  knockout: "Knockout",
  round_robin: "Round robin",
  groups_knockout: "Groups, then knockout",
};

const KIND_LABEL: Record<PrizeKind, string> = {
  cash: "Cash",
  trophy: "Trophy",
  medal: "Medal",
  voucher: "Voucher",
  gift: "Gift",
  other: "Prize",
};

export function placeName(place: number | null) {
  if (place === 1) return "Winner";
  if (place === 2) return "Runner-up";
  if (place === 3) return "Third";
  if (place) return `${place}th`;
  return "";
}

export function prizeText(p: TournamentPrize, currency: string) {
  const bits: string[] = [];
  if (p.kind === "cash" && p.amount) bits.push(money(p.amount, currency));
  else if (p.amount) bits.push(`${KIND_LABEL[p.kind]} worth ${money(p.amount, currency)}`);
  else if (!p.description) bits.push(KIND_LABEL[p.kind]);
  if (p.description) bits.push(p.description);
  return bits.join(" + ");
}

export function PrizeList({ prizes, currency }: { prizes: TournamentPrize[]; currency: string }) {
  if (prizes.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {prizes.map((p) => (
        <li key={p.id} className="flex flex-wrap items-baseline gap-2">
          <span className="min-w-20 text-xs font-bold uppercase tracking-wider text-shuttle">
            {p.title ?? placeName(p.place)}
          </span>
          <span className="min-w-0 flex-1">{prizeText(p, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

export function dateRange(start: string, end: string) {
  return start === end ? prettyDate(start) : `${prettyDate(start)} – ${prettyDate(end)}`;
}

export function TournamentCardView({ c }: { c: TournamentCard }) {
  const { t } = c;
  const d = new Date(`${t.startDate}T12:00:00Z`);
  return (
    <Link href={`/t/${t.code}`} className="card grid grid-cols-[56px_minmax(0,1fr)] items-start gap-4 p-4 hover:bg-surface-2">
      <div className="rounded-xl border border-line bg-court py-1.5 text-center">
        <div className="label text-[10px]">{d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</div>
        <div className="text-xl font-extrabold leading-none tracking-tight text-chalk">
          {d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{t.name}</h3>
          <StatusChip status={t.status} />
          {t.visibility === "public" ? (
            <span className="chip">Open to all</span>
          ) : (
            <span className="chip">Members only</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {c.group.name} · {dateRange(t.startDate, t.endDate)}
          {t.entryDeadline && t.status === "open" ? ` · entries close ${prettyDate(t.entryDeadline)}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="chip">{c.categories} {c.categories === 1 ? "category" : "categories"}</span>
          {c.entries > 0 && <span className="chip">{c.entries} entries</span>}
          {c.minFee !== null && (
            <span className="chip">{c.minFee === 0 ? "Free entry" : `From ${money(c.minFee, t.currency)}`}</span>
          )}
          {c.cashPrizes > 0 && <span className="chip chip-live">{money(c.cashPrizes, t.currency)} in prizes</span>}
          {c.cashPrizes === 0 && c.otherPrizes > 0 && <span className="chip chip-live">Prizes</span>}
        </div>
      </div>
    </Link>
  );
}
