// Integration tests: Firebase emulators -> migration scripts -> Postgres -> API handlers.
// Needs `npm run emulators` and `npm run db:local` running. Run with `npm test`.
// WARNING: wipes the emulator data and the database named in DATABASE_URL (local only).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5433/acts";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.MIGRATION_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "acts-migration-"));
const PROJECT = "acts-bible-school-portal";
const dbUrl = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error("Tests only run against a local database");

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

/** Calls a Vercel-style handler with a minimal request/response pair. */
async function call(handler: Handler, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const req = {
    method: opts.method ?? "GET",
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    body: opts.body,
    query: {},
  } as unknown as VercelRequest;
  let status = 200;
  let body: any;
  const res = {
    status(code: number) { status = code; return this; },
    json(data: unknown) { body = data; return this; },
    setHeader() { return this; },
    end() { return this; },
  } as unknown as VercelResponse;
  await handler(req, res);
  return { status, body };
}

async function signIn(email: string, password = "password123") {
  const r = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  const data = (await r.json()) as { idToken?: string };
  assert.ok(data.idToken, `sign-in failed for ${email}: ${JSON.stringify(data)}`);
  return data.idToken as string;
}

async function signUp(email: string) {
  const r = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123", returnSecureToken: true }) },
  );
  return ((await r.json()) as { idToken: string }).idToken;
}

let me: Handler, health: Handler;
let pool: import("pg").Pool;
const tokens: Record<string, string> = {};

before(async () => {
  const run = (script: string, env: Record<string, string> = {}) =>
    execFileSync("npx", ["tsx", script], { env: { ...process.env, ...env }, stdio: "pipe" });

  // Fresh emulator data, exported with the real export script.
  execFileSync("node", ["scripts/seed-emulators.mjs"], { stdio: "pipe" });
  run("scripts/migrate/export.ts");

  // Fresh schema from the committed migrations, then the real load script.
  const { Pool } = await import("pg");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  execFileSync("npx", ["drizzle-kit", "migrate"], { env: process.env, stdio: "pipe" });
  run("scripts/migrate/load.ts");

  // An archived student and a Firebase login with no portal account.
  const { initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const admin = initializeApp({ projectId: PROJECT }, "tests");
  await getAuth(admin).createUser({ uid: "old1", email: "old@acts.test", password: "password123" });

  for (const role of ["admin", "president", "teacher", "student"]) tokens[role] = await signIn(`${role}@acts.test`);
  tokens.archived = await signIn("old@acts.test");
  tokens.stranger = await signUp("stranger@acts.test");

  me = (await import("../api/me.js")).default as Handler;
  health = (await import("../api/health.js")).default as Handler;
});

after(async () => {
  await pool?.end();
  // The handlers' shared pool keeps the process alive otherwise.
  const { db } = await import("../server/lib/db.js");
  await (db.$client as import("pg").Pool).end();
});

describe("GET /api/health", () => {
  test("reports the database is reachable", async () => {
    assert.deepEqual(await call(health), { status: 200, body: { ok: true } });
  });
});

describe("authentication", () => {
  test("rejects a missing token", async () => {
    assert.equal((await call(me)).status, 401);
  });
  test("rejects a forged token", async () => {
    assert.equal((await call(me, { token: "not-a-real-token" })).status, 401);
  });
  test("rejects a Firebase login with no portal account", async () => {
    assert.equal((await call(me, { token: tokens.stranger })).status, 403);
  });
  test("rejects an archived account", async () => {
    const r = await call(me, { token: tokens.archived });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /deactivated/);
  });
});

describe("GET /api/me", () => {
  test("returns each role from the database", async () => {
    for (const [role, expected] of [["admin", "admin"], ["president", "president"], ["teacher", "teacher"], ["student", "student"]]) {
      const r = await call(me, { token: tokens[role] });
      assert.equal(r.status, 200);
      assert.equal(r.body.role, expected);
    }
  });
  test("includes the migrated student record and personal details", async () => {
    const { body } = await call(me, { token: tokens.student });
    assert.equal(body.fullName, "Sam Student");
    assert.equal(body.contactNumber, "0917");
    assert.equal(body.profile.church, "Grace Church");
    assert.deepEqual(body.student, {
      studentNo: "S-001", schoolType: "night", cohort: "Batch 2026-A", currentYearLevel: 1,
      yearLevels: [{ yearLevel: 1, schoolYear: "2026-2027" }],
    });
  });
  test("staff have no student record", async () => {
    const { body } = await call(me, { token: tokens.admin });
    assert.equal(body.student, null);
    assert.equal(body.staffCategory, "day_secretary");
  });
});

describe("PATCH /api/me", () => {
  test("a student can edit their personal fields", async () => {
    const r = await call(me, { method: "PATCH", token: tokens.student, body: { contactNumber: "0999", church: "New Church", birthDate: "2001-02-03" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.contactNumber, "0999");
    assert.equal(r.body.profile.church, "New Church");
    assert.equal(r.body.profile.birthDate, "2001-02-03");
    assert.equal((await call(me, { token: tokens.student })).body.contactNumber, "0999");
  });
  test("an empty date clears it", async () => {
    const r = await call(me, { method: "PATCH", token: tokens.student, body: { birthDate: "" } });
    assert.equal(r.body.profile.birthDate, null);
  });
  for (const field of ["role", "status", "email", "grades", "studentNo"]) {
    test(`a student cannot change ${field}`, async () => {
      const r = await call(me, { method: "PATCH", token: tokens.student, body: { [field]: "admin" } });
      assert.equal(r.status, 400);
    });
  }
  test("the role is unchanged after the rejected attempts", async () => {
    assert.equal((await call(me, { token: tokens.student })).body.role, "student");
  });
  test("only admins can set a staff category", async () => {
    assert.equal((await call(me, { method: "PATCH", token: tokens.teacher, body: { staffCategory: "admin" } })).status, 403);
    const r = await call(me, { method: "PATCH", token: tokens.admin, body: { staffCategory: "faculty" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.staffCategory, "faculty");
  });
  test("rejects invalid values", async () => {
    assert.equal((await call(me, { method: "PATCH", token: tokens.student, body: { birthDate: "03/02/2001" } })).status, 400);
    assert.equal((await call(me, { method: "PATCH", token: tokens.student, body: { firstName: "  " } })).status, 400);
    assert.equal((await call(me, { method: "PATCH", token: tokens.student, body: { gender: "Other" } })).status, 400);
  });
  test("a new personal-details row is created on first edit", async () => {
    await pool.query("DELETE FROM user_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@acts.test')");
    const r = await call(me, { method: "PATCH", token: tokens.teacher, body: { city: "Manila" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.profile.city, "Manila");
  });
});

describe("routing", () => {
  test("unsupported methods get 405", async () => {
    assert.equal((await call(me, { method: "DELETE", token: tokens.admin })).status, 405);
  });
});
