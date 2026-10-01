// Automatic audit trail: every change made through the API is recorded with who made it.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let audit: Handler, grades: Handler;
const one = async (sql: string, params: unknown[] = []) => (await f.pool.query(sql, params)).rows[0];

before(async () => {
  f = await setup();
  [audit, grades] = await Promise.all([route("audit/index"), route("grades/index")]);
});
after(() => f.close());

describe("automatic audit trail", () => {
  test("a grade change is recorded with the admin who made it, before and after", async () => {
    const put = await call(grades, { method: "PUT", token: f.tokens.admin, body: { offeringId: f.offerings.c1, studentId: f.ids.student, value: 88 } });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const row = await one("SELECT * FROM audit_log WHERE table_name = 'grades' ORDER BY id DESC LIMIT 1");
    assert.equal(row.actor_id, f.ids.admin);
    assert.equal(row.op, "UPDATE");
    assert.equal(Number(row.old.value), 91);
    assert.equal(Number(row.new.value), 88);
  });

  test("the API lists it with a readable subject and the changed fields", async () => {
    const r = await call(audit, { token: f.tokens.admin, query: { table: "grades" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const [entry] = r.body.entries;
    assert.equal(entry.actor.name, "Ada Admin");
    assert.equal(entry.subject, "Sam Student · Old Testament Survey");
    assert.equal(entry.op, "UPDATE");
    const value = entry.changes.find((c: { field: string }) => c.field === "value");
    assert.deepEqual([Number(value.from), Number(value.to)], [91, 88]);
    assert.ok(!entry.changes.some((c: { field: string }) => c.field === "updated_at"), "timestamps aren't noise");
    const recordedBy = entry.changes.find((c: { field: string }) => c.field === "recorded_by");
    assert.equal(recordedBy.to, "Ada Admin", "people are shown by name, not id");
  });

  test("a teacher's grade is recorded as the teacher", async () => {
    const put = await call(grades, { method: "PUT", token: f.tokens.teacher, body: { offeringId: f.offerings.c1, studentId: f.ids.student2, value: 79 } });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal((await one("SELECT actor_id FROM audit_log WHERE table_name = 'grades' ORDER BY id DESC LIMIT 1")).actor_id, f.ids.teacher);
  });

  test("signing in doesn't fill the log (session ids are ignored)", async () => {
    const n = Number((await one("SELECT count(*) FROM audit_log")).count);
    const session = await route("me-session");
    assert.equal((await call(session, { method: "POST", token: f.tokens.student, body: { sessionId: crypto.randomUUID() } })).status, 204);
    assert.equal(Number((await one("SELECT count(*) FROM audit_log")).count), n);
  });

  test("a failed request saves nothing and logs nothing", async () => {
    const n = Number((await one("SELECT count(*) FROM audit_log")).count);
    const bulk = await route("grades/bulk");
    const r = await call(bulk, { method: "POST", token: f.tokens.admin, body: { items: [
      { offeringId: f.offerings.c1, studentId: f.ids.student, value: 50 },
      { offeringId: f.offerings.c1, studentId: f.ids.teacher, value: 50 },   // not a student: whole request fails
    ] } });
    assert.ok(r.status >= 400);
    assert.equal(Number((await one("SELECT count(*) FROM audit_log")).count), n);
    assert.equal(Number((await one("SELECT g.value FROM grades g JOIN enrollments e ON e.id = g.enrollment_id WHERE e.student_id = $1 AND e.offering_id = $2", [f.ids.student, f.offerings.c1])).value), 88);
  });

  test("the log can't be edited or deleted", async () => {
    await assert.rejects(f.pool.query("DELETE FROM audit_log"), /append-only/);
    await assert.rejects(f.pool.query("UPDATE audit_log SET action = 'x'"), /append-only/);
  });

  test("writes outside a request are tagged as system", async () => {
    await f.pool.query("UPDATE users SET contact_number = '0999' WHERE id = $1", [f.ids.student2]);
    const row = await one("SELECT actor_id, data FROM audit_log WHERE table_name = 'users' ORDER BY id DESC LIMIT 1");
    assert.equal(row.actor_id, null);
    assert.deepEqual(row.data, { source: "system" });
  });

  test("filters and pagination", async () => {
    const byTeacher = await call(audit, { token: f.tokens.admin, query: { actorId: f.ids.teacher } });
    assert.ok(byTeacher.body.entries.length >= 1);
    assert.ok(byTeacher.body.entries.every((e: { actor: { id: string } }) => e.actor.id === f.ids.teacher));
    const page1 = await call(audit, { token: f.tokens.admin, query: { limit: "2" } });
    assert.equal(page1.body.entries.length, 2);
    assert.ok(page1.body.nextBefore);
    const page2 = await call(audit, { token: f.tokens.admin, query: { limit: "2", before: String(page1.body.nextBefore) } });
    assert.ok(page2.body.entries[0].id < page1.body.entries[1].id);
    assert.equal((await call(audit, { token: f.tokens.admin, query: { from: "2000-01-01", to: "2000-01-02" } })).body.entries.length, 0);
  });

  test("admins only", async () => {
    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await call(audit, { token: f.tokens[role] })).status, 403, role);
    }
  });

  test("deleting an account keeps the record of what they did", async () => {
    // The president grades once, then their account is archived and deleted.
    const put = await call(grades, { method: "PUT", token: f.tokens.president, body: { offeringId: f.offerings.c1, studentId: f.ids.student2, value: 81 } });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    await f.pool.query("UPDATE users SET status = 'archived', archived_at = now() WHERE id = $1", [f.ids.president]);
    const users = await route("users/[id]");
    const del = await call(users, { method: "DELETE", token: f.tokens.admin, query: { id: f.ids.president } });
    assert.equal(del.status, 204, JSON.stringify(del.body));
    const r = await call(audit, { token: f.tokens.admin, query: { actorId: f.ids.president } });
    assert.ok(r.body.entries.length >= 1);
    assert.equal(r.body.entries[0].actor.name, "Deleted account");
    const removal = await one("SELECT actor_id, op FROM audit_log WHERE table_name = 'users' AND entity_id = $1 ORDER BY id DESC LIMIT 1", [f.ids.president]);
    assert.deepEqual(removal, { actor_id: f.ids.admin, op: "DELETE" });
  });
});
