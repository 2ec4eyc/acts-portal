// Receipt storage: usage, the upload limit, alerts to admins, deleting files, and the R2 recount.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";
import { bucket, type BucketObject } from "../server/lib/storage.js";

let f: Fixture;
const h: Record<string, Handler> = {};
const today = () => new Date().toISOString().slice(0, 10);
// A valid PNG header followed by random bytes, so each file is different.
const png = () => Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), randomBytes(200)]);
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

before(async () => {
  f = await setup();
  for (const name of ["storage/index", "storage/files/index", "storage/files/delete", "storage/recount", "settings/[key]",
    "finance/invoices/index", "finance/receipts/index", "finance/receipts/upload-url", "finance/receipts/[id]/file",
    "finance/receipts/[id]/review", "finance/students/[id]/statement", "cron/daily"]) {
    h[name] = await route(name);
  }
});
after(() => f.close());

const upload = async (token = f.tokens.student) => {
  const file = png();
  const r = await call(h["finance/receipts/index"], { method: "POST", token, body: {
    contentType: "image/png", sizeBytes: file.length, sha256: sha(file), data: file.toString("base64"),
    amountClaimed: 500, paidOn: today(), method: "gcash" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id as string;
};
const review = (id: string, body: Record<string, unknown>) =>
  call(h["finance/receipts/[id]/review"], { method: "POST", token: f.tokens.admin, query: { id }, body });
const storageAlerts = async () => (await f.pool.query(
  "SELECT title FROM notifications WHERE kind = 'storage_warning' AND user_id = $1 ORDER BY created_at", [f.ids.admin])).rows.map((r) => r.title);

describe("access and settings", () => {
  test("only admins can see or manage storage", async () => {
    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await call(h["storage/index"], { token: f.tokens[role] })).status, 403, role);
      assert.equal((await call(h["storage/files/index"], { token: f.tokens[role] })).status, 403, role);
      assert.equal((await call(h["storage/files/delete"], { method: "POST", token: f.tokens[role], body: { ids: [randomUUID()] } })).status, 403, role);
      assert.equal((await call(h["storage/recount"], { method: "POST", token: f.tokens[role] })).status, 403, role);
    }
  });

  test("limits default to 7 GB / 9 GB and the warning must stay below the limit", async () => {
    const r = await call(h["settings/[key]"], { token: f.tokens.admin, query: { key: "storage" } });
    assert.deepEqual(r.body.value, { warnAtGb: 7, limitGb: 9, deleteApprovedAfterYears: 5 });
    const patch = (body: unknown) => call(h["settings/[key]"], { method: "PATCH", token: f.tokens.admin, query: { key: "storage" }, body });
    assert.equal((await patch({ warnAtGb: 9 })).status, 400);
    assert.equal((await patch({ limitGb: 0.15 })).status, 400);
    assert.equal((await patch({ deleteApprovedAfterYears: 0 })).status, 400);
    assert.equal((await patch({ warnAtGb: 6.5 })).status, 200);
    assert.equal((await patch({ warnAtGb: 7 })).status, 200);
  });
});

