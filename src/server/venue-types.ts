import type { GeocodeHit } from "@/lib/geocode";

/** Kept out of the "use server" module, which may only export functions. */
export type VenueState =
  | { status: "idle" }
  | { status: "hits"; hits: GeocodeHit[] }
  | { status: "error"; message: string };

export const VENUE_IDLE: VenueState = { status: "idle" };
