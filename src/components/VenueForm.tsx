"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { VenueMap, type LatLng } from "@/components/VenueMap";
import { addVenueAction } from "@/server/form-actions";
import { geocodeAction } from "@/server/geocode-actions";
import { VENUE_IDLE, type VenueState } from "@/server/venue-types";

/**
 * Adding a venue: a name, an address, and where it actually is.
 *
 * Three ways to set the location, because each one fails differently. Search
 * the address — best when OpenStreetMap knows the place. Tap the map — best
 * when it does not, which for Gulf sports halls is often. Type the numbers —
 * the one that still works when the tiles will not load, which is the case an
 * organizer standing in a venue on bad wifi will actually hit.
 *
 * None of it is required. A venue with only a name is still a venue.
 */
export function VenueForm({ groupId, countryCode }: { groupId: string; countryCode?: string }) {
  const [pin, setPin] = useState<LatLng | null>(null);
  const [address, setAddress] = useState("");
  const [search, searchAction] = useActionState<VenueState, FormData>(geocodeAction, VENUE_IDLE);

  // A hit the organizer picked wins over whatever the map last reported.
  const chosen = pin;

  return (
    <section className="card p-4">
      <h2 className="label">Add a venue</h2>

      {/* Search is its own form: it must not submit the venue. */}
      <form action={searchAction} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="countryCode" value={countryCode ?? ""} />
        <input
          className="input min-w-0 flex-1"
          name="query"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Search an address or place name"
          aria-label="Search for the venue address"
        />
        <SubmitButton className="btn btn-ghost" pendingLabel="Searching...">
          Find on map
        </SubmitButton>
      </form>

      {search.status === "error" && (
        <p className="mt-2 text-xs text-amber">{search.message}</p>
      )}

      {search.status === "hits" && (
        <ul className="mt-2 space-y-1">
          {search.hits.map((h) => (
            <li key={`${h.latitude},${h.longitude}`}>
              <button
                type="button"
                onClick={() => {
                  setPin({ lat: h.latitude, lng: h.longitude });
                  setAddress(h.label);
                }}
                className="w-full rounded-lg border border-line px-3 py-2 text-left text-xs text-muted hover:border-teal hover:text-chalk"
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <VenueMap value={chosen} onChange={setPin} height={240} />
      </div>

      <form action={addVenueAction} className="mt-3 grid gap-2 sm:grid-cols-4">
        <input type="hidden" name="groupId" value={groupId} />
        <input className="input sm:col-span-2" name="name" placeholder="Sports hall" required />
        <input
          className="input sm:col-span-2"
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address (optional)"
        />
        <input
          className="input"
          name="latitude"
          value={chosen?.lat ?? ""}
          onChange={(e) => {
            const lat = Number(e.target.value);
            setPin((p) => ({ lat: Number.isFinite(lat) ? lat : 0, lng: p?.lng ?? 0 }));
          }}
          placeholder="Latitude"
          inputMode="decimal"
          aria-label="Latitude"
        />
        <input
          className="input"
          name="longitude"
          value={chosen?.lng ?? ""}
          onChange={(e) => {
            const lng = Number(e.target.value);
            setPin((p) => ({ lat: p?.lat ?? 0, lng: Number.isFinite(lng) ? lng : 0 }));
          }}
          placeholder="Longitude"
          inputMode="decimal"
          aria-label="Longitude"
        />
        <input
          className="input"
          name="courtCount"
          type="number"
          min={1}
          max={20}
          defaultValue={4}
          aria-label="Number of courts"
        />
        <SubmitButton className="btn btn-primary">Add venue</SubmitButton>
      </form>
    </section>
  );
}
