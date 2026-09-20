"use server";

import { geocode } from "@/lib/geocode";
import { currentAccount } from "@/lib/auth";
import type { VenueState } from "./venue-types";

/**
 * Address lookup for the venue form.
 *
 * Behind a signed-in check even though the results are public data: without
 * one this is an open proxy onto Nominatim running under our User-Agent, and
 * their usage policy makes us responsible for the traffic.
 */
export async function geocodeAction(_prev: VenueState, fd: FormData): Promise<VenueState> {
  if (!(await currentAccount())) {
    return { status: "error", message: "Sign in first." };
  }

  const query = String(fd.get("query") ?? "").trim();
  const country = String(fd.get("countryCode") ?? "").trim() || undefined;

  if (query.length < 3) {
    return { status: "error", message: "Type a bit more of the address." };
  }

  const res = await geocode(query, country);
  if (res.ok) return { status: "hits", hits: res.hits };

  return {
    status: "error",
    message:
      res.reason === "empty"
        ? "Nothing found. Tap the map to place the pin yourself — that works just as well."
        : "The address lookup is unreachable. Tap the map instead.",
  };
}
