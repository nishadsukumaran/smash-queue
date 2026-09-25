import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { Draws } from "@/components/tournament/Draws";
import {
  EntryChip, Flash, FORMAT_LABEL, GENDER_LABEL, PrizeList, StatusChip, dateRange,
} from "@/components/tournament/bits";
import {
  canRunTournament, canSeeEntrants, canSeeTournament, getTournamentByCode, tournamentDetail, viewerFor,
  type CategoryView,
} from "@/server/tournament-queries";
import { enterTournamentAction, withdrawEntryAction } from "@/server/tournament-actions";
import { canStaff, currentAccount } from "@/lib/auth";
import { currentUserId, isStaffFor } from "@/lib/identity";
import { money, prettyDate, prettyTime, TIME_ZONE } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const row = await getTournamentByCode(code);
  // Only a public, published tournament names itself in a link preview.
  if (!row || row.t.visibility !== "public" || row.t.status === "draft") return { title: "Tournament · SmashQ" };
  return {
    title: `${row.t.name} · SmashQ`,
    description: `${row.g.name} · ${dateRange(row.t.startDate, row.t.endDate)}. Categories, prizes and entries on SmashQ.`,
  };
}

/**
 * A tournament's page: what it is, how to enter, and — once it's on — the
 * draws and results. The same page for players and organizers; organizers
 * and court staff also get result forms on each match.
 */
