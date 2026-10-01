// Course materials: who can upload, links, R2 uploads (signing stubbed), notifications, deletes, storage.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";
import { bucket } from "../server/lib/storage.js";

let f: Fixture;
const h: Record<string, Handler> = {};
const PDF = Buffer.from("%PDF-1.4\n% test\n");

before(async () => {
  f = await setup();
  for (const name of ["materials/index", "materials/[id]", "materials/[id]/file", "materials/upload-url", "storage/index", "notifications/index"]) {
    h[name] = await route(name);
  }
});
after(() => f.close());

const base = () => ({ offeringId: f.offerings.c1, category: "notes", fileName: "Week 1.pdf", contentType: "application/pdf" });
const post = (token: string, body: Record<string, unknown>) => call(h["materials/index"], { method: "POST", token, body });
const alerts = async (userId: string) =>
  (await f.pool.query("SELECT title, body, link FROM notifications WHERE kind = 'course_material' AND user_id = $1 ORDER BY id", [userId])).rows;

describe("who can upload", () => {
  test("admins, president and VP can post to any course; teachers only to their own; students never", async () => {
    const data = PDF.toString("base64");
    assert.equal((await post(f.tokens.admin, { ...base(), offeringId: f.offerings.c2, data })).status, 201);
    assert.equal((await post(f.tokens.president, { ...base(), offeringId: f.offerings.c2, fileName: "P.pdf", data })).status, 201);
    assert.equal((await post(f.tokens.teacher, { ...base(), data })).status, 201, "Tess teaches c1");
    assert.equal((await post(f.tokens.teacher, { ...base(), offeringId: f.offerings.c2, data })).status, 403, "not her course");
    assert.equal((await post(f.tokens.student, { ...base(), data })).status, 403);
  });
});

