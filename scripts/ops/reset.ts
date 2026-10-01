// Starts the portal over: backs up the database, empties every table, deletes EVERY Firebase login,
// and creates one new admin, who sets their own password through a printed link.
// The schema and migration history stay, so the site keeps working.
// Usage: DATABASE_URL_UNPOOLED=... GOOGLE_APPLICATION_CREDENTIALS=... \
//   npx tsx scripts/ops/reset.ts --admin-email you@example.com --first Ada --last Admin [--yes]
// Then type DELETE EVERYTHING when asked.
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { takeBackup } from "./backup-lib.js";
import { arg, connect } from "./connect.js";
import { tablesInLoadOrder } from "./tables.js";

const CONFIRMATION = "DELETE EVERYTHING";
const email = arg("admin-email")?.trim().toLowerCase();
const first = arg("first")?.trim();
const last = arg("last")?.trim();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !first || !last) {
  console.error("Usage: reset.ts --admin-email you@example.com --first <first name> --last <last name> [--yes]");
  process.exit(2);
}

const pool = connect();
const host = new URL((process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)!).hostname;
const projectId = process.env.FIREBASE_PROJECT_ID ?? "acts-bible-school-portal";
console.log(`This permanently deletes ALL portal data on ${host} and ALL Firebase logins of project ${projectId}.`);
console.log(`Afterwards the only account will be the admin ${email}.`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question(`Type ${CONFIRMATION} to continue: `)).trim();
rl.close();
if (answer !== CONFIRMATION) {
  console.error("Not confirmed. Nothing was changed.");
  await pool.end();
  process.exit(1);
}

// 1. Backup first: if this fails, nothing is deleted.
const { file } = await takeBackup(pool, arg("out") ?? "backups");
console.log(`Backup saved to ${file}`);

// 2. Empty every table in one transaction (schema and drizzle migration history stay).
const tables = await tablesInLoadOrder(pool);
await pool.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
await pool.query("DO $$ BEGIN IF to_regclass('invoice_number_seq') IS NOT NULL THEN ALTER SEQUENCE invoice_number_seq RESTART; END IF; END $$");
console.log(`Emptied ${tables.length} tables.`);

// 3. Delete every Firebase login.
const app = initializeApp(process.env.FIREBASE_AUTH_EMULATOR_HOST ? { projectId } : { projectId, credential: applicationDefault() });
const auth = getAuth(app);
let deleted = 0;
for (;;) {
  const page = await auth.listUsers(1000);
  if (!page.users.length) break;
  const result = await auth.deleteUsers(page.users.map((u) => u.uid));
  if (result.failureCount) throw new Error(`Could not delete ${result.failureCount} login(s): ${result.errors[0]?.error.message}`);
  deleted += result.successCount;
}
console.log(`Deleted ${deleted} Firebase login(s).`);

// 4. The first admin: a login with a random password nobody sees, then a link to choose their own.
const login = await auth.createUser({ email, password: randomBytes(24).toString("base64url"), displayName: `${first} ${last}` });
const { rows } = await pool.query(
  `INSERT INTO users (firebase_uid, email, first_name, last_name, role, staff_category, status)
   VALUES ($1, $2, $3, $4, 'admin', 'admin', 'active') RETURNING id`,
  [login.uid, email, first, last]);
await pool.query(
  "INSERT INTO audit_log (actor_id, action, entity, entity_id, data) VALUES ($1, 'system.reset', 'system', 'all', $2)",
  [rows[0].id, JSON.stringify({ backup: file, firebaseLoginsDeleted: deleted })]);
const link = await auth.generatePasswordResetLink(email);
console.log(`\nCreated admin ${first} ${last} <${email}>.`);
console.log(`Open this link to set the password (it expires in about an hour):\n${link}\n`);
console.log("If it expires: Firebase console > Authentication > Users > this user > Reset password sends a new link by email.");
await pool.end();
