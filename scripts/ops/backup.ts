// Copies every table to one JSON file (backups/<timestamp>.json). It contains personal data:
// keep it somewhere private. Restore with scripts/ops/restore.ts.
// Usage: DATABASE_URL_UNPOOLED=... npx tsx scripts/ops/backup.ts [--yes] [--out backups]
import { takeBackup } from "./backup-lib.js";
import { arg, connect } from "./connect.js";

const pool = connect();
const { file, counts } = await takeBackup(pool, arg("out") ?? "backups");
for (const [table, n] of Object.entries(counts)) console.log(`${table}: ${n}`);
console.log(`Saved ${file}`);
await pool.end();
