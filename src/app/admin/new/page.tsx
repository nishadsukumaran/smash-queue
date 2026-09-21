import { SubmitButton } from "@/components/SubmitButton";
import { activeCommunity } from "@/lib/tenant";
import { listVenues } from "@/server/queries";
import { createSessionAction } from "@/server/form-actions";

export const dynamic = "force-dynamic";

function nextSaturday() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export default async function NewSessionPage() {
  const active = await activeCommunity();
  if (!active) return null;
  const group = active.group;
  const venues = await listVenues(group.id);

  return (
    <form action={createSessionAction} className="card space-y-4 p-5">
      <input type="hidden" name="groupId" value={group.id} />

      <div>
        <h2 className="text-lg font-bold">New session</h2>
        <p className="mt-1 text-sm text-muted">
          Creates a shareable link and a signed QR check-in code straight away.
        </p>
      </div>

      <label className="block">
        <span className="label">Session name</span>
        <input className="input mt-1" name="name" defaultValue="Saturday Badminton" required />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Date</span>
          <input className="input mt-1" name="date" type="date" defaultValue={nextSaturday()} required />
        </label>
        <label className="block">
          <span className="label">Starts</span>
          <input className="input mt-1" name="startTime" type="time" defaultValue="19:00" required />
        </label>
        <label className="block">
          <span className="label">Ends</span>
          <input className="input mt-1" name="endTime" type="time" defaultValue="22:00" required />
        </label>
      </div>

      <label className="block">
        <span className="label">Venue</span>
        <select className="input mt-1" name="venueId" defaultValue={venues[0]?.id ?? ""}>
          <option value="">No venue set</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Courts</span>
          <input className="input mt-1" name="courtCount" type="number" min={1} max={12} defaultValue={4} />
        </label>
        <label className="block">
          <span className="label">Max players</span>
          <input className="input mt-1" name="capacity" type="number" min={4} max={80} defaultValue={26} />
        </label>
        <label className="block">
          <span className="label">Fee ({group.currency})</span>
          <input className="input mt-1" name="fee" type="number" min={0} step={5} defaultValue={group.defaultFee} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Game type</span>
          <select className="input mt-1" name="gameType" defaultValue="balanced">
            <option value="casual">Casual, maximum mixing</option>
            <option value="balanced">Casual balanced (recommended)</option>
            <option value="competitive">Competitive, ratings matter</option>
            <option value="social">Social, never the same four</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Points per game</span>
          <input className="input mt-1" name="pointsTo" type="number" min={11} max={31} defaultValue={group.settings.pointsTo} />
        </label>
      </div>

      <label className="block">
        <span className="label">Notes</span>
        <input className="input mt-1" name="notes" placeholder="Shuttle type, parking, anything else" />
      </label>

      <SubmitButton className="btn btn-primary w-full" pendingLabel="Creating...">
        Create session
      </SubmitButton>
    </form>
  );
}
