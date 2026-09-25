import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { SaveButton, TournamentFields } from "@/components/tournament/TournamentForm";
import { CategoryFields } from "@/components/tournament/CategoryForm";
import {
  EntryChip, Flash, FORMAT_LABEL, GENDER_LABEL, PrizeList, StatusChip, dateRange,
} from "@/components/tournament/bits";
import {
  canRunTournament, getTournamentById, seededOrder, tournamentDetail, viewerFor,
  type CategoryView, type TournamentDetail,
} from "@/server/tournament-queries";
import {
  addPrizeAction, buildKnockoutAction, decideEntryAction, deleteCategoryAction, deletePrizeAction,
  deleteTournamentAction, entryPaymentAction, makeDrawAction, resetDrawAction, saveCategoryAction,
  saveSeedsAction, setTournamentStatusAction, updateTournamentAction,
} from "@/server/tournament-actions";
import { listVenues } from "@/server/queries";
import { currentAccount } from "@/lib/auth";
import { money } from "@/lib/format";
import type { TournamentStatus } from "@/db/schema";
import { genderLabel, LEVELS } from "@/lib/profile";
import type { EntryPlayer } from "@/server/tournament-queries";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "setup", label: "Setup" },
  { key: "categories", label: "Categories & prizes" },
  { key: "entries", label: "Entries & fees" },
  { key: "draws", label: "Draws" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function ManageTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; m?: string; e?: string; c?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const row = await getTournamentById(id);
  if (!row) notFound();
  const account = await currentAccount();
  const viewer = await viewerFor(account);
  if (!canRunTournament(viewer, row.t)) notFound();

  const d = await tournamentDetail(row.t, row.g);
  const tab: Tab = (TABS.find((x) => x.key === sp.tab)?.key ?? (row.t.status === "draft" ? "categories" : "entries")) as Tab;
  const t = d.t;
  const base = `/admin/tournaments/${t.id}`;

  return (
    <div className="space-y-3">
      <Flash m={sp.m} e={sp.e} />

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/tournaments" className="text-xs text-teal hover:underline">All tournaments</Link>
          <StatusChip status={t.status} />
          <span className="chip">{t.visibility === "public" ? "Open to all" : "Members only"}</span>
          <Link href={`/t/${t.code}`} className="btn btn-ghost btn-sm ml-auto">Public page</Link>
        </div>
        <h2 className="mt-2 text-xl font-extrabold">{t.name}</h2>
        <p className="text-sm text-muted">
          {dateRange(t.startDate, t.endDate)} · share link <span className="font-mono text-chalk">/t/{t.code}</span>
        </p>
        <StatusActions t={t} categories={d.categories.length} />
      </section>

      <nav className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-2">
          {TABS.map((x) => (
            <Link key={x.key} href={`${base}?tab=${x.key}`} className={`btn btn-sm whitespace-nowrap ${tab === x.key ? "btn-teal" : "btn-ghost"}`}>
              {x.label}
            </Link>
          ))}
        </div>
      </nav>

      {tab === "setup" && <SetupTab d={d} />}
      {tab === "categories" && <CategoriesTab d={d} editing={sp.c} />}
      {tab === "entries" && <EntriesTab d={d} />}
      {tab === "draws" && <DrawsTab d={d} />}
    </div>
  );
}

/* ---------------------------------------------------------------- status */

