import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { StaffGate } from "@/components/StaffGate";
import { getBoard, getSessionByCode } from "@/server/queries";
import { addCostAction, paymentAction, removeCostAction } from "@/server/form-actions";
import { db } from "@/db";
import { sessionCosts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();
  return (
    <StaffGate groupId={session.groupId} next={`/s/${code}/payments`}>
      <Payments code={code} />
    </StaffGate>
  );
}

async function Payments({ code }: { code: string }) {
  const session = await getSessionByCode(code);
  if (!session) notFound();
  const [board, costs] = await Promise.all([
    getBoard(session.id),
    db.select().from(sessionCosts).where(eq(sessionCosts.sessionId, session.id)),
  ]);
  if (!board) notFound();

  const payable = board.roster.filter(
    (r) => r.bookingStatus === "confirmed" || r.checkedInAt,
  );
  const unpaid = payable.filter((r) => r.paymentStatus === "unpaid");
  const costTotal = costs.reduce((s, c) => s + c.amount, 0);
  const cur = session.currency;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Expected" value={money(board.totals.expected, cur)} />
        <Tile label="Collected" value={money(board.totals.collected, cur)} tone="good" />
        <Tile
          label="Outstanding"
          value={money(board.totals.outstanding, cur)}
          tone={board.totals.outstanding > 0 ? "warn" : "good"}
        />
      </div>

      {unpaid.length > 0 && (
        <div className="card p-4">
          <h2 className="label">Still to pay ({unpaid.length})</h2>
          <p className="mt-2 text-sm">{unpaid.map((r) => r.name).join(", ")}</p>
        </div>
      )}

      <section className="card p-4">
        <h2 className="label">Everyone</h2>
        <div className="mt-2 divide-y divide-line/60">
          {payable.map((r) => (
            <div key={r.userId} className="flex flex-wrap items-center gap-2 py-2">
              <Avatar name={r.name} size={30} dim={r.paymentStatus === "unpaid"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-[.68rem] text-muted">
                  {r.paymentStatus === "paid"
                    ? `Paid ${r.paymentMethod ?? ""} · ${money(r.amount || session.fee, cur)}`
                    : r.paymentStatus === "waived"
                      ? "Waived"
                      : `${money(session.fee, cur)} due`}
                </p>
              </div>
              {r.paymentStatus === "unpaid" ? (
                <div className="flex gap-1.5">
                  <PayButton sessionId={session.id} userId={r.userId} method="cash" label="Cash" />
                  <PayButton sessionId={session.id} userId={r.userId} method="transfer" label="Transfer" />
                  <form action={paymentAction}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input type="hidden" name="userId" value={r.userId} />
                    <input type="hidden" name="status" value="waived" />
                    <SubmitButton className="btn btn-ghost btn-sm">Waive</SubmitButton>
                  </form>
                </div>
              ) : (
                <form action={paymentAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="userId" value={r.userId} />
                  <input type="hidden" name="status" value="unpaid" />
                  <SubmitButton className="btn btn-ghost btn-sm">Undo</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label">Session costs</h2>
        <div className="mt-2 divide-y divide-line/60">
          {costs.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              <span className="tabular">{money(c.amount, cur)}</span>
              <form action={removeCostAction}>
                <input type="hidden" name="costId" value={c.id} />
                <SubmitButton className="btn btn-ghost btn-sm">Remove</SubmitButton>
              </form>
            </div>
          ))}
        </div>

        <form action={addCostAction} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="sessionId" value={session.id} />
          <input className="input" name="label" placeholder="Court hire" required />
          <input className="input" name="amount" type="number" step="1" placeholder="600" required />
          <SubmitButton className="btn btn-ghost">Add cost</SubmitButton>
        </form>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
          <div>
            <p className="text-sm font-bold tabular">{money(board.totals.collected, cur)}</p>
            <p className="text-[.6rem] uppercase tracking-wider text-muted">Revenue</p>
          </div>
          <div>
            <p className="text-sm font-bold tabular">{money(costTotal, cur)}</p>
            <p className="text-[.6rem] uppercase tracking-wider text-muted">Costs</p>
          </div>
          <div>
            <p
              className={`text-sm font-bold tabular ${
                board.totals.collected - costTotal >= 0 ? "text-teal" : "text-rose"
              }`}
            >
              {money(board.totals.collected - costTotal, cur)}
            </p>
            <p className="text-[.6rem] uppercase tracking-wider text-muted">Balance</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function PayButton({
  sessionId,
  userId,
  method,
  label,
}: {
  sessionId: string;
  userId: string;
  method: string;
  label: string;
}) {
  return (
    <form action={paymentAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value="paid" />
      <input type="hidden" name="method" value={method} />
      <SubmitButton className="btn btn-teal btn-sm" pendingLabel="...">
        {label}
      </SubmitButton>
    </form>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-teal" : tone === "warn" ? "text-amber" : "text-chalk";
  return (
    <div className="card p-3 text-center">
      <p className={`text-base font-extrabold tabular ${color}`}>{value}</p>
      <p className="text-[.6rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
