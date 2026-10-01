// /api/users: account management, enrollment, cleanup and history.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, signIn, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let users: Handler, user: Handler, historyRoute: Handler, archive: Handler, restore: Handler, enroll: Handler, cleanup: Handler, offerings: Handler;

const newStudent = (overrides: Record<string, unknown> = {}) => ({
  email: "new.student@acts.test",
  password: "secret123",
  firstName: "Nina",
  lastName: "Nuevo",
  role: "student",
  city: "Cebu",
  student: { studentNo: "S-100", schoolType: "day", cohort: "Batch 2026-B", currentYearLevel: 1, schoolYears: { 1: "2026-2027" } },
  ...overrides,
});

before(async () => {
  f = await setup();
  users = await route("users/index");
  user = await route("users/[id]");
  historyRoute = await route("users/[id]/history");
  archive = await route("users/archive");
  restore = await route("users/restore");
  enroll = await route("users/enroll");
  cleanup = await route("users/cleanup");
  offerings = await route("offerings/index");
});
after(() => f.close());

describe("GET /api/users", () => {
  test("staff can list current accounts", async () => {
    for (const role of ["admin", "president", "teacher"] as const) {
      const r = await call(users, { token: f.tokens[role] });
      assert.equal(r.status, 200);
      assert.equal(r.body.length, 5);
    }
  });
  test("filters by role and status", async () => {
    const students = await call(users, { token: f.tokens.admin, query: { role: "student" } });
    assert.deepEqual(students.body.map((u: any) => u.lastName), ["Reyes", "Student"]);
    const archived = await call(users, { token: f.tokens.admin, query: { status: "archived" } });
    assert.deepEqual(archived.body.map((u: any) => u.email), ["old@acts.test"]);
  });
  test("students cannot list accounts", async () => {
    assert.equal((await call(users, { token: f.tokens.student })).status, 403);
  });
});

describe("GET /api/users/:id", () => {
  test("staff can read any account; students only their own", async () => {
    assert.equal((await call(user, { token: f.tokens.teacher, query: { id: f.ids.student2 } })).status, 200);
    assert.equal((await call(user, { token: f.tokens.student, query: { id: f.ids.student } })).status, 200);
    assert.equal((await call(user, { token: f.tokens.student, query: { id: f.ids.student2 } })).status, 403);
  });
});

describe("POST /api/users", () => {
  test("an admin creates a student who can sign in and is enrolled automatically", async () => {
    const r = await call(users, { method: "POST", token: f.tokens.admin, body: newStudent() });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.email, "new.student@acts.test");
    assert.equal(r.body.profile.city, "Cebu");
    assert.deepEqual(r.body.student, {
      studentNo: "S-100", schoolType: "day", cohort: "Batch 2026-B", currentYearLevel: 1,
      yearLevels: [{ yearLevel: 1, schoolYear: "2026-2027" }],
    });
    const { rows } = await f.pool.query("SELECT count(*)::int AS n FROM enrollments WHERE student_id = $1", [r.body.id]);
    assert.equal(rows[0].n, 3, "enrolled in all three 1st-year 2026-2027 offerings");
    assert.ok(await signIn("new.student@acts.test", "secret123"));
  });
  test("duplicate emails and student numbers are rejected", async () => {
    assert.equal((await call(users, { method: "POST", token: f.tokens.admin, body: newStudent() })).status, 409);
    assert.equal((await call(users, { method: "POST", token: f.tokens.admin, body: newStudent({ email: "STUDENT@acts.test" }) })).status, 409);
    const dupNo = await call(users, { method: "POST", token: f.tokens.admin, body: newStudent({ email: "other@acts.test", student: { studentNo: "S-001" } }) });
    assert.equal(dupNo.status, 409);
  });
  test("a failed database write leaves no orphaned login", async () => {
    // S-001 is taken, so the transaction fails after the login was created; the login must be removed.
    await assert.rejects(signIn("other@acts.test"));
  });
  test("creates staff accounts with a role", async () => {
    const r = await call(users, { method: "POST", token: f.tokens.admin, body: { email: "t2@acts.test", password: "secret123", firstName: "Tom", lastName: "Two", role: "teacher" } });
    assert.equal(r.status, 201);
    assert.equal(r.body.role, "teacher");
    assert.equal(r.body.student, null);
  });
  test("only admins can create accounts", async () => {
    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await call(users, { method: "POST", token: f.tokens[role], body: newStudent({ email: `${role}.x@acts.test` }) })).status, 403);
    }
  });
  test("validates input", async () => {
    for (const body of [newStudent({ email: "bad" }), newStudent({ password: "123" }), newStudent({ role: "owner" }), { ...newStudent(), grades: [] }]) {
      assert.equal((await call(users, { method: "POST", token: f.tokens.admin, body })).status, 400, JSON.stringify(body));
    }
  });
});

