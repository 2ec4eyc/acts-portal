// /api/offerings: course offerings, archive/restore, and automatic enrollment.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let list: Handler, one: Handler, restore: Handler, students: Handler, enroll: Handler, unenroll: Handler;

const newOffering = (overrides: Record<string, unknown> = {}) => ({
  name: "Church History",
  instructorId: f.ids.teacher,
  yearLevel: 1,
  schoolType: "night",
  semester: 2,
  schoolYear: "2026-2027",
  schedule: { startsOn: "2027-01-11", startTime: "18:00", endTime: "20:00", frequency: "weekly", weekdays: [1, 3] },
  ...overrides,
});
const wrongSchool = async (id: string) =>
  (await call(students, { token: f.tokens.admin, query: { id } })).body.students.filter((s: any) => s.wrongSchool);
const enrollmentsOf = async (offeringId: string) =>
  (await f.pool.query("SELECT student_id FROM enrollments WHERE offering_id = $1 ORDER BY student_id", [offeringId])).rows
    .map((r) => r.student_id);

before(async () => {
  f = await setup();
  list = await route("offerings/index");
  one = await route("offerings/[id]");
  restore = await route("offerings/[id]/restore");
  students = await route("offerings/[id]/students");
  enroll = await route("offerings/[id]/enroll");
  unenroll = await route("offerings/[id]/unenroll");
});
after(() => f.close());

describe("GET /api/offerings", () => {
  test("staff see every active offering; students only the ones they're enrolled in", async () => {
    for (const role of ["admin", "teacher"] as const) {
      const r = await call(list, { token: f.tokens[role] });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.map((o: any) => o.name).sort(), ["Hermeneutics", "Old Testament Survey", "Spiritual Formation"]);
    }
    const mine = await call(list, { token: f.tokens.student });
    assert.deepEqual(mine.body.map((o: any) => o.name).sort(), ["Hermeneutics", "Old Testament Survey"]);
    const other = (await call(list, { token: f.tokens.admin })).body.find((o: any) => o.name === "Spiritual Formation");
    assert.equal((await call(one, { token: f.tokens.student, query: { id: other.id } })).status, 404, "not their course");
    assert.equal((await call(one, { token: f.tokens.admin, query: { id: other.id } })).status, 200);
    assert.equal(other.schoolType, null, "migrated courses have no Day/Night yet");
    const ot = (await call(list, { token: f.tokens.student })).body.find((o: any) => o.name === "Old Testament Survey");
    assert.equal(ot.instructorName, "Tess Teacher");
    assert.equal(ot.schoolYear, "2026-2027");
    assert.deepEqual(ot.schedule, { startsOn: "2026-09-07", startTime: "18:00", endTime: "20:00", frequency: "weekly", weekdays: [1, 3] });
  });
  test("only admins can include archived offerings", async () => {
    assert.equal((await call(list, { token: f.tokens.student, query: { includeDeleted: "true" } })).status, 403);
    const r = await call(list, { token: f.tokens.admin, query: { includeDeleted: "true" } });
    assert.equal(r.body.length, 4);
    assert.ok(r.body.find((o: any) => o.name === "Deleted Course").deletedAt);
  });
  test("migrated typed teacher names: matched to an account, else kept as text", async () => {
    const all = (await call(list, { token: f.tokens.admin, query: { includeDeleted: "true" } })).body;
    const byName = Object.fromEntries(all.map((o: any) => [o.name, o]));
    // "teacher, tess" (the app's "Last, First" format, any case) is Tess Teacher's account.
    assert.equal(byName["Spiritual Formation"].instructorId, f.ids.teacher);
    assert.equal(byName["Spiritual Formation"].instructorLastName, "Teacher");
    // "Other Prof" has no account: shown as text, and no one can grade as them.
    assert.equal(byName["Hermeneutics"].instructorId, null);
    assert.equal(byName["Hermeneutics"].instructorName, "Other Prof");
    assert.equal(byName["Deleted Course"].instructorName, "X");
  });
  test("requires sign-in", async () => {
    assert.equal((await call(list)).status, 401);
  });
});

