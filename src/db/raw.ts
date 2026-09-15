/** Script-side connection used by the seed, the bootstrap and the simulator. */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function openDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set.");
  return { db: drizzle(neon(url), { schema }) };
}
