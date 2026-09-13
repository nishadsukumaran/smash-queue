import { SubmitButton } from "@/components/SubmitButton";
import { getGroup, listVenues } from "@/server/queries";
import { addVenueAction } from "@/server/form-actions";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const group = await getGroup();
  if (!group) return null;
  const venues = await listVenues(group.id);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="label">Add a venue</h2>
        <form action={addVenueAction} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="groupId" value={group.id} />
          <input className="input" name="name" placeholder="Sports hall" required />
          <input className="input sm:col-span-2" name="address" placeholder="Address" />
          <div className="flex gap-2">
            <input className="input" name="courtCount" type="number" min={1} max={20} defaultValue={4} />
            <SubmitButton className="btn btn-primary">Add</SubmitButton>
          </div>
        </form>
      </section>

      <section className="card divide-y divide-line">
        {venues.length === 0 && <p className="p-4 text-sm text-muted">No venues yet.</p>}
        {venues.map((v) => (
          <div key={v.id} className="p-4">
            <p className="font-semibold">{v.name}</p>
            <p className="text-sm text-muted">{v.address ?? "No address"}</p>
            <span className="chip mt-2">{v.courtCount} courts</span>
          </div>
        ))}
      </section>
    </div>
  );
}