describe("database storage: usage and deleting files", () => {
  let pending = "", approved = "", rejected = "";

  before(async () => {
    pending = await upload();
    approved = await upload();
    rejected = await upload(f.tokens.student2);
    assert.equal((await review(approved, { decision: "approve" })).status, 200);
    assert.equal((await review(rejected, { decision: "reject", note: "Wrong account" })).status, 200);
  });

  test("usage counts the stored files by status", async () => {
    const u = (await call(h["storage/index"], { token: f.tokens.admin })).body;
    assert.equal(u.mode, "db");
    assert.equal(u.files, 3);
    assert.equal(u.usedBytes, 3 * 208);
    assert.deepEqual([u.byStatus.pending.files, u.byStatus.approved.files, u.byStatus.rejected.files], [1, 1, 1]);
    assert.deepEqual([u.limitBytes, u.warnBytes, u.level, u.measured], [9e9, 7e9, "ok", null]);
  });

  test("the file list says which files can be deleted and why not", async () => {
    const list = (await call(h["storage/files/index"], { token: f.tokens.admin })).body;
    const reason = (id: string) => list.files.find((x: { id: string }) => x.id === id).cannotDelete;
    assert.equal(reason(rejected), null);
    assert.equal(reason(approved), "Approved less than 5 years ago");
    assert.equal(reason(pending), "Waiting for review");
    const only = (await call(h["storage/files/index"], { token: f.tokens.admin, query: { deletable: "true" } })).body;
    assert.deepEqual(only.files.map((x: { id: string }) => x.id), [rejected]);
    const byName = (await call(h["storage/files/index"], { token: f.tokens.admin, query: { q: "rita" } })).body;
    assert.deepEqual(byName.files.map((x: { id: string }) => x.id), [rejected]);
  });

  test("deleting removes only allowed files; receipts and payments stay", async () => {
    const before = (await call(h["finance/students/[id]/statement"], { token: f.tokens.admin, query: { id: f.ids.student } })).body;
    const missing = randomUUID();
    const r = await call(h["storage/files/delete"], { method: "POST", token: f.tokens.admin, body: { ids: [rejected, approved, pending, missing] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.deleted, 1);
    assert.equal(r.body.freedBytes, 208);
    assert.deepEqual(Object.fromEntries(r.body.skipped.map((s: { id: string; reason: string }) => [s.id, s.reason])), {
      [approved]: "Approved less than 5 years ago", [pending]: "Waiting for review", [missing]: "Not found" });

    const file = await call(h["finance/receipts/[id]/file"], { token: f.tokens.admin, query: { id: rejected } });
    assert.equal(file.status, 410);
    assert.match(file.body.error, /deleted on .* to free space/);
    assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM receipt_files WHERE receipt_id = $1", [rejected])).rows[0].n, 0);
    const u = (await call(h["storage/index"], { token: f.tokens.admin })).body;
    assert.deepEqual([u.files, u.deletedFiles, u.usedBytes], [2, 1, 2 * 208]);
    const deleted = (await call(h["storage/files/index"], { token: f.tokens.admin, query: { status: "deleted" } })).body;
    assert.equal(deleted.files[0].cannotDelete, "Already deleted");

    // An approved receipt's file can go once it is older than the setting.
    await f.pool.query("UPDATE receipt_uploads SET reviewed_at = now() - interval '6 years' WHERE id = $1", [approved]);
    assert.equal((await call(h["storage/files/delete"], { method: "POST", token: f.tokens.admin, body: { ids: [approved] } })).body.deleted, 1);
    const after = (await call(h["finance/students/[id]/statement"], { token: f.tokens.admin, query: { id: f.ids.student } })).body;
    assert.deepEqual(after.totals, before.totals);
    assert.deepEqual(after.payments.map((p: { id: string }) => p.id), before.payments.map((p: { id: string }) => p.id));
    assert.ok(after.receipts.find((x: { id: string }) => x.id === approved).fileDeletedAt);
  });

  test("file deletions are audited with the admin", async () => {
    const rows = (await f.pool.query(
      "SELECT entity_id FROM audit_log WHERE table_name = 'receipt_uploads' AND op = 'UPDATE' AND actor_id = $1 AND new ? 'file_deleted_at' AND new->>'file_deleted_at' IS NOT NULL",
      [f.ids.admin])).rows.map((r) => r.entity_id);
    assert.ok(rows.includes(rejected) && rows.includes(approved), JSON.stringify(rows));
  });
});

describe("R2: recount, orphans, alerts and the upload limit", () => {
  const original = { list: bucket.list, remove: bucket.remove };
  let objects: BucketObject[] = [];
  let removed: string[] = [];
  const old = new Date(Date.now() - 3 * 86_400_000);
  const key = `receipts/${randomUUID()}/kept`;
  const cron = () => call(h["cron/daily"], { headers: { authorization: "Bearer test-secret" } });
  const uploadUrl = () => call(h["finance/receipts/upload-url"], { method: "POST", token: f.tokens.student,
    body: { contentType: "image/jpeg", sizeBytes: 1000, sha256: randomBytes(32).toString("hex") } });

  before(async () => {
    Object.assign(process.env, { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "receipts-test", CRON_SECRET: "test-secret" });
    bucket.list = async () => objects;
    bucket.remove = async (keys) => { removed.push(...keys); objects = objects.filter((o) => !keys.includes(o.key)); };
    await f.pool.query(`INSERT INTO receipt_uploads (student_id, amount_claimed, paid_on, method, file_key, content_type, size_bytes, sha256)
      VALUES ($1, 100, current_date, 'cash', $2, 'image/jpeg', 1000, $3)`, [f.ids.student, `r2:${key}`, "e".repeat(64)]);
    await f.pool.query("DELETE FROM notifications WHERE kind = 'storage_warning'");
  });
  after(() => {
    Object.assign(bucket, original);
    for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "CRON_SECRET"]) delete process.env[k];
  });

  test("recount removes day-old orphans, keeps fresh uploads, and saves the real total", async () => {
    objects = [
      { key, size: 1000, lastModified: old },
      { key: "receipts/x/abandoned", size: 5000, lastModified: old },
      { key: "receipts/x/uploading-now", size: 700, lastModified: new Date() },
    ];
    const r = await call(h["storage/recount"], { method: "POST", token: f.tokens.admin });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { skipped: false, objects: 2, bytes: 1700, orphansRemoved: 1 });
    assert.deepEqual(removed, ["receipts/x/abandoned"]);
    const u = (await call(h["storage/index"], { token: f.tokens.admin })).body;
    assert.deepEqual([u.mode, u.trackedBytes, u.usedBytes, u.measured.objects, u.measured.orphansRemoved], ["r2", 1000, 1700, 2, 1]);
    // A second click within a minute doesn't list the bucket again.
    assert.equal((await call(h["storage/recount"], { method: "POST", token: f.tokens.admin })).body.skipped, true);
  });

  test("admins are told once at the warning level, and once when full; full storage refuses uploads", async () => {
    objects = [{ key, size: 7.2e9, lastModified: old }];
    assert.equal((await cron()).body.storage.level, "warn");
    assert.equal((await cron()).body.storage.level, "warn");
    assert.deepEqual(await storageAlerts(), ["Receipt storage is almost full"]);
    assert.equal((await uploadUrl()).status, 200, "still room");

    objects = [{ key, size: 9e9 - 500, lastModified: old }];
    assert.equal((await cron()).body.storage.level, "full");
    const refused = await uploadUrl();
    assert.equal(refused.status, 507);
    assert.match(refused.body.error, /Receipt storage is full/);
    await cron();
    assert.deepEqual(await storageAlerts(), ["Receipt storage is almost full", "Receipt storage is full"]);
    const body = (await f.pool.query("SELECT body FROM notifications WHERE kind = 'storage_warning' ORDER BY created_at DESC LIMIT 1")).rows[0].body;
    assert.match(body, /9\.00 GB of the 9\.00 GB limit \(Cloudflare R2\)/);
  });

  test("raising the limit re-opens uploads quietly; crossing again alerts again", async () => {
    const patch = (body: unknown) => call(h["settings/[key]"], { method: "PATCH", token: f.tokens.admin, query: { key: "storage" }, body });
    assert.equal((await patch({ warnAtGb: 15, limitGb: 20 })).status, 200);
    assert.equal((await cron()).body.storage.level, "ok");
    assert.equal((await uploadUrl()).status, 200);
    assert.equal((await storageAlerts()).length, 2, "no alert for going down");
    assert.equal((await patch({ warnAtGb: 7, limitGb: 9 })).status, 200);
    assert.equal((await cron()).body.storage.level, "full");
    assert.equal((await storageAlerts()).length, 3);
  });

  test("deleting an R2 file removes the object and lowers the measured total at once", async () => {
    const [{ id }] = (await f.pool.query("SELECT id FROM receipt_uploads WHERE file_key = $1", [`r2:${key}`])).rows;
    await f.pool.query("UPDATE receipt_uploads SET status = 'rejected', reviewed_at = now(), review_note = 'x' WHERE id = $1", [id]);
    const r = await call(h["storage/files/delete"], { method: "POST", token: f.tokens.admin, body: { ids: [id] } });
    assert.equal(r.body.deleted, 1);
    assert.equal(r.body.warning, null);
    assert.ok(removed.includes(key));
    const u = (await call(h["storage/index"], { token: f.tokens.admin })).body;
    assert.equal(u.measured.bytes, 9e9 - 1500);
    assert.equal(u.level, "full", "still within 2 MB of the limit");
  });
});
