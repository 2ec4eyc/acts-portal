// Global settings and feature switches.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
let pub: Handler, setting: Handler;
const defaults = { chat: true, receiptUploads: true, announcements: true, studentSchedule: true };

before(async () => {
  f = await setup();
  [pub, setting] = await Promise.all([route("settings/public"), route("settings/[key]")]);
});
after(() => f.close());

describe("settings", () => {
  test("public switches need no sign-in, default on, and are CDN-cacheable", async () => {
    const r = await call(pub);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { features: defaults });
    assert.match(r.headers["cache-control"], /public, s-maxage=60/);
  });

  test("admins change a switch; it's recorded and takes effect", async () => {
    const r = await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { studentSchedule: false } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.value, { ...defaults, studentSchedule: false });
    assert.equal(r.body.updatedBy, "Ada Admin");
    assert.equal((await call(pub)).body.features.studentSchedule, false);
    const audit = (await f.pool.query("SELECT actor_id, new FROM audit_log WHERE table_name = 'app_settings' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(audit.actor_id, f.ids.admin);
    assert.equal(audit.new.value.studentSchedule, false);
  });

  test("changing one switch leaves the others as they were", async () => {
    const r = await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { chat: false } });
    assert.deepEqual(r.body.value, { ...defaults, studentSchedule: false, chat: false });
    const back = await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { chat: true } });
    assert.deepEqual(back.body.value, { ...defaults, studentSchedule: false });
  });

  test("only admins; unknown keys and fields are refused", async () => {
    assert.equal((await call(setting, { method: "PATCH", token: f.tokens.president, query: { key: "features" }, body: { chat: false } })).status, 403);
    assert.equal((await call(setting, { token: f.tokens.teacher, query: { key: "features" } })).status, 403);
    assert.equal((await call(setting, { token: f.tokens.admin, query: { key: "nope" } })).status, 404);
    assert.equal((await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { rocket: true } })).status, 400);
    assert.equal((await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { chat: "yes" } })).status, 400);
    assert.equal((await call(setting, { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: {} })).status, 400);
  });

  test("admins read the current value with who changed it", async () => {
    const r = await call(setting, { token: f.tokens.admin, query: { key: "features" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.value.studentSchedule, false);
    assert.ok(r.body.updatedAt);
  });
});
