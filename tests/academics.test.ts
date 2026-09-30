// /api/grades, /api/attendance, /api/materials.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let grades: Handler, bulk: Handler, attendance: Handler, materials: Handler, material: Handler, file: Handler, offerings: Handler;

const grade = (offering: string, student: string, value: number | null, isIncomplete = false) =>
  ({ offeringId: f.offerings[offering], studentId: f.ids[student], value, isIncomplete });
const gradeOf = async (offering: string, student: string) =>
  (await f.pool.query(
    "SELECT g.value::float AS value, g.is_incomplete FROM grades g JOIN enrollments e ON e.id = g.enrollment_id WHERE e.offering_id = $1 AND e.student_id = $2",
    [f.offerings[offering], f.ids[student]])).rows[0] ?? null;

before(async () => {
  f = await setup();
  grades = await route("grades/index");
  bulk = await route("grades/bulk");
  attendance = await route("attendance/index");
  materials = await route("materials/index");
  material = await route("materials/[id]");
  file = await route("materials/[id]/file");
  offerings = await route("offerings/index");
});
after(() => f.close());

describe("GET /api/grades", () => {
  test("a student sees their migrated grades with pass/fail status", async () => {
    const r = await call(grades, { token: f.tokens.student, query: { studentId: f.ids.student } });
    assert.equal(r.status, 200);
    const byCourse = Object.fromEntries(r.body.map((g: any) => [g.courseName, g]));
    assert.equal(byCourse["Old Testament Survey"].value, 91);
    assert.equal(byCourse["Old Testament Survey"].status, "passed");
    assert.equal(byCourse["Hermeneutics"].status, "incomplete");
  });
  test("students cannot read other students' grades or a whole course", async () => {
    assert.equal((await call(grades, { token: f.tokens.student, query: { studentId: f.ids.student2 } })).status, 403);
    assert.equal((await call(grades, { token: f.tokens.student, query: { offeringId: f.offerings.c1 } })).status, 403);
  });
  test("staff can list a course's grades", async () => {
    const r = await call(grades, { token: f.tokens.teacher, query: { offeringId: f.offerings.c1 } });
    assert.deepEqual(r.body.map((g: any) => [g.studentName, g.value]), [["Rita Reyes", 85], ["Sam Student", 91]]);
  });
  test("needs a filter", async () => {
    assert.equal((await call(grades, { token: f.tokens.admin })).status, 400);
  });
});

describe("PUT/DELETE /api/grades", () => {
  test("a teacher grades their own course, and the change is recorded", async () => {
    const r = await call(grades, { method: "PUT", token: f.tokens.teacher, body: grade("c1", "student2", 72.5) });
    assert.equal(r.status, 200);
    assert.equal(r.body.value, 72.5);
    assert.equal(r.body.status, "failed");
    const { rows } = await f.pool.query("SELECT old_value::float AS o, new_value::float AS n, changed_by FROM grade_changes ORDER BY id DESC LIMIT 1");
    assert.deepEqual(rows[0], { o: 85, n: 72.5, changed_by: f.ids.teacher });
  });
  test("a teacher cannot grade someone else's course; executives can", async () => {
    assert.equal((await call(grades, { method: "PUT", token: f.tokens.teacher, body: grade("c2", "student", 80) })).status, 403);
    assert.equal((await call(grades, { method: "PUT", token: f.tokens.president, body: grade("c2", "student", 80) })).status, 200);
    assert.equal((await call(grades, { method: "PUT", token: f.tokens.student, body: grade("c1", "student", 100) })).status, 403);
    assert.equal((await gradeOf("c1", "student")).value, 91, "the student's attempt changed nothing");
  });
  test("incomplete clears the value", async () => {
    await call(grades, { method: "PUT", token: f.tokens.admin, body: grade("c1", "student2", 90, true) });
    assert.deepEqual(await gradeOf("c1", "student2"), { value: null, is_incomplete: true });
  });
  test("reset returns the grade to pending but keeps the enrollment", async () => {
    const r = await call(grades, { method: "DELETE", token: f.tokens.admin, query: { offeringId: f.offerings.c1, studentId: f.ids.student2 } });
    assert.equal(r.status, 204);
    assert.equal(await gradeOf("c1", "student2"), null);
    const listed = await call(grades, { token: f.tokens.admin, query: { offeringId: f.offerings.c1, studentId: f.ids.student2 } });
    assert.equal(listed.body[0].status, "pending");
  });
  test("grading a student who isn't enrolled enrolls them (as the app did)", async () => {
    const created = await call(offerings, { method: "POST", token: f.tokens.admin, body: { name: "Elective", instructorId: null, yearLevel: 2, semester: 1, schoolYear: "2030-2031", schedule: null } });
    f.offerings.elective = created.body.id;
    assert.equal(created.body.newEnrollments, 0);
    assert.equal((await call(grades, { method: "PUT", token: f.tokens.admin, body: grade("elective", "student", 88) })).status, 200);
    assert.equal((await gradeOf("elective", "student")).value, 88);
    assert.equal((await call(grades, { method: "PUT", token: f.tokens.admin, body: grade("elective", "teacher", 88) })).status, 400);
  });
  test("rejects out-of-range values", async () => {
    for (const value of [-1, 100.5]) {
      assert.equal((await call(grades, { method: "PUT", token: f.tokens.admin, body: grade("c1", "student", value) })).status, 400);
    }
  });
});

