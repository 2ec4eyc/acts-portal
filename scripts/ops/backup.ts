// Copies every table to one JSON file (backups/<timestamp>.json). It contains personal data:
// keep it somewhere private. Restore with scripts/ops/restore.ts.
// Usage: DATABASE_URL_UNPOOLED=... npx tsx scripts/ops/backup.ts [--yes] [--out backups]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { arg, connect } from "./connect.js";
import { tablesInLoadOrder } from "./tables.js";

const pool = connect();
const tables: Record<string, unknown[]> = {};
for (const table of await tablesInLoadOrder(pool)) {
  // row_to_json keeps Postgres' own text forms (dates, bytea as \x hex) so restore round-trips exactly.
  const { rows } = await pool.query(`SELECT coalesce(json_agg(t), '[]') AS rows FROM "${table}" t`);
  tables[table] = rows[0].rows;
  console.log(`${table}: ${tables[table].length}`);
}
const migrations = (await pool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count;
const dir = arg("out") ?? "backups";
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), migrations: Number(migrations), tables }));
console.log(`Saved ${file}`);
await pool.end();
