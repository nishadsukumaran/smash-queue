import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Point it at a Neon connection string (see README).",
  );
}

/**
 * Neon over HTTP: one round trip per query, no connection pool to exhaust, and
 * it behaves identically in a Vercel function, a local `next dev` and a plain
 * node script. The trade-off is no interactive transactions, which is why every
 * write in src/server/actions.ts is a self-contained statement.
 */
export const db = drizzle(neon(url), { schema });
export { schema };
