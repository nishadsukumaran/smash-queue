import "server-only";
import { headers } from "next/headers";

/**
 * The public origin this request arrived on.
 *
 * Derived from the request rather than configuration, because the one thing
 * built from it - the QR check-in URL - is printed and stuck to a wall. A
 * hardcoded base URL is wrong on every preview deployment, wrong the day a
 * custom domain is added, and wrong silently: the code scans, the phone goes
 * somewhere else, and nobody finds out until twenty people are queuing at the
 * door.
 *
 * APP_BASE_URL still wins when set, so a deployment behind a proxy that
 * rewrites Host can pin it explicitly. Deliberately not a NEXT_PUBLIC_ name:
 * those are inlined into the bundle at build time, and a value baked into the
 * build cannot follow the domain it is served from.
 */
export async function requestOrigin(): Promise<string> {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";

  const proto =
    h.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${proto}://${host}`;
}
