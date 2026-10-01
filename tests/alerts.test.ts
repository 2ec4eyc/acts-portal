// Absence alerts: 2 = warning, 3 = escalation; student, teacher and admins notified exactly once.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let attendance: Handler, notifications: Handler, read: Handler, setting: Handler;

before(async () => {
  f = await setup();
  [attendance, notifications, read, setting] = await Promise.all([
    route("attendance/index"), route("notifications/index"), route("notifications/read"), route("settings/[key]"),
  ]);
});
after(() => f.close());

const mark = (date: string, records: { studentId: string; status: string; isExcused?: boolean }[]) =>
  call(attendance, { method: "PUT", token: f.tokens.admin, body: { offeringId: f.offerings.c1, date, records } });
const alerts = async () => (await f.pool.query(
  "SELECT u.email, n.kind, n.title FROM notifications n JOIN users u ON u.id = n.user_id ORDER BY n.id")).rows;

describe("absence alerts", () => {
  test("one absence and an excused absence send nothing", async () => {
    assert.equal((await mark("2026-09-14", [{ studentId: f.ids.student, status: "absent" }])).status, 200);
    assert.equal((await mark("2026-09-16", [{ studentId: f.ids.student, status: "absent", isExcused: true }])).status, 200);
    assert.deepEqual(await alerts(), []);
  });

  test("the 2nd unexcused absence warns the student, the teacher and the admins", async () => {
    assert.equal((await mark("2026-09-21", [{ studentId: f.ids.student, status: "absent" }])).status, 200);
    const rows = await alerts();
    assert.deepEqual(rows.map((r) => r.email).sort(), ["admin@acts.test", "student@acts.test", "teacher@acts.test"]);
    assert.ok(rows.every((r) => r.kind === "attendance_warning" && r.title === "Attendance warning: Old Testament Survey"));
  });

  test("saving the same day again doesn't repeat it", async () => {
    await mark("2026-09-21", [{ studentId: f.ids.student, status: "absent" }]);
    assert.equal((await alerts()).length, 3);
  });

  test("the 3rd escalates, once", async () => {
    await mark("2026-09-23", [{ studentId: f.ids.student, status: "absent" }]);
    await mark("2026-09-28", [{ studentId: f.ids.student, status: "absent" }]);   // 4th: nothing new
    const rows = await alerts();
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.slice(3).map((r) => r.kind), ["attendance_escalation", "attendance_escalation", "attendance_escalation"]);
  });

  test("the student sees theirs in the bell, with an unread count, and can mark them read", async () => {
    const r = await call(notifications, { token: f.tokens.student });
    assert.equal(r.status, 200);
    assert.equal(r.body.unread, 2);
    assert.match(r.body.items[0].body, /3 unexcused absences in Old Testament Survey/);
    assert.equal(r.body.items[0].link, "records");
    assert.equal((await call(read, { method: "POST", token: f.tokens.student, body: { ids: [r.body.items[0].id] } })).status, 204);
    assert.equal((await call(notifications, { token: f.tokens.student })).body.unread, 1);
    await call(read, { method: "POST", token: f.tokens.student, body: { all: true } });
    assert.equal((await call(notifications, { token: f.tokens.student })).body.unread, 0);
  });

  test("people only see and clear their own", async () => {
    const teacher = await call(notifications, { token: f.tokens.teacher });
    assert.equal(teacher.body.unread, 2);
    assert.match(teacher.body.items[0].body, /^Sam Student has 3 unexcused absences/);
    const studentIds = (await call(notifications, { token: f.tokens.student })).body.items.map((n: { id: number }) => n.id);
    await call(read, { method: "POST", token: f.tokens.teacher, body: { ids: studentIds } });
    assert.equal((await call(notifications, { token: f.tokens.teacher })).body.unread, 2);
    assert.equal((await call(read, { method: "POST", token: f.tokens.teacher, body: { all: false } })).status, 400);
  });

  test("admins can count excused absences too, and thresholds must stay in order", async () => {
    const bad = await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "attendanceAlerts" }, body: { warnAt: 3 } });
    assert.equal(bad.status, 400);
    const ok = await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "attendanceAlerts" }, body: { countExcused: true } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    // Rita already has one excused absence (seed). One more excused absence now reaches 2.
    await mark("2026-09-30", [{ studentId: f.ids.student2, status: "absent", isExcused: true }]);
    const rita = await call(notifications, { token: f.tokens.student2 });
    assert.equal(rita.body.items[0].kind, "attendance_warning");
  });

  test("if the save fails, no alert goes out", async () => {
    const before = (await alerts()).length;
    const r = await mark("2026-10-01", [{ studentId: f.ids.student, status: "absent" }, { studentId: f.ids.teacher, status: "absent" }]);
    assert.equal(r.status, 400);
    assert.equal((await alerts()).length, before);
  });
});