describe("links", () => {
  test("a link is posted with a title, and opens as a link", async () => {
    const r = await post(f.tokens.teacher, { offeringId: f.offerings.c1, category: "notes", fileName: "Lecture recording", url: "https://youtu.be/abc" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual([r.body.linkUrl, r.body.contentType, r.body.sizeBytes], ["https://youtu.be/abc", null, null]);
    const dl = await call(h["materials/[id]/file"], { token: f.tokens.student, query: { id: r.body.id } });
    assert.deepEqual(dl.body, { url: "https://youtu.be/abc", link: true });
  });
  test("only http(s) links; exactly one of file, key or link", async () => {
    for (const url of ["javascript:alert(1)", "ftp://x.test/a", "not a url"]) {
      assert.equal((await post(f.tokens.admin, { offeringId: f.offerings.c1, category: "notes", fileName: "x", url })).status, 400, url);
    }
    assert.equal((await post(f.tokens.admin, { ...base(), url: "https://a.test", data: PDF.toString("base64") })).status, 400);
    assert.equal((await post(f.tokens.admin, { ...base() })).status, 400, "nothing to store");
    assert.equal((await post(f.tokens.admin, { offeringId: f.offerings.c1, category: "notes", fileName: "file without type", data: PDF.toString("base64") })).status, 400);
  });
});

describe("notifications", () => {
  test("the course's active students are told; others aren't", async () => {
    await f.pool.query("DELETE FROM notifications WHERE kind = 'course_material'");
    const r = await post(f.tokens.teacher, { ...base(), fileName: "Week 2.pdf", data: PDF.toString("base64") });
    assert.equal(r.body.notified, 2, "Sam and Rita are in Old Testament Survey");
    assert.deepEqual(await alerts(f.ids.student), [{ title: "New notes in Old Testament Survey", body: "Week 2.pdf", link: "notes" }]);
    assert.equal((await alerts(f.ids.student2)).length, 1);
    await f.pool.query("DELETE FROM notifications WHERE kind = 'course_material'");
    const exam = await post(f.tokens.admin, { ...base(), offeringId: f.offerings.c2, category: "exams", fileName: "Midterm", eventDate: "2026-10-20", eventTime: "09:00", data: PDF.toString("base64") });
    assert.equal(exam.body.notified, 1, "only Sam is in Hermeneutics");
    assert.deepEqual(await alerts(f.ids.student), [{ title: "New exam in Hermeneutics", body: "Midterm · 2026-10-20 09:00", link: "notes" }]);
    assert.deepEqual(await alerts(f.ids.student2), []);
  });
});

describe("database storage (no R2)", () => {
  test("upload-url says to send the file through the API, up to 800 KB", async () => {
    const r = await call(h["materials/upload-url"], { method: "POST", token: f.tokens.teacher, body: { offeringId: f.offerings.c1, fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 1000 } });
    assert.deepEqual(r.body, { mode: "db", maxBytes: 800 * 1024 });
    assert.equal((await post(f.tokens.teacher, { ...base(), data: Buffer.alloc(801 * 1024).toString("base64") })).status, 413);
  });
  test("files stored in the database still download as bytes and count toward storage", async () => {
    const r = await post(f.tokens.teacher, { ...base(), fileName: "Bytes.pdf", data: PDF.toString("base64") });
    const dl = await call(h["materials/[id]/file"], { token: f.tokens.student, query: { id: r.body.id } });
    assert.ok(Buffer.from(dl.body).equals(PDF));
    const u = (await call(h["storage/index"], { token: f.tokens.admin })).body;
    assert.ok(u.courseFiles.files >= 5 && u.courseFiles.bytes > 0, JSON.stringify(u.courseFiles));
  });
});

describe("R2 storage", () => {
  const env = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "files-test" };
  const original = { list: bucket.list, remove: bucket.remove };
  const removed: string[] = [];
  before(() => {
    Object.assign(process.env, env);
    bucket.remove = async (keys) => { removed.push(...keys); };
  });
  after(() => {
    Object.assign(bucket, original);
    for (const k of Object.keys(env)) delete process.env[k];
  });
  const ask = (body: Record<string, unknown>, token = f.tokens.teacher) => call(h["materials/upload-url"], { method: "POST", token, body: { offeringId: f.offerings.c1, fileName: "Slides.pptx", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sizeBytes: 5_000_000, ...body } });

  test("upload-url signs a 5-minute PUT under the course's folder, up to 20 MB, for allowed types", async () => {
    const r = await ask({});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.mode, "r2");
    assert.match(r.body.key, new RegExp(`^materials/${f.offerings.c1}/[0-9a-f-]{36}$`));
    const url = new URL(r.body.url);
    assert.equal(url.hostname, "files-test.acct.r2.cloudflarestorage.com");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.equal((await ask({ sizeBytes: 21 * 1024 * 1024 })).status, 400);
    assert.equal((await ask({ contentType: "application/x-msdownload" })).status, 400);
    assert.equal((await ask({}, f.tokens.student)).status, 403);
    assert.equal((await ask({ offeringId: f.offerings.c2 })).status, 403, "not Tess's course");
  });
  test("registering a key from another course, or before the upload finished, is refused", async () => {
    assert.equal((await post(f.tokens.teacher, { ...base(), key: `materials/${f.offerings.c2}/x` })).status, 400);
    // No object in the (unreachable) test bucket: HEAD fails, so the upload isn't finished.
    assert.equal((await post(f.tokens.teacher, { ...base(), key: `materials/${f.offerings.c1}/00000000-0000-4000-8000-000000000000` })).status, 400);
  });
  test("a full store refuses new uploads", async () => {
    await f.pool.query("INSERT INTO storage_status (id, measured_bytes, object_count, measured_at) VALUES (1, 9000000000, 1, now()) ON CONFLICT (id) DO UPDATE SET measured_bytes = 9000000000, measured_at = now()");
    try {
      assert.equal((await ask({})).status, 507);
    } finally {
      await f.pool.query("UPDATE storage_status SET measured_bytes = 0");
    }
  });
  test("deleting an R2 material removes the object; R2 files and links download as links", async () => {
    const { rows: [m] } = await f.pool.query(`INSERT INTO materials (offering_id, uploaded_by, category, file_name, content_type, size_bytes, file_key)
      VALUES ($1, $2, 'notes', 'Big.pdf', 'application/pdf', 3000000, $3) RETURNING id`, [f.offerings.c1, f.ids.teacher, `r2:materials/${f.offerings.c1}/big`]);
    const dl = await call(h["materials/[id]/file"], { token: f.tokens.student, query: { id: m.id } });
    assert.equal(dl.body.link, false);
    assert.match(dl.body.url, /files-test\.acct\.r2\.cloudflarestorage\.com\/materials\//);
    assert.equal((await call(h["storage/index"], { token: f.tokens.admin })).body.courseFiles.bytes, 3000000, "only R2 course files count in R2 mode");
    assert.equal((await call(h["materials/[id]"], { method: "DELETE", token: f.tokens.teacher, query: { id: m.id } })).status, 204);
    assert.deepEqual(removed, [`materials/${f.offerings.c1}/big`]);
  });
});