describe("POST /api/offerings", () => {
  test("creates an offering and enrolls the matching students", async () => {
    const r = await call(list, { method: "POST", token: f.tokens.admin, body: newOffering() });
    assert.equal(r.status, 201);
    assert.equal(r.body.name, "Church History");
    assert.equal(r.body.semester, 2);
    assert.equal(r.body.schoolType, "night");
    // Sam is a Night student; Rita has no school set, so she isn't enrolled.
    assert.equal(r.body.newEnrollments, 1);
    assert.deepEqual(await enrollmentsOf(r.body.id), [f.ids.student]);
  });
  test("a Day course enrolls only Day students", async () => {
    await f.pool.query("UPDATE student_records SET school_type = 'day' WHERE user_id = $1", [f.ids.student2]);
    const r = await call(list, { method: "POST", token: f.tokens.admin, body: newOffering({ name: "Worship", schoolType: "day" }) });
    assert.equal(r.status, 201);
    assert.deepEqual(await enrollmentsOf(r.body.id), [f.ids.student2]);
  });
  test("courses without Day/Night enroll nobody new", async () => {
    const sf = (await call(list, { token: f.tokens.admin })).body.find((o: any) => o.name === "Spiritual Formation");
    const r = await call(one, { method: "PATCH", token: f.tokens.admin, query: { id: sf.id }, body: { units: 2 } });
    assert.equal(r.body.newEnrollments, 0);
  });
  test("reuses the catalog course for the same name (any case)", async () => {
    const r = await call(list, { method: "POST", token: f.tokens.admin, body: newOffering({ name: "church history", schoolYear: "2027-2028" }) });
    const { rows } = await f.pool.query("SELECT count(*)::int AS n FROM courses WHERE lower(name) = 'church history'");
    assert.equal(rows[0].n, 1);
    assert.equal(r.body.newEnrollments, 0, "no student has 2027-2028 as their 1st-year school year");
  });
  test("only admins can create offerings", async () => {
    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await call(list, { method: "POST", token: f.tokens[role], body: newOffering() })).status, 403);
    }
  });
  test("rejects invalid input", async () => {
    const bad = [
      newOffering({ schoolYear: "2026" }),
      newOffering({ yearLevel: 3 }),
      newOffering({ schedule: { startsOn: "2027-01-11", startTime: "20:00", endTime: "18:00", frequency: "weekly", weekdays: [] } }),
      newOffering({ instructorId: f.ids.student }),
      newOffering({ instructorId: "00000000-0000-4000-8000-000000000000" }),
      { ...newOffering(), extra: true },
      { ...newOffering(), schoolType: undefined },
      newOffering({ schoolType: "evening" }),
    ];
    for (const body of bad) {
      const r = await call(list, { method: "POST", token: f.tokens.admin, body });
      assert.equal(r.status, 400, JSON.stringify(body));
    }
  });
});

