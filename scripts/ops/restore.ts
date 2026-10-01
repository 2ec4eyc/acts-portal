// Loads a backup from scripts/ops/backup.ts into an EMPTY database that already has the schema
// (run `npm run db:migrate` first, at the same migration level as the backup). One transaction.
// Usage: DATABASE_URL_UNPOOLED=... npx tsx scripts/ops/restore.ts --file backups/<file>.json [--yes]
import { readFileSync } from "node:fs";
import { arg, connect } from "./connect.js";
import { tablesInLoadOrder } from "./tables.js";

const file = arg("file");
if (!file) throw new Error("Usage: restore.ts --file backups/<file>.json [--yes]");
const backup = JSON.parse(readFileSync(file, "utf8")) as { migrations: number; tables: Record<string, unknown[]> };
const pool = connect();

const migrations = Number((await pool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count);
if (migrations !== backup.migrations) {
  throw new Error(`The database is at ${migrations} migrations but the backup was taken at ${backup.migrations}.`);
}
const order = await tablesInLoadOrder(pool);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  // Restored rows are history, not new changes: keep the audit trigger from logging them again.
  await client.query("SELECT set_config('app.audit_off', 'on', true)");
  for (const table of order) {
    const { rows } = await client.query(`SELECT exists(SELECT 1 FROM "${table}") AS used`);
    if (rows[0].used) throw new Error(`Refusing to restore: "${table}" is not empty.`);
  }
  for (const table of order) {
    const rows = backup.tables[table] ?? [];
    if (rows.length) {
      await client.query(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(null::"${table}", $1)`, [JSON.stringify(rows)]);
    }
    console.log(`${table}: ${rows.length}`);
  }
  // Move serial sequences past the restored ids.
  const { rows: seqs } = await client.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`);
  for (const { table_name, column_name } of seqs) {
    await client.query(`SELECT setval(pg_get_serial_sequence($1, $2), coalesce((SELECT max("${column_name}") FROM "${table_name}"), 0) + 1, false)`,
      [`"${table_name}"`, column_name]);
  }
  // Invoice numbers continue after the highest restored one.
  if ((await client.query("SELECT to_regclass('invoice_number_seq') AS seq")).rows[0].seq) {
    await client.query(`SELECT setval('invoice_number_seq', greatest(1, coalesce((SELECT max(split_part(number, '-', 3)::int) FROM invoices), 0)),
      (SELECT count(*) > 0 FROM invoices))`);
  }
  await client.query("COMMIT");
  console.log("Restore complete.");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
  await pool.end();
}
