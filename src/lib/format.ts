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
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** 19:00 -> 7:00 PM */
export function prettyTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

export const PLAYER_COLORS = [
  "#3DD9A4", "#D7F75B", "#FFC24B", "#FF8FA3", "#8BD3FF",
  "#C792EA", "#7BE3B8", "#FFD98E", "#FF9F7A", "#9DB8FF",
];

export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}
