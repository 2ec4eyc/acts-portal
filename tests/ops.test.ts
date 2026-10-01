// Operations scripts: admin recovery, and backup -> restore round trip.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { route, call, setup, PROJECT, type Fixture } from "./helpers.js";

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
void PROJECT;