export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ c?: string; m?: string; e?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const row = await getTournamentByCode(code);
  if (!row) notFound();

  const account = await currentAccount();
  const viewer = await viewerFor(account);
  if (!canSeeTournament(viewer, row.t)) {
    return (
      <div className="card mx-auto max-w-md p-5">
        <p className="label">Tournament</p>
        <h1 className="mt-1 text-xl font-extrabold">Members only</h1>
        <p className="mt-2 text-sm text-muted">
          {row.t.status === "draft"
            ? "This tournament isn't published yet."
            : `This tournament is for members of ${row.g.name}.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!account && <Link href={`/signin?next=/t/${row.t.code}`} className="btn btn-primary">Sign in</Link>}
          <Link href={`/c/${row.g.slug}`} className="btn btn-ghost">About {row.g.name}</Link>
        </div>
      </div>
    );
  }

  const d = await tournamentDetail(row.t, row.g);
  const t = d.t;
  const runs = canRunTournament(viewer, t);
  const seeWho = canSeeEntrants(viewer, t);
  const canScore = canStaff(account, t.groupId) || (await isStaffFor(t.groupId));
  const uid = await currentUserId();
  const meIds = new Set([account?.id, uid].filter(Boolean) as string[]);
  const signedIn = Boolean(account?.onboarded);
  const member = viewer.memberOf.has(t.groupId);
  const mayEnter = t.visibility === "public" || member;
  const deadlinePassed = Boolean(t.entryDeadline && new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE }) > t.entryDeadline);

  const selected = d.categories.find((c) => c.id === sp.c) ?? d.categories.find((c) => c.matches.length > 0) ?? d.categories[0];
  const here = `/t/${t.code}${selected ? `?c=${selected.id}` : ""}`;
  const myEntries = d.categories.flatMap((c) =>
    c.entries
      .filter((e) => meIds.has(e.player1Id) || (e.player2Id !== null && meIds.has(e.player2Id)))
      .filter((e) => e.status !== "withdrawn")
      .map((e) => ({ e, c })),
  );
  const mapsUrl = d.venue?.latitude != null && d.venue?.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${d.venue.latitude},${d.venue.longitude}`
    : d.venue?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.venue.address)}`
      : null;

  return (
    <div className="space-y-4">
      <Flash m={sp.m} e={sp.e} />

      <section className="court p-5">
        <div className="relative flex flex-wrap items-center gap-2">
          <p className="label">Tournament</p>
          <StatusChip status={t.status} />
          <span className="chip">{t.visibility === "public" ? "Open to all SmashQ players" : `${d.group.name} members`}</span>
          {runs && (
            <Link href={`/admin/tournaments/${t.id}`} className="btn btn-ghost btn-sm ml-auto">Manage</Link>
          )}
        </div>
        <h1 className="relative mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t.name}</h1>
        <p className="relative mt-1 text-sm text-muted">
          Hosted by <Link href={`/c/${d.group.slug}`} className="text-teal hover:underline">{d.group.name}</Link>
        </p>
        <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
          <Fact label="When" value={`${dateRange(t.startDate, t.endDate)}${t.startTime ? ` · ${prettyTime(t.startTime)}` : ""}`} />
          <Fact
            label="Where"
            value={d.venue ? d.venue.name : "To be announced"}
            sub={d.venue?.address ?? undefined}
            href={mapsUrl ?? undefined}
          />
          <Fact
            label="Entries"
            value={
              t.status === "open"
                ? t.entryDeadline ? `Open until ${prettyDate(t.entryDeadline)}` : "Open"
                : t.status === "draft" ? "Not open yet" : "Closed"
            }
            sub={t.approval === "manual" ? "Organizer confirms each entry" : "Confirmed on entry"}
          />
        </div>
        {t.description && <p className="relative mt-4 max-w-2xl whitespace-pre-wrap text-sm text-chalk/90">{t.description}</p>}
      </section>

      {myEntries.length > 0 && (
        <section className="card p-4">
          <h2 className="label">Your entries</h2>
          <ul className="mt-2 divide-y divide-line/60">
            {myEntries.map(({ e, c }) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted"> · {e.label}</span>
                </span>
                <EntryChip status={e.status} />
                {e.amountDue > 0 && (
                  <span className={`chip ${e.paymentStatus === "paid" ? "chip-teal" : e.paymentStatus === "waived" ? "" : "chip-amber"}`}>
                    {e.paymentStatus === "paid" ? "Paid" : e.paymentStatus === "waived" ? "Fee waived" : `${money(e.amountDue, t.currency)} due`}
                  </span>
                )}
                {!c.drawnAt && ["partner", "pending", "confirmed", "waitlisted"].includes(e.status) && (
                  <form action={withdrawEntryAction}>
                    <input type="hidden" name="entryId" value={e.id} />
                    <input type="hidden" name="next" value={here} />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="...">Withdraw</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {t.paymentNote && myEntries.some(({ e }) => e.paymentStatus === "unpaid" && e.amountDue > 0) && (
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs text-amber">
              <span className="font-bold">How to pay: </span>{t.paymentNote}
            </p>
          )}
        </section>
      )}

      {d.generalPrizes.length > 0 && (
        <section className="card p-4">
          <h2 className="label mb-2">Special awards</h2>
          <PrizeList prizes={d.generalPrizes} currency={t.currency} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="label px-1">Categories</h2>
        {d.categories.length === 0 && <p className="card p-4 text-sm text-muted">No categories yet.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {d.categories.map((c) => (
            <CategoryCard
              key={c.id}
              c={c}
              currency={t.currency}
              selected={selected?.id === c.id}
              code={t.code}
              enterable={t.status === "open" && !deadlinePassed && !c.drawnAt}
              signedIn={signedIn}
              mayEnter={mayEnter}
              groupName={d.group.name}
              alreadyIn={c.entries.some((e) => ["partner", "pending", "confirmed", "waitlisted"].includes(e.status) && (meIds.has(e.player1Id) || (e.player2Id !== null && meIds.has(e.player2Id))))}
              playerNo={account?.playerNo ?? null}
            />
          ))}
        </div>
      </section>

      {selected && seeWho && (
        <section className="card space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold">{selected.name}</h2>
            <span className="chip">{FORMAT_LABEL[selected.format]}</span>
            <span className="chip">{selected.bestOf === 3 ? `Best of 3 to ${selected.pointsTo}` : `One game to ${selected.pointsTo}`}</span>
          </div>
          {d.categories.length > 1 && (
            <nav className="-mx-1 flex flex-wrap gap-1.5">
              {d.categories.map((c) => (
                <Link key={c.id} href={`/t/${t.code}?c=${c.id}`} className={`chip ${c.id === selected.id ? "chip-live" : ""}`}>
                  {c.name}
                </Link>
              ))}
            </nav>
          )}

          <Draws cat={selected} entries={d.entryById} canScore={canScore} next={here} meIds={meIds} />

          <details open={selected.matches.length === 0}>
            <summary className="label cursor-pointer">
              Entries · {selected.confirmed} confirmed
              {selected.maxEntries ? ` of ${selected.maxEntries}` : ""}
            </summary>
            <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
              {selected.entries
                .filter((e) => e.status === "confirmed" || e.status === "waitlisted" || e.status === "pending")
                .map((e) => (
                  <li key={e.id} className="flex items-center gap-2 border-b border-line/50 py-1.5 text-sm">
                    <span className={`min-w-0 flex-1 truncate ${meIds.has(e.player1Id) || (e.player2Id && meIds.has(e.player2Id)) ? "text-shuttle" : ""}`}>
                      {e.label}
                      {e.teamName && <span className="text-xs text-muted"> · {e.p1.name}{e.p2 ? ` & ${e.p2.name}` : ""}</span>}
                    </span>
                    {e.status !== "confirmed" && <EntryChip status={e.status} />}
                  </li>
                ))}
              {selected.entries.filter((e) => ["confirmed", "waitlisted", "pending"].includes(e.status)).length === 0 && (
                <li className="py-1.5 text-sm text-muted">No entries yet.</li>
              )}
            </ul>
          </details>
        </section>
      )}

      {selected && !seeWho && (
        <p className="card p-4 text-sm text-muted">
          <Link href={`/signin?next=/t/${t.code}`} className="text-teal hover:underline">Sign in</Link> to see who&apos;s entered and follow the draws.
        </p>
      )}

      {(t.rules || t.paymentNote || t.contact) && (
        <section className="grid gap-3 md:grid-cols-2">
          {t.rules && (
            <div className="card p-4">
              <h2 className="label">Rules</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-chalk/90">{t.rules}</p>
            </div>
          )}
          <div className="card space-y-3 p-4">
            {t.paymentNote && (
              <div>
                <h2 className="label">Paying the entry fee</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-chalk/90">{t.paymentNote}</p>
              </div>
            )}
            {t.contact && (
              <div>
                <h2 className="label">Questions</h2>
                <p className="mt-1 text-sm text-chalk/90">{t.contact}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-muted">
        <Link href="/tournaments" className="text-teal hover:underline">All tournaments</Link>
      </p>
    </div>
  );
}

function Fact({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="label">{label}</p>
      <p className="mt-0.5 font-bold">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="rounded-xl border border-line bg-court/70 p-3 hover:border-teal/50">
      {body}
      <p className="mt-1 text-xs font-semibold text-teal">Open map</p>
    </a>
  ) : (
    <div className="rounded-xl border border-line bg-court/70 p-3">{body}</div>
  );
}

function CategoryCard({
  c, currency, selected, code, enterable, signedIn, mayEnter, groupName, alreadyIn, playerNo,
}: {
  c: CategoryView;
  currency: string;
  selected: boolean;
  code: string;
  enterable: boolean;
  signedIn: boolean;
  mayEnter: boolean;
  groupName: string;
  alreadyIn: boolean;
  playerNo: number | null;
}) {
  const full = Boolean(c.maxEntries && c.confirmed >= c.maxEntries);
  const fee = c.fee === 0 ? "Free" : `${money(c.fee, currency)} ${c.feeBasis === "team" ? (c.teamSize === 2 ? "per pair" : "per entry") : "per player"}`;
  return (
    <div className={`card p-4 ${selected ? "border-shuttle/50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/t/${code}?c=${c.id}`} className="text-base font-extrabold hover:text-shuttle">{c.name}</Link>
        <span className="chip">{GENDER_LABEL[c.gender]} {c.teamSize === 1 ? "singles" : "doubles"}</span>
        {c.level && <span className="chip chip-teal">Level {c.level}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>{FORMAT_LABEL[c.format]}</span>
        <span className="font-semibold text-chalk">{fee}</span>
        <span>
          {c.confirmed}
          {c.maxEntries ? ` / ${c.maxEntries}` : ""} {c.teamSize === 2 ? "pairs" : "players"}
          {full ? " · full" : ""}
        </span>
      </div>
      {c.prizes.length > 0 && (
        <div className="mt-3 rounded-xl border border-line bg-court/70 p-2.5">
          <PrizeList prizes={c.prizes} currency={currency} />
        </div>
      )}

      {enterable && !alreadyIn && (
        <div className="mt-3">
          {!signedIn ? (
            <Link href={`/signin?next=/t/${code}?c=${c.id}`} className="btn btn-primary btn-sm">Sign in to enter</Link>
          ) : !mayEnter ? (
            <p className="text-xs text-muted">For {groupName} members.</p>
          ) : (
            <details>
              <summary className="btn btn-primary btn-sm list-none">{full ? "Join the waiting list" : "Enter"}</summary>
              <form action={enterTournamentAction} className="mt-3 space-y-3">
                <input type="hidden" name="categoryId" value={c.id} />
                <input type="hidden" name="next" value={`/t/${code}?c=${c.id}`} />
                {c.teamSize === 2 && (
                  <label className="block">
                    <span className="label">Partner&apos;s player number</span>
                    <input className="input mt-1" name="partnerNo" inputMode="numeric" placeholder="e.g. 1042" required />
                    <span className="mt-1 block text-xs text-muted">
                      On their profile page. They&apos;ll get a request to accept.{playerNo ? ` Yours is #${playerNo}.` : ""}
                    </span>
                  </label>
                )}
                {c.teamSize === 2 && (
                  <label className="block">
                    <span className="label">Team name (optional)</span>
                    <input className="input mt-1" name="teamName" maxLength={40} />
                  </label>
                )}
                <label className="block">
                  <span className="label">Note for the organizer (optional)</span>
                  <input className="input mt-1" name="note" maxLength={300} placeholder="T-shirt size, timing, anything" />
                </label>
                <label className="flex items-start gap-2 text-xs text-muted">
                  <input type="checkbox" name="eligible" required className="mt-0.5" />
                  <span>
                    {c.teamSize === 2 ? "We meet" : "I meet"} this category&apos;s eligibility
                    ({GENDER_LABEL[c.gender]}{c.level ? `, level ${c.level}` : ""}), and understand the organizer will see
                    {c.teamSize === 2 ? " our" : " my"} name and player number.
                  </span>
                </label>
                <SubmitButton className="btn btn-primary w-full" pendingLabel="Entering...">
                  {c.fee > 0 ? `Enter · ${fee}` : "Enter"}
                </SubmitButton>
              </form>
            </details>
          )}
        </div>
      )}
      {alreadyIn && <p className="mt-3 text-xs font-semibold text-teal">You&apos;re entered.</p>}
    </div>
  );
}
