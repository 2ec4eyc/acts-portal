// /api/me/students: a teacher's own students, with grade and attendance in each of their courses.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let mine: Handler;
before(async () => {
  f = await setup();
  mine = await route("me/students");
});
after(() => f.close());

type Row = { studentId: string; studentName: string; courses: { offeringId: string; name: string; grade: number | null; isIncomplete: boolean;
  attendance: { present: number; late: number; absent: number; excused: number } }[] };
const list = async (token = f.tokens.teacher) => (await call(mine, { token })).body as Row[];

describe("a teacher's students", () => {
  test("lists only students enrolled in the teacher's own courses, by last name", async () => {
    const rows = await list();
    const expected = (await f.pool.query(`
      SELECT DISTINCT u.id, u.last_name, u.first_name FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
      JOIN users u ON u.id = e.student_id
      WHERE o.instructor_id = $1 AND o.deleted_at IS NULL AND e.status <> 'dropped' AND u.status <> 'archived'
      ORDER BY u.last_name, u.first_name`, [f.ids.teacher])).rows.map((r) => r.id);
    assert.ok(expected.length > 0, "fixture: Tess has students");
    assert.deepEqual(rows.map((r) => r.studentId), expected);
    for (const r of rows) for (const c of r.courses) {
      const { rows: [o] } = await f.pool.query("SELECT instructor_id FROM course_offerings WHERE id = $1", [c.offeringId]);
      assert.equal(o.instructor_id, f.ids.teacher, "only Tess's courses are listed");
    }
  });

  test("each course shows the grade so far and attendance counts", async () => {
    const sam = (await list()).find((r) => r.studentId === f.ids.student)!;
    const c1 = sam.courses.find((c) => c.offeringId === f.offerings.c1)!;
    const { rows: [g] } = await f.pool.query(
      "SELECT g.value::float AS value FROM grades g JOIN enrollments e ON e.id = g.enrollment_id WHERE e.offering_id = $1 AND e.student_id = $2",
      [f.offerings.c1, f.ids.student]);
    assert.equal(c1.grade, g?.value ?? null);
    const { rows: [a] } = await f.pool.query(`
      SELECT count(*) FILTER (WHERE ar.status = 'present')::int AS present, count(*) FILTER (WHERE ar.status = 'absent')::int AS absent
      FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id WHERE s.offering_id = $1 AND ar.student_id = $2`,
      [f.offerings.c1, f.ids.student]);
    assert.deepEqual([c1.attendance.present, c1.attendance.absent], [a.present, a.absent]);
  });

  test("archived students, dropped enrollments and archived courses are left out", async () => {
    await f.pool.query("UPDATE enrollments SET status = 'dropped' WHERE offering_id = $1 AND student_id = $2", [f.offerings.c1, f.ids.student2]);
    try {
      assert.ok(!(await list()).some((r) => r.studentId === f.ids.student2 && r.courses.some((c) => c.offeringId === f.offerings.c1)));
    } finally {
      await f.pool.query("UPDATE enrollments SET status = 'enrolled' WHERE offering_id = $1 AND student_id = $2", [f.offerings.c1, f.ids.student2]);
    }
    await f.pool.query("UPDATE course_offerings SET deleted_at = now() WHERE instructor_id = $1", [f.ids.teacher]);
    try {
      assert.deepEqual(await list(), []);
    } finally {
      await f.pool.query("UPDATE course_offerings SET deleted_at = NULL WHERE instructor_id = $1", [f.ids.teacher]);
    }
  });

  test("someone who teaches nothing gets an empty list; students are refused", async () => {
    assert.deepEqual(await list(f.tokens.president), []);
    assert.equal((await call(mine, { token: f.tokens.student })).status, 403);
  });
});