function StatusActions({ t, categories }: { t: TournamentDetail["t"]; categories: number }) {
  const steps: Array<{ to: TournamentStatus; label: string; primary?: boolean; hint?: string }> = [];
  switch (t.status) {
    case "draft":
      steps.push({ to: "open", label: "Publish and open entries", primary: true, hint: categories === 0 ? "Add a category first." : t.visibility === "community" ? "Members get a notification." : "Listed for every SmashQ player; your members get a notification." });
      steps.push({ to: "cancelled", label: "Cancel" });
      break;
    case "open":
      steps.push({ to: "closed", label: "Close entries", primary: true });
      steps.push({ to: "live", label: "Start the tournament" });
      steps.push({ to: "draft", label: "Unpublish" });
      steps.push({ to: "cancelled", label: "Cancel" });
      break;
    case "closed":
      steps.push({ to: "live", label: "Start the tournament", primary: true });
      steps.push({ to: "open", label: "Reopen entries" });
      steps.push({ to: "cancelled", label: "Cancel" });
      break;
    case "live":
      steps.push({ to: "completed", label: "Finish: results are final", primary: true });
      break;
    case "completed":
      steps.push({ to: "live", label: "Reopen for corrections" });
      break;
    case "cancelled":
      steps.push({ to: "draft", label: "Back to draft" });
      break;
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {steps.map((s) => (
          <form key={s.to} action={setTournamentStatusAction}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <input type="hidden" name="status" value={s.to} />
            <SubmitButton className={`btn btn-sm ${s.primary ? "btn-primary" : s.to === "cancelled" ? "btn-danger" : "btn-ghost"}`} pendingLabel="...">
              {s.label}
            </SubmitButton>
          </form>
        ))}
        {t.status === "draft" && (
          <form action={deleteTournamentAction}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <SubmitButton className="btn btn-danger btn-sm" pendingLabel="...">Delete draft</SubmitButton>
          </form>
        )}
      </div>
      {steps.find((s) => s.primary)?.hint && <p className="text-xs text-muted">{steps.find((s) => s.primary)!.hint}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- setup */

async function SetupTab({ d }: { d: TournamentDetail }) {
  const venues = await listVenues(d.t.groupId);
  return (
    <form action={updateTournamentAction} className="card space-y-4 p-5">
      <input type="hidden" name="tournamentId" value={d.t.id} />
      <input type="hidden" name="next" value={`/admin/tournaments/${d.t.id}?tab=setup`} />
      <TournamentFields t={d.t} venues={venues} />
      <SaveButton label="Save changes" />
    </form>
  );
}

/* ------------------------------------------------------------ categories */

function CategoriesTab({ d, editing }: { d: TournamentDetail; editing?: string }) {
  const here = `/admin/tournaments/${d.t.id}?tab=categories`;
  return (
    <div className="space-y-3">
      {d.categories.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold">{c.name}</h3>
            <span className="chip">{GENDER_LABEL[c.gender]} {c.teamSize === 1 ? "singles" : "doubles"}</span>
            <span className="chip">{FORMAT_LABEL[c.format]}</span>
            <span className="chip">{c.fee === 0 ? "Free" : `${money(c.fee, d.t.currency)} ${c.feeBasis === "team" ? "per entry" : "per player"}`}</span>
            <span className="chip">{c.confirmed}{c.maxEntries ? ` / ${c.maxEntries}` : ""} in</span>
            {c.drawnAt && <span className="chip chip-live">Drawn</span>}
            <Link href={`${here}&c=${c.id}#edit-${c.id}`} className="btn btn-ghost btn-sm ml-auto">Edit</Link>
          </div>

          <div className="mt-3 space-y-2">
            {c.prizes.length > 0 ? (
              <ul className="space-y-1">
                {c.prizes.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1"><PrizeList prizes={[p]} currency={d.t.currency} /></div>
                    <form action={deletePrizeAction}>
                      <input type="hidden" name="tournamentId" value={d.t.id} />
                      <input type="hidden" name="prizeId" value={p.id} />
                      <input type="hidden" name="next" value={here} />
                      <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="...">Remove</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">No prizes yet.</p>
            )}
            <PrizeForm tournamentId={d.t.id} categoryId={c.id} currency={d.t.currency} next={here} />
          </div>

          {editing === c.id && (
            <div id={`edit-${c.id}`} className="mt-4 space-y-3 border-t border-line pt-4">
              <form action={saveCategoryAction} className="space-y-3">
                <input type="hidden" name="tournamentId" value={d.t.id} />
                <input type="hidden" name="categoryId" value={c.id} />
                <input type="hidden" name="next" value={here} />
                <CategoryFields c={c} currency={d.t.currency} />
                <SubmitButton className="btn btn-primary w-full" pendingLabel="Saving...">Save category</SubmitButton>
              </form>
              {c.entries.length === 0 && (
                <form action={deleteCategoryAction}>
                  <input type="hidden" name="tournamentId" value={d.t.id} />
                  <input type="hidden" name="categoryId" value={c.id} />
                  <input type="hidden" name="next" value={here} />
                  <SubmitButton className="btn btn-danger btn-sm" pendingLabel="...">Remove category</SubmitButton>
                </form>
              )}
            </div>
          )}
        </div>
      ))}

      <details className="card p-4" open={d.categories.length === 0}>
        <summary className="cursor-pointer font-bold">Add a category</summary>
        <form action={saveCategoryAction} className="mt-3 space-y-3">
          <input type="hidden" name="tournamentId" value={d.t.id} />
          <input type="hidden" name="next" value={here} />
          <CategoryFields currency={d.t.currency} />
          <SubmitButton className="btn btn-primary w-full" pendingLabel="Adding...">Add category</SubmitButton>
        </form>
      </details>

      <div className="card p-4">
        <h3 className="font-bold">Special awards</h3>
        <p className="text-xs text-muted">Not tied to a category: best newcomer, fair play, lucky draw.</p>
        <div className="mt-2 space-y-1">
          {d.generalPrizes.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1"><PrizeList prizes={[p]} currency={d.t.currency} /></div>
              <form action={deletePrizeAction}>
                <input type="hidden" name="tournamentId" value={d.t.id} />
                <input type="hidden" name="prizeId" value={p.id} />
                <input type="hidden" name="next" value={here} />
                <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="...">Remove</SubmitButton>
              </form>
            </div>
          ))}
        </div>
        <PrizeForm tournamentId={d.t.id} categoryId={null} currency={d.t.currency} next={here} />
      </div>
    </div>
  );
}

