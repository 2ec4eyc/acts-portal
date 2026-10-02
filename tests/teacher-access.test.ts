// Teachers read and grade only the students enrolled in their own courses; office staff keep full access.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
const h: Record<string, Handler> = {};
before(async () => {
  f = await setup();
  for (const name of ["users/index", "users/[id]", "users/[id]/history", "grades/index", "attendance/index", "me/students"]) {
    h[name] = await route(name);
  }
});
after(() => f.close());

const status = async (name: string, query: Record<string, string>, token = f.tokens.teacher) =>
  (await call(h[name], { token, query })).status;
const profile = (id: string, token = f.tokens.teacher) => status("users/[id]", { id }, token);
let outsider = "";

describe("a teacher's own students", () => {
  test("fixture: Tess teaches c1 (Sam and Rita), not c2", async () => {
    const { rows } = await f.pool.query("SELECT legacy_id FROM course_offerings WHERE instructor_id = $1", [f.ids.teacher]);
    assert.ok(rows.some((r) => r.legacy_id === "c1"));
    assert.ok(!rows.some((r) => r.legacy_id === "c2"));
    // A student with no course of Tess's.
    const { rows: [u] } = await f.pool.query(
      "INSERT INTO users (firebase_uid, email, role, first_name, last_name) VALUES ('ola-uid', 'ola@acts.test', 'student', 'Ola', 'Outsider') RETURNING id");
    outsider = u.id;
  });

  test("she can read their profile, grade history, grades and attendance", async () => {
    for (const id of [f.ids.student, f.ids.student2]) {
      assert.equal(await profile(id), 200);
      assert.equal(await status("users/[id]/history", { id }), 200);
      assert.equal(await status("grades/index", { studentId: id }), 200);
      assert.equal(await status("attendance/index", { studentId: id }), 200);
    }
    assert.equal(await status("grades/index", { offeringId: f.offerings.c1 }), 200);
    assert.equal(await status("attendance/index", { offeringId: f.offerings.c1 }), 200);
    assert.equal(await profile(f.ids.teacher), 200, "her own account");
  });

  test("only her own courses' grades, attendance and history come back", async () => {
    const grades = (await call(h["grades/index"], { token: f.tokens.teacher, query: { studentId: f.ids.student } })).body;
    assert.ok(grades.length > 0);
    assert.ok(grades.every((g: { offeringId: string }) => g.offeringId === f.offerings.c1), JSON.stringify(grades));
    const p = (await call(h["users/[id]"], { token: f.tokens.teacher, query: { id: f.ids.student, include: "grades" } })).body;
    assert.ok(p.grades.every((g: { offeringId: string }) => g.offeringId === f.offerings.c1));
    const admin = (await call(h["grades/index"], { token: f.tokens.admin, query: { studentId: f.ids.student } })).body;
    assert.ok(admin.some((g: { offeringId: string }) => g.offeringId === f.offerings.c2), "the office still sees every course");
    const hist = (await call(h["users/[id]/history"], { token: f.tokens.teacher, query: { id: f.ids.student } })).body;
    assert.ok(!hist.some((e: { id: string }) => e.id.startsWith("legacy-")), "legacy history spans every course");
  });
});

describe("everyone else is refused", () => {
  test("a student not in her courses", async () => {
    assert.equal(await profile(outsider), 403);
    assert.equal(await status("users/[id]/history", { id: outsider }), 403);
    assert.equal(await status("grades/index", { studentId: outsider }), 403);
    assert.equal(await status("attendance/index", { studentId: outsider }), 403);
  });

  test("other teachers' courses and the full list", async () => {
    assert.equal(await status("grades/index", { offeringId: f.offerings.c2 }), 403);
    assert.equal(await status("attendance/index", { offeringId: f.offerings.c2 }), 403);
    assert.equal(await status("users/index", {}), 403);
  });

  test("a dropped enrollment or an archived course no longer counts", async () => {
    await f.pool.query("UPDATE enrollments SET status = 'dropped' WHERE offering_id = $1 AND student_id = $2", [f.offerings.c1, f.ids.student2]);
    try { assert.equal(await profile(f.ids.student2), 403); }
    finally { await f.pool.query("UPDATE enrollments SET status = 'enrolled' WHERE offering_id = $1 AND student_id = $2", [f.offerings.c1, f.ids.student2]); }
    await f.pool.query("UPDATE course_offerings SET deleted_at = now() WHERE id = $1", [f.offerings.c1]);
    try {
      assert.equal(await profile(f.ids.student2), 403);
      assert.equal(await status("grades/index", { offeringId: f.offerings.c1 }), 403);
    } finally { await f.pool.query("UPDATE course_offerings SET deleted_at = NULL WHERE id = $1", [f.offerings.c1]); }
  });

  test("the office (admin, president) keeps full access", async () => {
    for (const token of [f.tokens.admin, f.tokens.president]) {
      assert.equal(await profile(outsider, token), 200);
      assert.equal(await status("grades/index", { offeringId: f.offerings.c2 }, token), 200);
      assert.equal(await status("users/index", {}, token), 200);
    }
  });
});

describe("grading", () => {
  const put = (studentId: string, token = f.tokens.teacher) => call(h["grades/index"], { method: "PUT", token,
    body: { offeringId: f.offerings.c1, studentId, value: 88, isIncomplete: false } });
  const enrolled = async (studentId: string) =>
    (await f.pool.query("SELECT 1 FROM enrollments WHERE offering_id = $1 AND student_id = $2", [f.offerings.c1, studentId])).rowCount;

  test("she grades her enrolled students", async () => {
    const r = await put(f.ids.student);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  test("grading someone who isn't enrolled is refused and enrolls nobody", async () => {
    const r = await put(outsider);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /isn't enrolled/);
    assert.equal(await enrolled(outsider), 0);
    await f.pool.query("UPDATE enrollments SET status = 'dropped' WHERE offering_id = $1 AND student_id = $2", [f.offerings.c1, f.ids.student2]);
    try { assert.equal((await put(f.ids.student2)).status, 400, "dropped"); }
    finally { await f.pool.query("UPDATE enrollments SET status = 'enrolled' WHERE offering_id = $1 AND student_id = $2", [f.offerings.c1, f.ids.student2]); }
  });

  test("the office can still grade (and so enroll) a student by hand", async () => {
    assert.equal((await put(outsider, f.tokens.admin)).status, 200);
    assert.equal(await enrolled(outsider), 1);
  });
});
