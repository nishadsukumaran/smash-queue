/**
 * A community's address bar identity.
 *
 * Slugs are generated once, when the community is created, and then left
 * alone even if the name changes — a link pasted into a WhatsApp group in
 * March should still work in December, and renaming "Sat Badminton" to
 * "Saturday Smashers" is not a good enough reason to break every one of them.
 */

/** Words that would collide with a real route if a community claimed them. */
const RESERVED = new Set([
  "admin", "hq", "api", "signin", "signout", "who", "me", "guide", "members",
  "communities", "join", "i", "s", "new", "settings", "public", "static",
  "favicon", "icon", "manifest", "robots", "sitemap", "null", "undefined",
]);

export function slugify(raw: string): string {
  const base = raw
    .normalize("NFKD")
    // Strip accents rather than dropping the letters they sit on, so
    // "Cañada" becomes "canada" and not "caada".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");

  if (!base || RESERVED.has(base)) return base ? `${base}-club` : "community";
  // A slug of pure digits would be indistinguishable from an id in a URL.
  if (/^\d+$/.test(base)) return `c-${base}`;
  return base;
}

/**
 * Makes a slug unique against the ones already taken, by counting up. Two
 * communities really can be called the same thing, and refusing the second
 * one would be a strange thing to tell an organizer.
 */
export function uniqueSlug(raw: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(raw);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const isValidSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 60;
