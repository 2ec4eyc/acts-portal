// /api/transcripts and /api/verify: official transcripts with units, frozen content and public checks.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let list: Handler, preview: Handler, one: Handler, revoke: Handler, verify: Handler, grades: Handler, offering: Handler;

before(async () => {
  f = await setup();
  [list, preview, one, revoke, verify, grades, offering] = await Promise.all([
    route("transcripts/index"), route("transcripts/preview"), route("transcripts/[id]"),
    route("transcripts/[id]/revoke"), route("verify"), route("grades/index"), route("offerings/[id]"),
  ]);
});
after(() => f.close());

const issue = (token: string, body: Record<string, unknown>) => call(list, { method: "POST", token, body });

describe("units on course offerings", () => {
  test("default to 3 and can be changed by admins", async () => {
    const r = await call(offering, { token: f.tokens.admin, query: { id: f.offerings.c1 } });
    assert.equal(r.body.units, 3);
    const patched = await call(offering, { method: "PATCH", token: f.tokens.admin, query: { id: f.offerings.c1 }, body: { units: 2 } });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.units, 2);
    const bad = await call(offering, { method: "PATCH", token: f.tokens.admin, query: { id: f.offerings.c1 }, body: { units: 0 } });
    assert.equal(bad.status, 400);
  });
});

describe("preview", () => {
  test("lists finished courses by term with units, remarks and a weighted average", async () => {
    // Student: Old Testament Survey 91 (2 units, set above), Hermeneutics Incomplete, Spiritual Formation pending.
    await call(offering, { method: "PATCH", token: f.tokens.admin, query: { id: f.offerings.c2 }, body: { units: 4 } });
    const r = await call(preview, { token: f.tokens.admin, query: { studentId: f.ids.student } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.student.fullName, "Sam Student");
    assert.equal(r.body.student.studentNo, "S-001");
    assert.deepEqual(r.body.terms, [{
      schoolYear: "2026-2027", yearLevel: 1, semester: 1, unitsEarned: 2,
      courses: [
        { name: "Hermeneutics", units: 4, grade: null, remark: "Incomplete" },
        { name: "Old Testament Survey", units: 2, grade: 91, remark: "Passed" },
      ],
    }]);
    assert.deepEqual(r.body.totals, { unitsAttempted: 6, unitsEarned: 2, generalAverage: 91 });
  });

  test("weights the average by units", async () => {
    const offeringId = f.offerings.c3; // Spiritual Formation, 2nd semester, 3 units
    const put = await call(grades, { method: "PUT", token: f.tokens.admin, body: { offeringId, studentId: f.ids.student, value: 70 } });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const r = await call(preview, { token: f.tokens.admin, query: { studentId: f.ids.student } });
    // (91*2 + 70*3) / 5 = 78.4; failed course earns no units.
    assert.deepEqual(r.body.totals, { unitsAttempted: 9, unitsEarned: 2, generalAverage: 78.4 });
    assert.equal(r.body.terms[1].courses[0].remark, "Failed");
  });

  test("is for admins, and for student accounts only", async () => {
    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await call(preview, { token: f.tokens[role], query: { studentId: f.ids.student } })).status, 403, role);
    }
    assert.equal((await call(preview, { token: f.tokens.admin, query: { studentId: f.ids.teacher } })).status, 400);
    assert.equal((await call(preview, { token: f.tokens.admin, query: { studentId: "nope" } })).status, 400);
  });
});

describe("issue, read, revoke, verify", () => {
  let id: string, code: string;

  test("only admins can issue", async () => {
    assert.equal((await issue(f.tokens.president, { studentId: f.ids.student })).status, 403);
    const r = await issue(f.tokens.admin, { studentId: f.ids.student, purpose: "For transfer" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ({ id, code } = r.body);
    assert.match(code, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    assert.equal(r.body.purpose, "For transfer");
    assert.equal(r.body.issuedBy, "Ada Admin");
    assert.equal(r.body.content.totals.generalAverage, 78.4);
    assert.ok(await f.pool.query("SELECT 1 FROM audit_log WHERE action = 'transcript.issued' AND entity_id = $1", [id]).then((q) => q.rowCount));
  });

  test("a student with no finished courses cannot get one yet", async () => {
    await f.pool.query("UPDATE grades SET value = NULL, is_incomplete = false WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id = $1)", [f.ids.student2]);
    assert.equal((await issue(f.tokens.admin, { studentId: f.ids.student2 })).status, 409);
  });

  test("issued content is frozen: later grade changes don't alter it", async () => {
    await call(grades, { method: "PUT", token: f.tokens.admin, body: { offeringId: f.offerings.c3, studentId: f.ids.student, value: 99 } });
    const r = await call(one, { token: f.tokens.admin, query: { id } });
    assert.equal(r.body.content.totals.generalAverage, 78.4);
  });

  test("students see their own transcripts; office staff can read; teachers and other students cannot", async () => {
    const mine = await call(list, { token: f.tokens.student, query: { studentId: f.ids.student } });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.map((t: { id: string }) => t.id), [id]);
    assert.equal(mine.body[0].content, undefined, "lists carry no content");
    assert.equal((await call(one, { token: f.tokens.student, query: { id } })).status, 200);
    assert.equal((await call(one, { token: f.tokens.president, query: { id } })).status, 200);
    assert.equal((await call(one, { token: f.tokens.teacher, query: { id } })).status, 403);
    assert.equal((await call(one, { token: f.tokens.student2, query: { id } })).status, 403);
    assert.equal((await call(list, { token: f.tokens.student2, query: { studentId: f.ids.student } })).status, 403);
  });

  test("verification is public and shows no grades", async () => {
    for (const c of [code, code.toLowerCase().replace(/-/g, " ")]) {
      const r = await call(verify, { query: { code: c } });
      assert.equal(r.status, 200, c);
      assert.deepEqual(Object.keys(r.body).sort(), ["issuedAt", "issuedBy", "revokedAt", "school", "status", "studentName", "studentNo"]);
      assert.equal(r.body.status, "valid");
      assert.equal(r.body.studentName, "Sam Student");
    }
    assert.equal((await call(verify, { query: { code: "AAAA-AAAA-AAAA" } })).status, 404);
    assert.equal((await call(verify, { query: { code: "x" } })).status, 404);
  });

  test("admins revoke with a reason; verification then says revoked", async () => {
    assert.equal((await call(revoke, { method: "POST", token: f.tokens.president, query: { id }, body: { reason: "x" } })).status, 403);
    assert.equal((await call(revoke, { method: "POST", token: f.tokens.admin, query: { id }, body: {} })).status, 400);
    const r = await call(revoke, { method: "POST", token: f.tokens.admin, query: { id }, body: { reason: "Issued with a wrong grade" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.revokeReason, "Issued with a wrong grade");
    assert.equal((await call(revoke, { method: "POST", token: f.tokens.admin, query: { id }, body: { reason: "again" } })).status, 409);
    const v = await call(verify, { query: { code } });
    assert.equal(v.body.status, "revoked");
    assert.ok(v.body.revokedAt);
  });

  test("a student with issued transcripts cannot be deleted", async () => {
    const users = await route("users/[id]");
    await f.pool.query("UPDATE users SET status = 'archived', archived_at = now() WHERE id = $1", [f.ids.student]);
    const r = await call(users, { method: "DELETE", token: f.tokens.admin, query: { id: f.ids.student } });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /issued transcripts/);
  });
});
