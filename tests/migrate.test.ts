// Migration scripts in accounts-only mode: accounts carry over, academic records start empty.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { call, route, setup, type Fixture } from "./helpers.js";

let f: Fixture;
const count = async (table: string) => Number((await f.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync("npx", ["tsx", script, ...args], { env: { ...process.env, ...env }, stdio: "pipe" }).toString();

before(async () => {
  f = await setup(); // seeds the emulators and loads everything; we then rebuild in accounts-only mode
  const dir = mkdtempSync(path.join(os.tmpdir(), "acts-accounts-only-"));
  run("scripts/migrate/export.ts", ["--accounts-only"], { MIGRATION_DATA_DIR: dir });
  process.env.ACCOUNTS_ONLY_DIR = dir;
  await f.pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  execFileSync("npx", ["drizzle-kit", "migrate"], { env: process.env, stdio: "pipe" });
  run("scripts/migrate/load.ts", ["--accounts-only"], { MIGRATION_DATA_DIR: dir });
});
after(() => f.close());

describe("accounts-only migration", () => {
  test("the export only downloads the account collections", () => {
    assert.deepEqual(readdirSync(process.env.ACCOUNTS_ONLY_DIR!).sort(), ["archived_users.json", "users.json"]);
  });
  test("accounts, roles and student placement carry over", async () => {
    assert.equal(await count("users"), 6);
    assert.equal(await count("users WHERE status = 'archived'"), 1);
    assert.equal(await count("users WHERE role = 'admin'"), 1);
    assert.equal(await count("student_records"), 3);
    assert.equal(await count("student_year_levels"), 2);
    assert.equal(await count("cohorts"), 1);
  });
  test("courses, enrollments, grades, attendance, files and grade history start empty", async () => {
    for (const table of ["course_offerings", "courses", "enrollments", "grades", "attendance_records", "materials", "audit_log"]) {
      assert.equal(await count(table), 0, table);
    }
  });
  test("verify passes in the same mode", () => {
    const out = run("scripts/migrate/verify.ts", ["--accounts-only"], { MIGRATION_DATA_DIR: process.env.ACCOUNTS_ONLY_DIR! });
    assert.match(out, /All checks passed/);
  });
  test("people sign in with their existing logins and see their profile", async () => {
    const me = await route("me");
    const r = await call(me, { token: f.tokens.student, query: { include: "grades" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.student.studentNo, "S-001");
    assert.equal(r.body.student.cohort, "Batch 2026-A");
    assert.deepEqual(r.body.grades, []);
    assert.equal((await call(me, { token: f.tokens.admin })).body.role, "admin");
  });
});
