"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

/**
 * A map for placing a venue pin, and for showing where one is.
 *
 * Leaflet is bundled rather than pulled from a CDN, which keeps the app's
 * no-third-party-script rule intact, and imported lazily inside an effect
 * because it reaches for `window` at module scope and would break the server
 * render otherwise.
 *
 * Tiles come from OpenStreetMap — no key, no billing account — and are run
 * through a CSS filter rather than swapped for a dark-themed provider. That
 * keeps it to one tile source and one attribution, and a filtered map is
 * legible enough for the job: dropping a pin on a sports hall you already know
 * the location of.
 *
 * Nothing here is required. The map failing to load leaves the latitude and
 * longitude fields perfectly usable, which matters because an organizer on
 * venue wifi is exactly who will see it fail.
 */

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export type LatLng = { lat: number; lng: number };

export function VenueMap({
  value,
  onChange,
  center = { lat: 24.4539, lng: 54.3773 }, // Abu Dhabi, only used before a pin exists
  zoom = 12,
  interactive = true,
  height = 260,
  label,
}: {
  value: LatLng | null;
  onChange?: (next: LatLng) => void;
  center?: LatLng;
  zoom?: number;
  interactive?: boolean;
  height?: number;
  label?: string;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const pin = useRef<Marker | null>(null);
  // The bundled module, kept so later effects can make markers without
  // reaching for a global that a bundled import never creates.
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);

  // Kept in a ref so a new callback identity each render does not tear the
  // map down and rebuild it.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let created: LeafletMap | null = null;

    (async () => {
      try {
        const L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");
        if (cancelled || !holder.current || map.current) return;
        leaflet.current = L;

        created = L.map(holder.current, {
          center: [value?.lat ?? center.lat, value?.lng ?? center.lng],
          zoom: value ? 16 : zoom,
          zoomControl: interactive,
          dragging: interactive,
          scrollWheelZoom: false, // never hijack the page scroll on a phone
          doubleClickZoom: interactive,
          attributionControl: true,
        });

        L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIB, maxZoom: 19 }).addTo(created);

        const icon = L.divIcon({
          className: "venue-pin",
          html: '<span aria-hidden="true"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        if (value) pin.current = L.marker([value.lat, value.lng], { icon }).addTo(created);

        if (interactive) {
          created.on("click", (e: { latlng: { lat: number; lng: number } }) => {
            const next = { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) };
            if (pin.current) pin.current.setLatLng([next.lat, next.lng]);
            else pin.current = L.marker([next.lat, next.lng], { icon }).addTo(created!);
            onChangeRef.current?.(next);
          });
        }

        map.current = created;
        // Leaflet measures its container on creation; inside a card that is
        // still settling that measurement is wrong and the tiles tile wrong.
        setTimeout(() => created?.invalidateSize(), 60);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
      pin.current = null;
    };
    // Built once. Later coordinate changes are pushed in by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow coordinates changed elsewhere — by the address search, or by
  // someone typing into the latitude field directly.
  useEffect(() => {
    const m = map.current;
    const L = leaflet.current;
    if (!m || !L || !value) return;
    if (pin.current) {
      pin.current.setLatLng([value.lat, value.lng]);
    } else {
      pin.current = L.marker([value.lat, value.lng], {
        icon: L.divIcon({
          className: "venue-pin",
          html: '<span aria-hidden="true"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(m);
    }
    m.setView([value.lat, value.lng], Math.max(m.getZoom(), 16));
  }, [value?.lat, value?.lng]);

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-line bg-surface p-4 text-center text-xs text-muted"
        style={{ height }}
      >
        The map couldn&apos;t load. Type the coordinates below instead — everything still works.
      </div>
    );
  }

  return (
    <div>
      {label && <p className="label mb-1">{label}</p>}
      <div
        ref={holder}
        style={{ height }}
        className="venue-map overflow-hidden rounded-xl border border-line"
        role="application"
        aria-label={interactive ? "Map. Click to place the venue pin." : "Venue location"}
      />
      {interactive && (
        <p className="mt-1 text-xs text-muted">Tap the map to move the pin.</p>
      )}
    </div>
  );
}