describe("PATCH /api/offerings/:id", () => {
  test("moving an offering to a matching year level enrolls students", async () => {
    const created = await call(list, { method: "POST", token: f.tokens.admin, body: newOffering({ name: "Missions", yearLevel: 2 }) });
    assert.equal(created.body.newEnrollments, 0);
    const r = await call(one, { method: "PATCH", token: f.tokens.admin, query: { id: created.body.id }, body: { yearLevel: 1 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.yearLevel, 1);
    assert.equal(r.body.newEnrollments, 1, "the Night student");
  });
  test("switching a course to the other school adds those students and keeps the rest", async () => {
    const missions = (await call(list, { token: f.tokens.admin })).body.find((o: any) => o.name === "Missions");
    const r = await call(one, { method: "PATCH", token: f.tokens.admin, query: { id: missions.id }, body: { schoolType: "day" } });
    assert.deepEqual([r.body.schoolType, r.body.newEnrollments], ["day", 1]);
    assert.deepEqual(await enrollmentsOf(missions.id), [f.ids.student, f.ids.student2].sort());
  });
  test("wrong-school students are listed and can be removed, unless they have a grade or attendance", async () => {
    const missions = (await call(list, { token: f.tokens.admin })).body.find((o: any) => o.name === "Missions");
    const m = await wrongSchool(missions.id);
    assert.deepEqual(m.map((s: any) => [s.studentName, s.schoolType, s.cannotRemove]), [["Sam Student", "night", null]]);
    // Old Testament Survey becomes a Day course: Sam (Night) has a grade there, so he stays.
    await call(one, { method: "PATCH", token: f.tokens.admin, query: { id: f.offerings.c1 }, body: { schoolType: "day" } });
    const ot = await wrongSchool(f.offerings.c1);
    assert.deepEqual(ot.map((s: any) => [s.studentName, s.cannotRemove]), [["Sam Student", "Has a grade"]]);
    const kept = await call(unenroll, { method: "POST", token: f.tokens.admin, query: { id: f.offerings.c1 }, body: { studentIds: [f.ids.student] } });
    assert.deepEqual(kept.body, { removed: 0, skipped: [{ studentId: f.ids.student, reason: "Has a grade" }] });

    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await call(students, { token: f.tokens[role], query: { id: missions.id } })).status, 403, role);
      assert.equal((await call(enroll, { method: "POST", token: f.tokens[role], query: { id: missions.id }, body: { studentIds: [f.ids.student] } })).status, 403, role);
      assert.equal((await call(unenroll, { method: "POST", token: f.tokens[role], query: { id: missions.id }, body: { studentIds: [f.ids.student] } })).status, 403, role);
    }
    const r = await call(unenroll, { method: "POST", token: f.tokens.admin, query: { id: missions.id }, body: { studentIds: [f.ids.student, f.ids.teacher] } });
    assert.deepEqual(r.body, { removed: 1, skipped: [{ studentId: f.ids.teacher, reason: "Not enrolled" }] });
    assert.deepEqual(await enrollmentsOf(missions.id), [f.ids.student2]);
    assert.deepEqual(await wrongSchool(missions.id), []);
    const audit = (await f.pool.query("SELECT entity_id, data FROM audit_log WHERE action = 'enrollment.removed'")).rows;
    assert.deepEqual(audit, [{ entity_id: f.ids.student, data: { offeringId: missions.id } }]);
  });
  test("updates name, instructor and schedule", async () => {
    const id = f.offerings.c2;
    const r = await call(one, {
      method: "PATCH", token: f.tokens.admin, query: { id },
      body: { name: "Hermeneutics I", instructorId: f.ids.teacher, schedule: { startsOn: "2026-09-08", startTime: "09:00", endTime: "11:00", frequency: "once", weekdays: [] } },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, "Hermeneutics I");
    assert.equal(r.body.instructorName, "Tess Teacher");
    assert.deepEqual(r.body.schedule, { startsOn: "2026-09-08", startTime: "09:00", endTime: "11:00", frequency: "once", weekdays: [] });
  });
  test("unknown or malformed ids are 404", async () => {
    assert.equal((await call(one, { token: f.tokens.admin, query: { id: "00000000-0000-4000-8000-000000000000" } })).status, 404);
    assert.equal((await call(one, { token: f.tokens.admin, query: { id: "c1" } })).status, 404);
  });
});

