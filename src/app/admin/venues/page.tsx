import { getGroup, listVenues } from "@/server/queries";
import { VenueForm } from "@/components/VenueForm";
import { VenueMap } from "@/components/VenueMap";
import { directionsUrl, validCoords } from "@/lib/geocode";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const group = await getGroup();
  if (!group) return null;
  const venues = await listVenues(group.id);

  return (
    <div className="space-y-4">
      <VenueForm groupId={group.id} countryCode="ae" />

      <section className="space-y-3">
        {venues.length === 0 && (
          <p className="card p-4 text-sm text-muted">No venues yet.</p>
        )}
        {venues.map((v) => {
          const coords = validCoords(v.latitude, v.longitude);
          return (
            <div key={v.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{v.name}</p>
                  <p className="text-sm text-muted">{v.address ?? "No address"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="chip">{v.courtCount} courts</span>
                    {coords ? (
                      <a
                        href={directionsUrl(coords[0], coords[1])}
                        target="_blank"
                        rel="noreferrer"
                        className="chip chip-teal"
                      >
                        Directions
                      </a>
                    ) : (
                      <span className="chip chip-amber">No location set</span>
                    )}
                  </div>
                </div>
                {coords && (
                  <div className="w-full sm:w-64">
                    <VenueMap
                      value={{ lat: coords[0], lng: coords[1] }}
                      interactive={false}
                      height={140}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
