// Announcements: posted by admins to roles, narrowed by batch or course, scheduled, pinned, expiring.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let list: Handler, one: Handler, read: Handler, setting: Handler;

before(async () => {
  f = await setup();
  [list, one, read, setting] = await Promise.all([
    route("announcements/index"), route("announcements/[id]"), route("announcements/[id]/read"), route("settings/[key]"),
  ]);
  // Rita moves to another batch, so batch targeting can be checked.
  await f.pool.query("INSERT INTO cohorts (name, school_type) VALUES ('Batch 2026-B', 'night')");
  await f.pool.query("UPDATE student_records SET cohort_id = (SELECT id FROM cohorts WHERE name = 'Batch 2026-B') WHERE user_id = $1", [f.ids.student2]);
});
after(() => f.close());

const post = (body: Record<string, unknown>, token = f.tokens.admin) => call(list, { method: "POST", token, body });
const titles = async (token: string) => (await call(list, { token })).body.map((a: { title: string }) => a.title);
const hour = 3_600_000;

describe("announcements", () => {
  test("only admins post", async () => {
    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await post({ title: "x", body: "y", audienceRoles: ["student"] }, f.tokens[role])).status, 403, role);
    }
  });

  test("role targeting", async () => {
    const r = await post({ title: "Enrollment opens Monday", body: "Bring your forms.", audienceRoles: ["student"] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.author, "Ada Admin");
    await post({ title: "Faculty meeting", body: "Room 2, 3 PM.", audienceRoles: ["teacher", "admin"] });
    assert.deepEqual(await titles(f.tokens.student), ["Enrollment opens Monday"]);
    assert.deepEqual(await titles(f.tokens.teacher), ["Faculty meeting"]);
    assert.deepEqual((await titles(f.tokens.admin)), ["Faculty meeting"]);
  });

  test("batch and course narrow it for students; staff in the audience still see it", async () => {
    await post({ title: "Batch A outing", body: "Saturday.", audienceRoles: ["student", "admin"], cohort: "Batch 2026-A" });
    await post({ title: "Hermeneutics quiz moved", body: "Now Friday.", audienceRoles: ["student", "teacher"], offeringId: f.offerings.c2 });
    await post({ title: "OT Survey notes posted", body: "See files.", audienceRoles: ["student", "teacher"], offeringId: f.offerings.c1 });
    const sam = await titles(f.tokens.student), rita = await titles(f.tokens.student2), tess = await titles(f.tokens.teacher);
    assert.ok(sam.includes("Batch A outing") && sam.includes("Hermeneutics quiz moved") && sam.includes("OT Survey notes posted"));
    assert.ok(!rita.includes("Batch A outing"), "other batch");
    assert.ok(!rita.includes("Hermeneutics quiz moved"), "not enrolled in that course");
    assert.ok(rita.includes("OT Survey notes posted"));
    assert.ok(tess.includes("OT Survey notes posted") && !tess.includes("Hermeneutics quiz moved"), "teachers: only their courses");
    assert.ok((await titles(f.tokens.admin)).includes("Batch A outing"));
    assert.equal((await post({ title: "x", body: "y", audienceRoles: ["student"], cohort: "No such batch" })).status, 400);
  });

  test("scheduled and expired ones are hidden; pinned come first", async () => {
    const soon = new Date(Date.now() + hour).toISOString();
    await post({ title: "Next week", body: "Later.", audienceRoles: ["student"], publishAt: soon });
    const past = new Date(Date.now() - 2 * hour).toISOString(), ended = new Date(Date.now() - hour).toISOString();
    await post({ title: "Old news", body: "Gone.", audienceRoles: ["student"], publishAt: past, expiresAt: ended });
    await post({ title: "Pinned: exam rules", body: "Read these.", audienceRoles: ["student"], pinned: true, publishAt: past });
    const sam = await titles(f.tokens.student);
    assert.equal(sam[0], "Pinned: exam rules");
    assert.ok(!sam.includes("Next week") && !sam.includes("Old news"));
    const manage = await call(list, { token: f.tokens.admin, query: { manage: "true" } });
    const status = Object.fromEntries(manage.body.map((a: { title: string; status: string }) => [a.title, a.status]));
    assert.deepEqual([status["Next week"], status["Old news"], status["Pinned: exam rules"]], ["scheduled", "expired", "live"]);
    assert.equal((await call(list, { token: f.tokens.teacher, query: { manage: "true" } })).status, 403);
    assert.equal((await post({ title: "x", body: "y", audienceRoles: ["student"], publishAt: soon, expiresAt: past })).status, 400);
  });

  test("read flags and read counts", async () => {
    const feed = (await call(list, { token: f.tokens.student })).body;
    const target = feed.find((a: { title: string }) => a.title === "Enrollment opens Monday");
    assert.equal(target.read, false);
    assert.equal((await call(read, { method: "POST", token: f.tokens.student, query: { id: target.id } })).status, 204);
    assert.equal((await call(list, { token: f.tokens.student })).body.find((a: { id: string }) => a.id === target.id).read, true);
    const manage = (await call(list, { token: f.tokens.admin, query: { manage: "true" } })).body;
    assert.equal(manage.find((a: { id: string }) => a.id === target.id).readCount, 1);
    // Can't mark one you can't see.
    const faculty = manage.find((a: { title: string }) => a.title === "Faculty meeting");
    assert.equal((await call(read, { method: "POST", token: f.tokens.student, query: { id: faculty.id } })).status, 404);
  });

  test("editing changes only what's sent; deleting removes it", async () => {
    const manage = (await call(list, { token: f.tokens.admin, query: { manage: "true" } })).body;
    const a = manage.find((x: { title: string }) => x.title === "Enrollment opens Monday");
    const r = await call(one, { method: "PATCH", token: f.tokens.admin, query: { id: a.id }, body: { pinned: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.pinned, true);
    assert.equal(r.body.title, "Enrollment opens Monday");
    assert.deepEqual(r.body.audienceRoles, ["student"]);
    assert.equal((await call(one, { method: "DELETE", token: f.tokens.admin, query: { id: a.id } })).status, 204);
    assert.ok(!(await titles(f.tokens.student)).includes("Enrollment opens Monday"));
    const audit = (await f.pool.query("SELECT op FROM audit_log WHERE table_name = 'announcements' AND entity_id = $1 ORDER BY id", [a.id])).rows;
    assert.deepEqual(audit.map((x) => x.op), ["INSERT", "UPDATE", "DELETE"]);
  });

  test("switched off: nobody sees them and nothing can be posted", async () => {
    await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { announcements: false } });
    assert.deepEqual(await titles(f.tokens.student), []);
    assert.equal((await post({ title: "x", body: "y", audienceRoles: ["student"] })).status, 403);
    await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { announcements: true } });
    assert.ok((await titles(f.tokens.student)).length > 0);
  });
});
