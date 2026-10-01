// Operations scripts: admin recovery, and backup -> restore round trip.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { route, call, setup, signIn, PROJECT, type Fixture } from "./helpers.js";

let f: Fixture;
const run = (script: string, args: string[]) =>
  execFileSync("npx", ["tsx", `scripts/ops/${script}.ts`, ...args], { env: process.env, stdio: "pipe" }).toString();
const one = async (sql: string, params: unknown[] = []) => (await f.pool.query(sql, params)).rows[0];

before(async () => { f = await setup(); });
after(() => f.close());

describe("admin-grant", () => {
  test("promotes an existing account and records it", async () => {
    run("admin-grant", ["--email", "STUDENT2@acts.test"]);
    const u = await one("SELECT role, status FROM users WHERE email = 'student2@acts.test'");
    assert.deepEqual(u, { role: "admin", status: "active" });
    assert.ok(await one("SELECT 1 FROM audit_log WHERE action = 'user.admin_granted'"));
    const me = await call(await route("me"), { token: f.tokens.student2 });
    assert.equal(me.body.role, "admin");
  });

  test("restores an archived account", async () => {
    run("admin-grant", ["--email", "old@acts.test"]);
    assert.deepEqual(await one("SELECT role, status, archived_at FROM users WHERE email = 'old@acts.test'"),
      { role: "admin", status: "active", archived_at: null });
  });

  test("creates a portal account for a Firebase login that has none", async () => {
    // The fixture's "stranger" signed up in Firebase but has no portal account.
    assert.equal((await call(await route("me"), { token: f.tokens.stranger })).status, 403);
    run("admin-grant", ["--email", "stranger@acts.test"]);
    const me = await call(await route("me"), { token: f.tokens.stranger });
    assert.equal(me.status, 200);
    assert.equal(me.body.role, "admin");
  });

  test("fails for an email with no login", () => {
    assert.throws(() => run("admin-grant", ["--email", "nobody@acts.test"]), /No portal account and no Firebase login/);
  });

  test("asks for --yes before touching a remote database", () => {
    assert.throws(() => execFileSync("npx", ["tsx", "scripts/ops/admin-grant.ts", "--email", "x@acts.test"], {
      env: { ...process.env, DATABASE_URL: "postgres://u:p@db.example.com/acts", DATABASE_URL_UNPOOLED: "" }, stdio: "pipe",
    }), /--yes/);
  });
});

describe("backup and restore", () => {
  test("a restored database matches the original row for row", async () => {
    const snapshot = async () => {
      const tables = (await f.pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")).rows;
      const out: Record<string, string> = {};
      for (const { tablename } of tables) {
        out[tablename] = (await one(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${tablename}" t`)).h;
      }
      return out;
    };
    const before = await snapshot();
    assert.ok(Number((await one("SELECT count(*) FROM material_files")).count) > 0, "seed has file bytes to round-trip");

    const dir = mkdtempSync(path.join(os.tmpdir(), "acts-backup-"));
    run("backup", ["--out", dir]);
    const [file] = readdirSync(dir);

    // Empty schema at the same migration level, then restore.
    await f.pool.query("DROP SCHEMA public CASCADE; DROP SCHEMA drizzle CASCADE; CREATE SCHEMA public;");
    execFileSync("npx", ["drizzle-kit", "migrate"], { env: process.env, stdio: "pipe" });
    run("restore", ["--file", path.join(dir, file)]);
    assert.deepEqual(await snapshot(), before);

    // Sequences moved past restored ids: new rows still insert.
    await f.pool.query("INSERT INTO audit_log (action, entity, entity_id) VALUES ('test', 'x', '1')");
    // A second restore refuses to overwrite data.
    assert.throws(() => run("restore", ["--file", path.join(dir, file)]), /not empty/);
  });
});

describe("reset", () => {
  const reset = (args: string[], input: string) =>
    execFileSync("npx", ["tsx", "scripts/ops/reset.ts", ...args], { env: process.env, input, stdio: "pipe" }).toString();
  const emulatorLogins = async () => {
    const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: "{}",
    });
    return ((await r.json()) as { userInfo?: { email: string }[] }).userInfo?.map((u) => u.email) ?? [];
  };
  const args = ["--admin-email", "New.Admin@acts.test", "--first", "Nora", "--last", "New"];

  test("refuses without an admin email or the typed confirmation", async () => {
    assert.throws(() => reset(["--first", "A", "--last", "B"], "DELETE EVERYTHING\n"), /Usage/);
    assert.throws(() => reset(args, "yes\n"), /Nothing was changed/);
    assert.ok(Number((await one("SELECT count(*) FROM users")).count) > 1, "data untouched");
  });

  test("backs up, empties everything, deletes all logins and creates one admin", async () => {
    const usersBefore = Number((await one("SELECT count(*) FROM users")).count);
    assert.ok((await emulatorLogins()).length > 1);
    const dir = mkdtempSync(path.join(os.tmpdir(), "acts-reset-"));
    const out = reset([...args, "--out", dir], "DELETE EVERYTHING\n");
    assert.match(out, /Open this link to set the password/);
    assert.match(out, /oobCode=/);

    const backup = JSON.parse(readFileSync(path.join(dir, readdirSync(dir)[0]), "utf8"));
    assert.equal(backup.tables.users.length, usersBefore, "backup taken before the wipe");

    const tables = (await f.pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map((r) => r.tablename);
    for (const t of tables) {
      const n = Number((await one(`SELECT count(*) FROM "${t}"`)).count);
      if (t !== "audit_log") assert.equal(n, t === "users" ? 1 : 0, t);
    }
    // The log starts over with the reset itself and the new admin's account.
    assert.deepEqual((await f.pool.query("SELECT action FROM audit_log ORDER BY id")).rows.map((r) => r.action),
      ["users.insert", "system.reset"]);
    assert.deepEqual(await one("SELECT email, role, status, staff_category FROM users"),
      { email: "new.admin@acts.test", role: "admin", status: "active", staff_category: "admin" });
    assert.ok(Number((await one("SELECT count(*) FROM drizzle.__drizzle_migrations")).count) > 0, "migration history kept");
    assert.deepEqual(await emulatorLogins(), ["new.admin@acts.test"]);
    // Old logins are gone.
    await assert.rejects(signIn("admin@acts.test"));
  });

  test("the new admin can sign in after setting a password", async () => {
    // Emulator: set the password directly (the printed link does the same in production).
    const { initializeApp, getApps } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const app = getApps().find((a) => a.name === "tests") ?? initializeApp({ projectId: PROJECT }, "tests");
    const login = await getAuth(app).getUserByEmail("new.admin@acts.test");
    await getAuth(app).updateUser(login.uid, { password: "password123" });
    const me = await call(await route("me"), { token: await signIn("new.admin@acts.test") });
    assert.equal(me.status, 200);
    assert.equal(me.body.role, "admin");
  });
});