describe("PATCH /api/users/:id", () => {
  test("an executive can edit a student's record", async () => {
    const r = await call(user, { method: "PATCH", token: f.tokens.president, query: { id: f.ids.student2 }, body: { contactNumber: "0911", student: { studentNo: "S-002B" } } });
    assert.equal(r.status, 200);
    assert.equal(r.body.contactNumber, "0911");
    assert.equal(r.body.student.studentNo, "S-002B");
  });
  test("executives cannot change roles or emails, or edit staff accounts", async () => {
    const cases = [
      { id: f.ids.student2, body: { role: "admin" } },
      { id: f.ids.student2, body: { email: "x@acts.test" } },
      { id: f.ids.admin, body: { city: "Davao" } },
      { id: f.ids.teacher, body: { firstName: "Hacked" } },
    ];
    for (const c of cases) {
      assert.equal((await call(user, { method: "PATCH", token: f.tokens.president, query: { id: c.id }, body: c.body })).status, 403, JSON.stringify(c));
    }
  });
  test("teachers and students cannot edit accounts", async () => {
    assert.equal((await call(user, { method: "PATCH", token: f.tokens.teacher, query: { id: f.ids.student }, body: { city: "X" } })).status, 403);
    assert.equal((await call(user, { method: "PATCH", token: f.tokens.student, query: { id: f.ids.student }, body: { city: "X" } })).status, 403);
  });
  test("an admin changes an email on the same login (history and grades stay)", async () => {
    const before = (await f.pool.query("SELECT firebase_uid FROM users WHERE id = $1", [f.ids.student2])).rows[0].firebase_uid;
    const r = await call(user, { method: "PATCH", token: f.tokens.admin, query: { id: f.ids.student2 }, body: { email: "Rita.New@acts.test" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.email, "rita.new@acts.test");
    const after = (await f.pool.query("SELECT firebase_uid FROM users WHERE id = $1", [f.ids.student2])).rows[0].firebase_uid;
    assert.equal(after, before);
    assert.ok(await signIn("rita.new@acts.test"));
    await assert.rejects(signIn("student2@acts.test"));
  });
  test("an email already used by another account is refused", async () => {
    const r = await call(user, { method: "PATCH", token: f.tokens.admin, query: { id: f.ids.student2 }, body: { email: "teacher@acts.test" } });
    assert.equal(r.status, 409);
  });
  test("an admin changes roles", async () => {
    const r = await call(user, { method: "PATCH", token: f.tokens.admin, query: { id: f.ids.president }, body: { role: "vice_president" } });
    assert.equal(r.body.role, "vice_president");
    await call(user, { method: "PATCH", token: f.tokens.admin, query: { id: f.ids.president }, body: { role: "president" } });
  });
  test("an archived account's status can't be patched back to active", async () => {
    const r = await call(user, { method: "PATCH", token: f.tokens.admin, query: { id: f.ids.old }, body: { status: "active" } });
    assert.equal(r.status, 409);
  });
});

describe("enroll, archive, restore, delete", () => {
  test("bulk enrollment sets year level, batch and school year, then enrolls", async () => {
    // A 2nd-year offering in 2027-2028 for the students to be moved into.
    await call(offerings, { method: "POST", token: f.tokens.admin, body: { name: "Pastoral Ministry", instructorId: null, yearLevel: 2, semester: 1, schoolYear: "2027-2028", schedule: null } });
    const r = await call(enroll, { method: "POST", token: f.tokens.president, body: { studentIds: [f.ids.student, f.ids.student2], yearLevel: 2, cohort: "Batch 2026-A", schoolYear: "2027-2028" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.newEnrollments, 2);
    const me = await call(user, { token: f.tokens.admin, query: { id: f.ids.student } });
    assert.equal(me.body.student.currentYearLevel, 2);
    assert.deepEqual(me.body.student.yearLevels, [{ yearLevel: 1, schoolYear: "2026-2027" }, { yearLevel: 2, schoolYear: "2027-2028" }]);
  });
  test("bulk enrollment rejects non-students", async () => {
    const r = await call(enroll, { method: "POST", token: f.tokens.admin, body: { studentIds: [f.ids.teacher], yearLevel: 1, cohort: "X", schoolYear: "2026-2027" } });
    assert.equal(r.status, 400);
  });
  test("archiving blocks sign-in to the API; restoring allows it again", async () => {
    const token = await signIn("rita.new@acts.test");
    const me = await route("me");
    assert.equal((await call(archive, { method: "POST", token: f.tokens.admin, body: { ids: [f.ids.student2] } })).status, 204);
    assert.equal((await call(me, { token })).status, 403);
    assert.equal((await call(restore, { method: "POST", token: f.tokens.admin, body: { ids: [f.ids.student2] } })).status, 204);
    assert.equal((await call(me, { token })).status, 200);
  });
  test("archive/restore are admin-only, and admins cannot archive themselves", async () => {
    assert.equal((await call(archive, { method: "POST", token: f.tokens.president, body: { ids: [f.ids.student2] } })).status, 403);
    assert.equal((await call(archive, { method: "POST", token: f.tokens.admin, body: { ids: [f.ids.admin] } })).status, 409);
  });
  test("only archived accounts can be deleted; deletion removes the login and records", async () => {
    assert.equal((await call(user, { method: "DELETE", token: f.tokens.admin, query: { id: f.ids.student2 } })).status, 409);
    await call(archive, { method: "POST", token: f.tokens.admin, body: { ids: [f.ids.student2] } });
    assert.equal((await call(user, { method: "DELETE", token: f.tokens.president, query: { id: f.ids.student2 } })).status, 403);
    assert.equal((await call(user, { method: "DELETE", token: f.tokens.admin, query: { id: f.ids.student2 } })).status, 204);
    const { rows } = await f.pool.query("SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS u, (SELECT count(*) FROM enrollments WHERE student_id = $1)::int AS e", [f.ids.student2]);
    assert.deepEqual(rows[0], { u: 0, e: 0 });
    await assert.rejects(signIn("rita.new@acts.test"));
  });
});

describe("cleanup and history", () => {
  test("cleanup removes enrollments in archived offerings only, and logs them", async () => {
    await call(await route("offerings/[id]"), { method: "DELETE", token: f.tokens.admin, query: { id: f.offerings.c2 } });
    const r = await call(cleanup, { method: "POST", token: f.tokens.admin, body: { studentIds: [f.ids.student] } });
    assert.equal(r.status, 200);
    assert.equal(r.body.removed, 1);
    const { rows } = await f.pool.query(
      "SELECT o.legacy_id FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id WHERE e.student_id = $1 ORDER BY 1", [f.ids.student]);
    assert.ok(rows.some((x) => x.legacy_id === "c1"));
    assert.ok(!rows.some((x) => x.legacy_id === "c2"));
    const audit = await f.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'enrollment.cleaned_up'");
    assert.equal(audit.rows[0].n, 1);
  });
  test("history includes migrated entries with their original times", async () => {
    const r = await call(historyRoute, { token: f.tokens.teacher, query: { id: f.ids.student } });
    assert.equal(r.status, 200);
    const legacy = r.body.filter((h: any) => h.id.startsWith("legacy-"));
    assert.equal(legacy.length, 2);
    assert.ok(legacy.every((h: any) => !h.at.startsWith("1970")), "timestamps were parsed");
    assert.ok(legacy.some((h: any) => h.action === "Updated grade for Hermeneutics" && h.at.startsWith("2026-09-16")));
    assert.equal((await call(historyRoute, { token: f.tokens.student, query: { id: f.ids.student } })).status, 403);
  });
});