function PrizeForm({ tournamentId, categoryId, currency, next }: { tournamentId: string; categoryId: string | null; currency: string; next: string }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-teal">Add a prize</summary>
      <form action={addPrizeAction} className="mt-2 grid gap-2 sm:grid-cols-[auto_auto_1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="next" value={next} />
        {categoryId && <input type="hidden" name="categoryId" value={categoryId} />}
        {categoryId ? (
          <label className="block">
            <span className="label">For</span>
            <select className="input mt-1" name="place" defaultValue="1">
              <option value="1">Winner</option>
              <option value="2">Runner-up</option>
              <option value="3">Third</option>
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="label">Award</span>
            <input className="input mt-1" name="title" placeholder="Best newcomer" required maxLength={80} />
          </label>
        )}
        <label className="block">
          <span className="label">Kind</span>
          <select className="input mt-1" name="kind" defaultValue="cash">
            <option value="cash">Cash</option>
            <option value="trophy">Trophy</option>
            <option value="medal">Medal</option>
            <option value="voucher">Voucher</option>
            <option value="gift">Gift</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Amount / value ({currency})</span>
          <input className="input mt-1" name="amount" type="number" min={0} step="any" placeholder="Optional for gifts" />
        </label>
        <label className="block">
          <span className="label">What it is</span>
          <input className="input mt-1" name="description" placeholder="Trophy + Yonex racket" maxLength={200} />
        </label>
        <SubmitButton className="btn btn-primary" pendingLabel="...">Add</SubmitButton>
      </form>
    </details>
  );
}

/* --------------------------------------------------------------- entries */

