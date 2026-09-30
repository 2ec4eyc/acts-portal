// /api/health and /api/me: authentication and self-service profile.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let me: Handler, health: Handler;
let tokens: Fixture["tokens"];
let pool: Fixture["pool"];

before(async () => {
  f = await setup();
  ({ tokens, pool } = f);
  me = await route("me");
  health = await route("health");
});
after(() => f.close());

describe("GET /api/health", () => {
  test("reports the database is reachable", async () => {
    const r = await call(health);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
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
    for (const role of ["admin", "president", "teacher", "student"] as const) {
      const expected = role;
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
