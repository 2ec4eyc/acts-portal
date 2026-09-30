// /api/offerings: course offerings, archive/restore, and automatic enrollment.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let list: Handler, one: Handler, restore: Handler;

const newOffering = (overrides: Record<string, unknown> = {}) => ({
  name: "Church History",
  instructorId: f.ids.teacher,
  yearLevel: 1,
  semester: 2,
  schoolYear: "2026-2027",
  schedule: { startsOn: "2027-01-11", startTime: "18:00", endTime: "20:00", frequency: "weekly", weekdays: [1, 3] },
  ...overrides,
});
const enrollmentsOf = async (offeringId: string) =>
  (await f.pool.query("SELECT student_id FROM enrollments WHERE offering_id = $1 ORDER BY student_id", [offeringId])).rows
    .map((r) => r.student_id);

before(async () => {
  f = await setup();
  list = await route("offerings/index");
  one = await route("offerings/[id]");
  restore = await route("offerings/[id]/restore");
});
after(() => f.close());

describe("GET /api/offerings", () => {
  test("every signed-in role sees the active offerings with schedule and instructor", async () => {
    for (const role of ["admin", "teacher", "student"] as const) {
      const r = await call(list, { token: f.tokens[role] });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.map((o: any) => o.name).sort(), ["Hermeneutics", "Old Testament Survey"]);
    }
    const ot = (await call(list, { token: f.tokens.student })).body.find((o: any) => o.name === "Old Testament Survey");
    assert.equal(ot.instructorName, "Tess Teacher");
    assert.equal(ot.schoolYear, "2026-2027");
    assert.deepEqual(ot.schedule, { startsOn: "2026-09-07", startTime: "18:00", endTime: "20:00", frequency: "weekly", weekdays: [1, 3] });
  });
  test("only admins can include archived offerings", async () => {
    assert.equal((await call(list, { token: f.tokens.student, query: { includeDeleted: "true" } })).status, 403);
    const r = await call(list, { token: f.tokens.admin, query: { includeDeleted: "true" } });
    assert.equal(r.body.length, 3);
    assert.ok(r.body.find((o: any) => o.name === "Deleted Course").deletedAt);
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
    assert.equal(r.body.newEnrollments, 2);
    assert.deepEqual(await enrollmentsOf(r.body.id), [f.ids.student, f.ids.student2].sort());
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
    assert.equal(r.body.newEnrollments, 2);
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