function EntriesTab({ d }: { d: TournamentDetail }) {
  const here = `/admin/tournaments/${d.t.id}?tab=entries`;
  const all = d.categories.flatMap((c) => c.entries.filter((e) => e.status !== "withdrawn"));
  const due = all.filter((e) => e.status === "confirmed" && e.paymentStatus === "unpaid").reduce((s, e) => s + e.amountDue, 0);
  const paid = all.filter((e) => e.paymentStatus === "paid").reduce((s, e) => s + e.amountDue, 0);
  const waiting = all.filter((e) => e.status === "pending").length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Waiting for you" value={String(waiting)} tone={waiting ? "text-amber" : ""} />
        <Stat label="Collected" value={money(paid, d.t.currency)} tone="text-teal" />
        <Stat label="Still due" value={money(due, d.t.currency)} tone={due ? "text-amber" : ""} />
      </div>

      {d.categories.map((c) => {
        const list = c.entries.filter((e) => e.status !== "withdrawn");
        return (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold">{c.name}</h3>
              <span className="chip">{c.confirmed}{c.maxEntries ? ` / ${c.maxEntries}` : ""} confirmed</span>
              {c.drawnAt && <span className="chip chip-live">Drawn</span>}
            </div>
            {list.length === 0 && <p className="mt-2 text-sm text-muted">No entries yet.</p>}
            <ul className="mt-2 divide-y divide-line/60">
              {list.map((e) => (
                <li key={e.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <Who p={e.p1} />
                      {e.p2 && (
                        <>
                          {" & "}<Who p={e.p2} />
                        </>
                      )}
                      {e.teamName && <span className="text-muted"> · {e.teamName}</span>}
                    </span>
                    <EntryChip status={e.status} />
                  </div>
                  {e.note && <p className="text-xs text-muted">&ldquo;{e.note}&rdquo;</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {e.status !== "partner" && !c.drawnAt && (
                      <form action={decideEntryAction} className="flex flex-wrap gap-1.5">
                        <input type="hidden" name="entryId" value={e.id} />
                        <input type="hidden" name="next" value={here} />
                        {e.status !== "confirmed" && <SubmitButton className="btn btn-primary btn-sm" name="status" value="confirmed">Confirm</SubmitButton>}
                        {e.status !== "waitlisted" && <SubmitButton className="btn btn-ghost btn-sm" name="status" value="waitlisted">Waitlist</SubmitButton>}
                        {e.status !== "rejected" && <SubmitButton className="btn btn-danger btn-sm" name="status" value="rejected">Reject</SubmitButton>}
                      </form>
                    )}
                    {e.amountDue > 0 && (
                      <form action={entryPaymentAction} className="ml-auto flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="entryId" value={e.id} />
                        <input type="hidden" name="next" value={here} />
                        <span className={`text-xs font-bold ${e.paymentStatus === "paid" ? "text-teal" : e.paymentStatus === "waived" ? "text-muted" : "text-amber"}`}>
                          {money(e.amountDue, d.t.currency)} {e.paymentStatus === "paid" ? `paid${e.paymentMethod ? ` (${e.paymentMethod})` : ""}` : e.paymentStatus}
                        </span>
                        {e.paymentStatus !== "paid" && (
                          <>
                            <select name="method" className="input w-auto px-2 py-1 text-xs" defaultValue="transfer" aria-label="Payment method">
                              <option value="transfer">Transfer</option>
                              <option value="cash">Cash</option>
                              <option value="online">Online</option>
                            </select>
                            <SubmitButton className="btn btn-teal btn-sm" name="paymentStatus" value="paid">Paid</SubmitButton>
                          </>
                        )}
                        {e.paymentStatus !== "waived" && <SubmitButton className="btn btn-ghost btn-sm" name="paymentStatus" value="waived">Waive</SubmitButton>}
                        {e.paymentStatus !== "unpaid" && <SubmitButton className="btn btn-ghost btn-sm" name="paymentStatus" value="unpaid">Undo</SubmitButton>}
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Name, number, and the two profile facts an organizer places entries by. */
function Who({ p }: { p: EntryPlayer }) {
  const lvl = LEVELS.find((l) => l.value === p.level);
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold">{p.name}</span> <span className="font-mono text-xs text-muted">#{p.playerNo}</span>
      <span className="ml-1 text-[11px] text-muted">
        {[genderLabel(p.gender)?.charAt(0), lvl ? `${lvl.label} ${lvl.letter}` : null].filter(Boolean).join(" · ") || "no profile"}
      </span>
    </span>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card p-3">
      <p className="label text-[10px]">{label}</p>
      <p className={`mt-1 text-lg font-extrabold tabular ${tone}`}>{value}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- draws */

function DrawsTab({ d }: { d: TournamentDetail }) {
  const here = `/admin/tournaments/${d.t.id}?tab=draws`;
  return (
    <div className="space-y-3">
      <p className="card p-3 text-sm text-muted">
        Seeds decide who&apos;s kept apart: 1 and 2 can only meet in the final. Leave blank to seed by
        the players&apos; rating in this community. Results are entered on the{" "}
        <Link href={`/t/${d.t.code}`} className="text-teal hover:underline">public page</Link>, by you or anyone
        running the court.
      </p>
      {d.categories.map((c) => (
        <DrawCard key={c.id} c={c} tournamentId={d.t.id} code={d.t.code} here={here} />
      ))}
    </div>
  );
}

function DrawCard({ c, code, here }: { c: CategoryView; tournamentId: string; code: string; here: string }) {
  const confirmed = seededOrder(c.entries.filter((e) => e.status === "confirmed"));
  const played = c.matches.filter((m) => m.status === "completed").length;
  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-extrabold">{c.name}</h3>
        <span className="chip">{FORMAT_LABEL[c.format]}</span>
        <span className="chip">{confirmed.length} confirmed</span>
        {c.drawnAt && <span className="chip chip-live">{played}/{c.matches.filter((m) => m.status !== "bye").length} played</span>}
        {c.drawnAt && <Link href={`/t/${code}?c=${c.id}`} className="btn btn-ghost btn-sm ml-auto">Open draw</Link>}
      </div>

      {!c.drawnAt && (
        <>
          {confirmed.length > 0 && (
            <form action={saveSeedsAction} className="space-y-2">
              <input type="hidden" name="categoryId" value={c.id} />
              <input type="hidden" name="next" value={here} />
              <ul className="divide-y divide-line/50">
                {confirmed.map((e, i) => (
                  <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="w-6 text-right tabular text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    <span className="text-xs tabular text-muted">{Math.round(e.strength)}</span>
                    <input className="input w-16 px-2 py-1 text-center text-sm" name={`seed_${e.id}`} defaultValue={e.seed ?? ""} inputMode="numeric" placeholder="seed" aria-label={`Seed for ${e.label}`} />
                  </li>
                ))}
              </ul>
              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving...">Save seeds</SubmitButton>
            </form>
          )}
          <form action={makeDrawAction}>
            <input type="hidden" name="categoryId" value={c.id} />
            <input type="hidden" name="next" value={here} />
            <SubmitButton className="btn btn-primary w-full" pendingLabel="Drawing..." disabled={confirmed.length < 2}>
              Make the draw ({confirmed.length} {c.teamSize === 2 ? "pairs" : "players"})
            </SubmitButton>
          </form>
          {c.entries.some((e) => e.status === "pending") && (
            <p className="text-xs text-amber">Some entries are still waiting for your decision. Only confirmed entries go in the draw.</p>
          )}
        </>
      )}

      {c.drawnAt && c.format === "groups_knockout" && !c.hasKnockout && (
        <form action={buildKnockoutAction}>
          <input type="hidden" name="categoryId" value={c.id} />
          <input type="hidden" name="next" value={here} />
          <SubmitButton className="btn btn-primary w-full" pendingLabel="Drawing..." disabled={!c.groupStageDone}>
            {c.groupStageDone ? `Draw the knockout (top ${c.advancePerGroup} per group)` : "Knockout: finish the group matches first"}
          </SubmitButton>
        </form>
      )}

      {c.drawnAt && (
        <form action={resetDrawAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="categoryId" value={c.id} />
          <input type="hidden" name="next" value={here} />
          {played > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="confirm" /> Delete {played} results too
            </label>
          )}
          <SubmitButton className="btn btn-danger btn-sm" pendingLabel="...">Reset draw</SubmitButton>
        </form>
      )}
    </div>
  );
}
