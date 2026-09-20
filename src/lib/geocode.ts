import "server-only";

/**
 * Turns a typed address into coordinates, using Nominatim — OpenStreetMap's
 * own geocoder. No API key, no billing account, no card on file.
 *
 * Run from the server rather than the browser for two reasons. Nominatim's
 * usage policy requires a User-Agent identifying the application, which a
 * browser will not let you set; and going direct from the client would hand
 * every organizer's IP and the address they are looking up to a third party
 * for no benefit.
 *
 * The same policy caps this at one request a second and forbids
 * autocomplete-style lookups firing on every keystroke. So this is wired to a
 * button the organizer presses, not to an input's onChange — which is also the
 * better interaction, because a venue gets added once and then never again.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const CONTACT = process.env.NOMINATIM_CONTACT || "hello@aiops.ae";
const UA = `SmashQueue/1.0 (${CONTACT})`;

export type GeocodeHit = {
  label: string;
  latitude: number;
  longitude: number;
};

export type GeocodeResult =
  | { ok: true; hits: GeocodeHit[] }
  | { ok: false; reason: "empty" | "unavailable" };

export async function geocode(query: string, countryCode?: string): Promise<GeocodeResult> {
  const q = query.trim();
  if (q.length < 3) return { ok: false, reason: "empty" };

  const url = new URL(ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "0");
  // Biases results without excluding anything: a group in Abu Dhabi searching
  // "Sports City" wants the one down the road, not the one in another country.
  if (countryCode) url.searchParams.set("countrycodes", countryCode.toLowerCase());

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      // A venue's coordinates do not move. Caching keeps repeat lookups off
      // Nominatim entirely, which is the polite way to use a free service.
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };

    const rows = (await res.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;

    const hits = rows
      .map((r) => ({
        label: r.display_name ?? "",
        latitude: Number(r.lat),
        longitude: Number(r.lon),
      }))
      .filter((h) => h.label && Number.isFinite(h.latitude) && Number.isFinite(h.longitude));

    return hits.length ? { ok: true, hits } : { ok: false, reason: "empty" };
  } catch {
    // Offline, blocked egress, or Nominatim having a bad day. The caller falls
    // back to dropping a pin by hand, so this is never fatal.
    return { ok: false, reason: "unavailable" };
  }
}

/** Coordinates that are actually on Earth, and not the null island default. */
export function validCoords(lat: unknown, lon: unknown): [number, number] | null {
  const a = Number(lat);
  const b = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  if (a === 0 && b === 0) return null;
  return [a, b];
}

/**
 * A directions link that works everywhere without a provider.
 *
 * The geo: scheme opens the phone's own maps app, but desktop browsers ignore
 * it, so this uses the OpenStreetMap web URL: it renders for anyone, and both
 * Google and Apple Maps are one tap away from there. Nothing here depends on
 * the visitor having a particular app or account.
 */
export function directionsUrl(lat: number, lon: number, zoom = 17) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}
