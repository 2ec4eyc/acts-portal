// The storage limit stops every upload: receipts, course files (also without R2) and profile photos.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
const h: Record<string, Handler> = {};
const PDF = Buffer.from("%PDF-1.4\n% test\n").toString("base64");
const photo = (kb: number) => `data:image/jpeg;base64,${Buffer.alloc(kb * 1024, 7).toString("base64")}`;

before(async () => {
  f = await setup();
  for (const name of ["me", "materials/index", "storage/index", "users/[id]"]) h[name] = await route(name);
});
after(() => f.close());

const usage = async () => (await call(h["storage/index"], { token: f.tokens.admin })).body;
const setPhoto = (photoUrl: string | null, token = f.tokens.student) => call(h["me"], { method: "PATCH", token, body: { photoUrl } });
const postMaterial = () => call(h["materials/index"], { method: "POST", token: f.tokens.teacher,
  body: { offeringId: f.offerings.c1, category: "notes", fileName: "Week 9.pdf", contentType: "application/pdf", data: PDF } });

/** Fills storage (database mode): five stored course files that look 2 GB each (10 GB > the 9 GB limit). */
async function fill() {
  const { rows } = await f.pool.query(`INSERT INTO materials (offering_id, uploaded_by, category, file_name, content_type, size_bytes)
    SELECT $1, $2, 'notes', 'Huge ' || n || '.pdf', 'application/pdf', 2000000000 FROM generate_series(1, 5) n RETURNING id`, [f.offerings.c1, f.ids.teacher]);
  return async () => { await f.pool.query("DELETE FROM materials WHERE id = ANY($1)", [rows.map((r) => r.id)]); };
}

describe("profile photos", () => {
  test("count toward storage", async () => {
    const before = (await usage()).profilePhotos.bytes;
    assert.equal((await setPhoto(photo(50))).status, 200);
    const u = await usage();
    assert.ok(u.profilePhotos.bytes - before > 50 * 1024, JSON.stringify(u.profilePhotos));
    assert.ok(u.usedBytes >= u.profilePhotos.bytes);
  });

  test("a new or larger photo is refused when storage is full; removing or keeping it isn't", async () => {
    const empty = await fill();
    try {
      const r = await setPhoto(photo(60));
      assert.equal(r.status, 507, JSON.stringify(r.body));
      assert.match(r.body.error, /Storage is full/);
      assert.equal((await setPhoto(photo(50))).status, 200, "same photo again: no new space");
      assert.equal((await setPhoto(photo(40))).status, 200, "a smaller photo frees space");
      assert.equal((await call(h["me"], { method: "PATCH", token: f.tokens.student, body: { contactNumber: "0917 000 0000" } })).status, 200,
        "other profile changes still save");
      assert.equal((await setPhoto(null)).status, 200, "removing a photo always works");
    } finally { await empty(); }
  });
});

describe("course files without R2", () => {
  test("are refused when storage is full, and allowed again once there is room", async () => {
    const empty = await fill();
    try {
      const r = await postMaterial();
      assert.equal(r.status, 507, JSON.stringify(r.body));
      assert.match(r.body.error, /Storage is full/);
    } finally { await empty(); }
    assert.equal((await postMaterial()).status, 201);
  });

  test("links take no space and are still allowed when full", async () => {
    const empty = await fill();
    try {
      const r = await call(h["materials/index"], { method: "POST", token: f.tokens.teacher,
        body: { offeringId: f.offerings.c1, category: "notes", fileName: "Recording", url: "https://youtu.be/x" } });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    } finally { await empty(); }
  });
});

describe("alerts", () => {
  test("the full alert names every kind of upload", async () => {
    await f.pool.query("DELETE FROM notifications WHERE kind = 'storage_warning'");
    await f.pool.query("UPDATE storage_status SET alert_level = 'ok'");
    assert.equal((await setPhoto(photo(50), f.tokens.student2)).status, 200);
    const empty = await fill();
    try {
      // A smaller photo still saves while full, and the check after it raises the alert.
      assert.equal((await setPhoto(photo(10), f.tokens.student2)).status, 200);
      const { rows } = await f.pool.query("SELECT title, body FROM notifications WHERE kind = 'storage_warning' AND user_id = $1", [f.ids.admin]);
      assert.equal(rows.length, 1, JSON.stringify(rows));
      assert.equal(rows[0].title, "File storage is full");
      assert.match(rows[0].body, /receipts, course files and profile photos/);
    } finally { await empty(); }
  });
});
