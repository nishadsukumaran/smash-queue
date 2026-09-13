/** Script-side (non-Next) connection used by seeds, tests and the simulator. */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export function openDb(url = process.env.DATABASE_URL ?? "./data/smash.db") {
  const file = resolve(process.cwd(), url);
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  return { db: drizzle(sqlite, { schema }), sqlite };
}