describe("POST /api/grades/bulk", () => {
  test("saves all rows in one go", async () => {
    const r = await call(bulk, { method: "POST", token: f.tokens.admin, body: { items: [grade("c1", "student", 93), grade("c1", "student2", 77)] } });
    assert.deepEqual(r.body, { updated: 2 });
    assert.equal((await gradeOf("c1", "student")).value, 93);
  });
  test("is all-or-nothing: one forbidden row saves nothing", async () => {
    const r = await call(bulk, { method: "POST", token: f.tokens.teacher, body: { items: [grade("c1", "student", 50), grade("c2", "student", 50)] } });
    assert.equal(r.status, 403);
    assert.equal((await gradeOf("c1", "student")).value, 93);
  });
});

describe("attendance", () => {
  test("the roster lists enrolled students with the migrated records", async () => {
    const r = await call(attendance, { token: f.tokens.admin, query: { offeringId: f.offerings.c1, date: "2026-09-07" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.taken, true);
    assert.deepEqual(r.body.students.map((s: any) => [s.studentName, s.status, s.isExcused, s.notes]),
      [["Rita Reyes", "absent", true, "Sick"], ["Sam Student", "present", false, null]]);
  });
  test("an untaken day lists everyone with no status", async () => {
    const r = await call(attendance, { token: f.tokens.admin, query: { offeringId: f.offerings.c1, date: "2026-09-09" } });
    assert.equal(r.body.taken, false);
    assert.ok(r.body.students.every((s: any) => s.status === null));
  });
  test("saving a day stores it and can be re-saved", async () => {
    const records = [
      { studentId: f.ids.student, status: "late", isExcused: false, notes: "Traffic" },
      { studentId: f.ids.student2, status: "present" },
    ];
    let r = await call(attendance, { method: "PUT", token: f.tokens.admin, body: { offeringId: f.offerings.c1, date: "2026-09-09", records } });
    assert.equal(r.status, 200);
    assert.equal(r.body.taken, true);
    r = await call(attendance, { method: "PUT", token: f.tokens.admin, body: { offeringId: f.offerings.c1, date: "2026-09-09", records: [{ studentId: f.ids.student, status: "absent" }] } });
    assert.deepEqual(r.body.students.map((s: any) => s.status), ["present", "absent"]);
  });
  test("only enrolled students can be recorded; teachers and students cannot save", async () => {
    const body = { offeringId: f.offerings.c1, date: "2026-09-10", records: [{ studentId: f.ids.teacher, status: "present" }] };
    assert.equal((await call(attendance, { method: "PUT", token: f.tokens.admin, body })).status, 400);
    const ok = { ...body, records: [] };
    assert.equal((await call(attendance, { method: "PUT", token: f.tokens.teacher, body: ok })).status, 403);
    assert.equal((await call(attendance, { method: "PUT", token: f.tokens.student, body: ok })).status, 403);
  });
  test("students see only their own records", async () => {
    const r = await call(attendance, { token: f.tokens.student, query: { studentId: f.ids.student } });
    assert.equal(r.status, 200);
    assert.ok(r.body.every((a: any) => a.studentId === f.ids.student));
    assert.equal((await call(attendance, { token: f.tokens.student, query: { studentId: f.ids.student2 } })).status, 403);
    assert.equal((await call(attendance, { token: f.tokens.student, query: { offeringId: f.offerings.c1 } })).status, 403);
  });
});

describe("materials", () => {
  test("migrated files keep their contents", async () => {
    const list = await call(materials, { token: f.tokens.admin, query: { archived: "all" } });
    assert.deepEqual(list.body.map((m: any) => m.fileName).sort(), ["midterm.pdf", "old-quiz.txt", "week1.pdf"]);
    const quiz = list.body.find((m: any) => m.fileName === "old-quiz.txt");
    assert.ok(quiz.archivedAt);
    const dl = await call(file, { token: f.tokens.admin, query: { id: quiz.id } });
    assert.equal(dl.status, 200);
    assert.equal(Buffer.from(dl.body).toString(), "Old quiz");
    assert.equal(dl.headers["content-type"], "text/plain");
    assert.match(dl.headers["content-disposition"], /old-quiz\.txt/);
  });
  test("a teacher uploads to their own course; the file downloads byte-for-byte", async () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 37, 80, 68, 70]);
    const r = await call(materials, {
      method: "POST", token: f.tokens.teacher,
      body: { offeringId: f.offerings.c1, category: "exams", fileName: "final exam.pdf", contentType: "application/pdf", data: `data:application/pdf;base64,${bytes.toString("base64")}`, eventDate: "2026-12-01", instructions: "Closed book" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.sizeBytes, bytes.length);
    const dl = await call(file, { token: f.tokens.student, query: { id: r.body.id } });
    assert.ok(Buffer.from(dl.body).equals(bytes));
  });
  test("upload rules: own course only, exams need a date, 800 KB max, staff only", async () => {
    const base = { offeringId: f.offerings.c1, category: "notes", fileName: "n.txt", contentType: "text/plain", data: Buffer.from("hi").toString("base64") };
    assert.equal((await call(materials, { method: "POST", token: f.tokens.teacher, body: { ...base, offeringId: f.offerings.c2 } })).status, 403);
    assert.equal((await call(materials, { method: "POST", token: f.tokens.teacher, body: { ...base, category: "exams" } })).status, 400);
    assert.equal((await call(materials, { method: "POST", token: f.tokens.teacher, body: { ...base, data: Buffer.alloc(801 * 1024).toString("base64") } })).status, 413);
    assert.equal((await call(materials, { method: "POST", token: f.tokens.student, body: base })).status, 403);
    assert.equal((await call(materials, { method: "POST", token: f.tokens.teacher, body: { ...base, data: "not base64!" } })).status, 400);
  });
  test("students only see active files of courses they're enrolled in", async () => {
    const mine = await call(materials, { token: f.tokens.student, query: { archived: "all" } });
    assert.ok(!mine.body.some((m: any) => m.fileName === "old-quiz.txt"), "archived files are hidden");
    const quiz = (await call(materials, { token: f.tokens.admin, query: { archived: "true" } })).body[0];
    assert.equal((await call(file, { token: f.tokens.student, query: { id: quiz.id } })).status, 404);
    await f.pool.query("DELETE FROM enrollments WHERE student_id = $1 AND offering_id = $2", [f.ids.student2, f.offerings.c1]);
    const other = await call(materials, { token: f.tokens.student2 });
    assert.equal(other.body.length, 0, "not enrolled in c1 any more");
  });
  test("only the uploader or an admin can archive or delete", async () => {
    const note = (await call(materials, { token: f.tokens.admin, query: { category: "notes" } })).body[0];
    assert.equal((await call(material, { method: "PATCH", token: f.tokens.president, query: { id: note.id }, body: { archived: true } })).status, 403);
    const r = await call(material, { method: "PATCH", token: f.tokens.teacher, query: { id: note.id }, body: { archived: true } });
    assert.ok(r.body.archivedAt);
    assert.equal((await call(material, { method: "DELETE", token: f.tokens.student, query: { id: note.id } })).status, 403);
    assert.equal((await call(material, { method: "DELETE", token: f.tokens.admin, query: { id: note.id } })).status, 204);
    const { rows } = await f.pool.query("SELECT count(*)::int AS n FROM material_files WHERE material_id = $1", [note.id]);
    assert.equal(rows[0].n, 0, "file contents are deleted with it");
  });
});
