/**
 * Applies pending migrations, and baselines a database that predates them.
 *
 * The first fifteen tables were created with `drizzle-kit push`, so production
 * already has them but has never heard of a migration. Running 0000 there would
 * fail on "relation already exists". So: if the app tables are present and the
 * ledger is not, the ledger is written as though 0000 had run, and every
 * migration after it applies normally. A genuinely empty database just runs
 * everything from the top.
 *
 *   DATABASE_URL=... npm run db:migrate
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const MIGRATIONS = join(process.cwd(), "drizzle");
const BASELINE_TAG = "0000_baseline";

type JournalEntry = { idx: number; when: number; tag: string };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const sql = neon(url);

  const [{ exists: hasAppTables }] = (await sql`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'groups'
    ) as exists
  `) as [{ exists: boolean }];

  const [{ exists: hasLedger }] = (await sql`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
    ) as exists
  `) as [{ exists: boolean }];

  if (hasAppTables && !hasLedger) {
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS, "meta", "_journal.json"), "utf8"),
    ) as { entries: JournalEntry[] };
    const baseline = journal.entries.find((e) => e.tag === BASELINE_TAG);
    if (!baseline) throw new Error(`No ${BASELINE_TAG} entry in the journal.`);

    const body = readFileSync(join(MIGRATIONS, `${BASELINE_TAG}.sql`), "utf8");
    const hash = createHash("sha256").update(body).digest("hex");

    await sql`create schema if not exists drizzle`;
    await sql`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `;
    await sql`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${hash}, ${baseline.when})
    `;
    console.log(`Baselined an existing database at ${BASELINE_TAG}.`);
  }

  await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
  console.log("Migrations up to date.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
