// Restores admin access when no admin can sign in (roles live only in Postgres).
// Promotes the account with this email to an active admin; if it has a Firebase login but no portal
// account yet, creates one. Recorded in audit_log.
// Usage: DATABASE_URL_UNPOOLED=... npx tsx scripts/ops/admin-grant.ts --email someone@example.com [--yes]
//   Production also needs GOOGLE_APPLICATION_CREDENTIALS when the portal account doesn't exist yet.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { arg, connect } from "./connect.js";

const email = arg("email")?.trim();
if (!email) throw new Error("Usage: admin-grant.ts --email someone@example.com [--yes]");
const pool = connect();

const existing = await pool.query("SELECT id, role, status FROM users WHERE lower(email) = lower($1)", [email]);
let id: string;
if (existing.rowCount) {
  const before = existing.rows[0];
  id = before.id;
  await pool.query(
    "UPDATE users SET role = 'admin', status = 'active', archived_at = NULL, updated_at = now() WHERE id = $1", [id]);
  console.log(`${email}: ${before.role}/${before.status} -> admin/active`);
} else {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "acts-bible-school-portal";
  const app = initializeApp(process.env.FIREBASE_AUTH_EMULATOR_HOST ? { projectId } : { projectId, credential: applicationDefault() });
  const login = await getAuth(app).getUserByEmail(email).catch(() => null);
  if (!login) throw new Error(`No portal account and no Firebase login for ${email}. Create the login in Firebase first.`);
  const [first, ...rest] = (login.displayName ?? email.split("@")[0]).split(" ");
  const created = await pool.query(
    "INSERT INTO users (firebase_uid, email, first_name, last_name, role, status) VALUES ($1, $2, $3, $4, 'admin', 'active') RETURNING id",
    [login.uid, login.email ?? email, first, rest.join(" ") || "Admin"]);
  id = created.rows[0].id;
  console.log(`${email}: created an admin account for Firebase login ${login.uid}`);
}
await pool.query(
  "INSERT INTO audit_log (action, entity, entity_id, data) VALUES ('user.admin_granted', 'user', $1, $2)",
  [id, JSON.stringify({ via: "scripts/ops/admin-grant.ts", email })]);
await pool.end();
