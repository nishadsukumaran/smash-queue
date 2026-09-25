/**
 * The group's wall-clock timezone.
 *
 * Every timestamp here is rendered on the server. Left to its own devices a
 * server formats in ITS locale, which is UTC on Vercel - so a 19:54 check-in
 * in Abu Dhabi would display as 15:54 to everyone. Pin it explicitly.
 */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Dubai";

export function money(amount: number, currency = "AED") {
  return `${currency} ${amount.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function clockTime(ts: number | Date | null | undefined) {
  if (!ts) return "--:--";
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

export function minutesSince(ts: number | Date | null | undefined, now = Date.now()) {
  if (!ts) return 0;
  const t = ts instanceof Date ? ts.getTime() : ts;
  return Math.max(0, Math.floor((now - t) / 60000));
}

export function duration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function prettyDate(iso: string) {
  // Noon UTC lands on the same calendar day everywhere from UTC-11 to UTC+11,
  // so a plain date string never slips a day depending on who renders it.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TIME_ZONE,
  });
}

/** 19:00 -> 7:00 PM */
export function prettyTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

// Lives in palette.ts with the rest of the theme; re-exported here because
// every existing caller imports it from format, and colorFor below needs it
// in scope rather than merely passed through.
import { PLAYER_COLORS } from "@/lib/palette";
export { PLAYER_COLORS };

export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

/**
 * A timestamp a person can place: "Sat 20 Sept, 21:14".
 *
 * Carries the date as well as the clock because this is used for things that
 * may have happened days ago — a join request sitting unanswered over a week
 * reads as "just now" if you only print the time.
 */
export function prettyDateTime(ts: number | Date | null | undefined) {
  if (ts === null || ts === undefined) return "";
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  });
}
