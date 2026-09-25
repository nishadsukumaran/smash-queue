import { activeCommunity } from "@/lib/tenant";
import { listVenues } from "@/server/queries";
import { createTournamentAction } from "@/server/tournament-actions";
import { SaveButton, TournamentFields } from "@/components/tournament/TournamentForm";
import { Flash } from "@/components/tournament/bits";

export const dynamic = "force-dynamic";

export default async function NewTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; e?: string }>;
}) {
  const sp = await searchParams;
  const active = await activeCommunity();
  if (!active) return null;
  const venues = await listVenues(active.group.id);

  return (
    <div className="space-y-3">
      <Flash m={sp.m} e={sp.e} />
      <form action={createTournamentAction} className="card space-y-4 p-5">
        <input type="hidden" name="groupId" value={active.group.id} />
        <input type="hidden" name="next" value="/admin/tournaments/new" />
        <div>
          <h2 className="text-lg font-bold">New tournament</h2>
          <p className="mt-1 text-sm text-muted">
            Saved as a draft that only organizers can see. Next you add the categories (Men&apos;s
            Doubles A, Mixed B...), fees and prizes, then publish.
          </p>
        </div>
        <TournamentFields venues={venues} />
        <SaveButton label="Save draft" />
      </form>
    </div>
  );
}
