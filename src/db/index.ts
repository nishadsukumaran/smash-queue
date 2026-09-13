import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "./data/smash.db";
const file = resolve(/* turbopackIgnore: true */ process.cwd(), url);
mkdirSync(dirname(file), { recursive: true });

const globalForDb = globalThis as unknown as { __smashDb?: Database.Database };

const sqlite = globalForDb.__smashDb ?? new Database(file);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
if (process.env.NODE_ENV !== "production") globalForDb.__smashDb = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
