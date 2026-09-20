/**
 * Sanitises a post-sign-in redirect target.
 *
 * Without this, `/signin?next=https://evil.example` would bounce a freshly
 * signed-in staff member onto someone else's site — an open redirect, and a
 * convincing one because the link genuinely starts on our domain. Only
 * same-site absolute paths are allowed through.
 */
export function safeNext(next: string | undefined, fallback = "/admin") {
  if (!next) return fallback;
  // Must start with a single slash: "//evil.example" is protocol-relative and
  // would leave the site, and "https://..." obviously would.
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  return next;
}
