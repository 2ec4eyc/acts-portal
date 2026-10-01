import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { tablesInLoadOrder } from "./tables.js";

/** Copies every table to one JSON file in `dir` and returns its path and per-table row counts. */
export async function takeBackup(pool: Pool, dir: string) {
  const tables: Record<string, unknown[]> = {};
  for (const table of await tablesInLoadOrder(pool)) {
    // row_to_json keeps Postgres' own text forms (dates, bytea as \x hex) so restore round-trips exactly.
    const { rows } = await pool.query(`SELECT coalesce(json_agg(t), '[]') AS rows FROM "${table}" t`);
    tables[table] = rows[0].rows;
  }
  const migrations = (await pool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count;
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), migrations: Number(migrations), tables }));
  return { file, counts: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])) };
}