describe("adding a student by hand", () => {
  test("an admin adds a Night student to a Day course as an exception; it shows on their schedule", async () => {
    // Missions is a Day course (from the PATCH tests); Sam is a Night student and was removed above.
    const missions = (await call(list, { token: f.tokens.admin })).body.find((o: any) => o.name === "Missions");
    const r = await call(enroll, { method: "POST", token: f.tokens.admin, query: { id: missions.id }, body: { studentIds: [f.ids.student] } });
    assert.deepEqual(r.body, { added: 1, skipped: [] });
    const row = (await call(students, { token: f.tokens.admin, query: { id: missions.id } })).body.students.find((s: any) => s.studentId === f.ids.student);
    assert.deepEqual([row.manual, row.wrongSchool, row.schoolType], [true, false, "night"], "an exception, not a mistake");
    assert.ok((await call(list, { token: f.tokens.student })).body.some((o: any) => o.name === "Missions"));
    const again = await call(enroll, { method: "POST", token: f.tokens.admin, query: { id: missions.id }, body: { studentIds: [f.ids.student] } });
    assert.deepEqual(again.body, { added: 0, skipped: [{ studentId: f.ids.student, reason: "Already enrolled" }] });
    const audit = (await f.pool.query("SELECT actor_id, entity_id, data FROM audit_log WHERE action = 'enrollment.added'")).rows;
    assert.deepEqual(audit, [{ actor_id: f.ids.admin, entity_id: f.ids.student, data: { offeringId: missions.id } }]);
  });
  test("only active students can be added, and not to an archived course", async () => {
    const missions = (await call(list, { token: f.tokens.admin })).body.find((o: any) => o.name === "Missions");
    assert.equal((await call(enroll, { method: "POST", token: f.tokens.admin, query: { id: missions.id }, body: { studentIds: [f.ids.teacher] } })).status, 400);
    assert.equal((await call(enroll, { method: "POST", token: f.tokens.admin, query: { id: missions.id }, body: { studentIds: [f.ids.old] } })).status, 400);
    assert.equal((await call(enroll, { method: "POST", token: f.tokens.admin, query: { id: missions.id }, body: { studentIds: [] } })).status, 400);
    const archived = (await call(list, { token: f.tokens.admin, query: { includeDeleted: "true" } })).body.find((o: any) => o.deletedAt);
    assert.equal((await call(enroll, { method: "POST", token: f.tokens.admin, query: { id: archived.id }, body: { studentIds: [f.ids.student] } })).status, 409);
  });
  test("a hand-added student stays when automatic enrollment runs again, and can be removed", async () => {
    const missions = (await call(list, { token: f.tokens.admin })).body.find((o: any) => o.name === "Missions");
    await call(one, { method: "PATCH", token: f.tokens.admin, query: { id: missions.id }, body: { units: 2 } });   // re-runs matching
    assert.ok((await enrollmentsOf(missions.id)).includes(f.ids.student));
    const r = await call(unenroll, { method: "POST", token: f.tokens.admin, query: { id: missions.id }, body: { studentIds: [f.ids.student] } });
    assert.equal(r.body.removed, 1);
    assert.ok(!(await enrollmentsOf(missions.id)).includes(f.ids.student));
  });
});

describe("archive and restore", () => {
  test("archiving hides the offering but keeps its enrollments and grades", async () => {
    const id = f.offerings.c1;
    const before = await enrollmentsOf(id);
    assert.equal((await call(one, { method: "DELETE", token: f.tokens.admin, query: { id } })).status, 204);
    const names = (await call(list, { token: f.tokens.student })).body.map((o: any) => o.name);
    assert.ok(!names.includes("Old Testament Survey"));
    assert.deepEqual(await enrollmentsOf(id), before);
    assert.equal((await call(one, { token: f.tokens.student, query: { id } })).status, 404);
  });
  test("restoring brings it back", async () => {
    const r = await call(restore, { method: "POST", token: f.tokens.admin, query: { id: f.offerings.c1 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.deletedAt, null);
  });
  test("only admins can archive or restore", async () => {
    assert.equal((await call(one, { method: "DELETE", token: f.tokens.president, query: { id: f.offerings.c1 } })).status, 403);
    assert.equal((await call(restore, { method: "POST", token: f.tokens.teacher, query: { id: f.offerings.c9 } })).status, 403);
  });
});
