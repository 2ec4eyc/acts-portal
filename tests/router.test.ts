// The single API function: /api/<path> is rewritten to /api?__path=<path> and dispatched here.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { call, type Handler } from "./helpers.js";
import { matchRoute } from "../server/routes/index.js";
import users from "../server/routes/users/index.js";
import user from "../server/routes/users/[id].js";
import usersArchive from "../server/routes/users/archive.js";
import userHistory from "../server/routes/users/[id]/history.js";
import materialFile from "../server/routes/materials/[id]/file.js";

const ID = "3f1c2a9e-8b7d-4c6e-9f00-123456789abc";

after(async () => {
  const { db } = await import("../server/lib/db.js");
  await (db.$client as Pool).end();
});

describe("matchRoute", () => {
  test("maps paths to handlers and params", () => {
    assert.deepEqual(matchRoute("users"), { handler: users, params: {} });
    assert.deepEqual(matchRoute(`users/${ID}`), { handler: user, params: { id: ID } });
    assert.deepEqual(matchRoute(`users/${ID}/history`), { handler: userHistory, params: { id: ID } });
    assert.deepEqual(matchRoute(`materials/${ID}/file`), { handler: materialFile, params: { id: ID } });
  });
  test("static segments win over :id", () => {
    assert.equal(matchRoute("users/archive")?.handler, usersArchive);
  });
  test("ignores extra slashes; unknown paths don't match", () => {
    assert.equal(matchRoute("/users/")?.handler, users);
    assert.equal(matchRoute("nope"), null);
    assert.equal(matchRoute(`users/${ID}/history/extra`), null);
    assert.equal(matchRoute(""), null);
  });
});

describe("api/index.ts", () => {
  let api: Handler;
  test("dispatches by ?__path and passes route params", async () => {
    api = (await import("../api/index.js")).default as Handler;
    // GET on users/archive is a 405 from that route (not a user lookup), without touching the database.
    assert.equal((await call(api, { query: { __path: "users/archive" } })).status, 405);
    // A dynamic route runs its handler (401: no token) rather than 404.
    assert.equal((await call(api, { query: { __path: `users/${ID}` } })).status, 401);
  });
  test("the rewrite's own query parameters don't reach handlers", async () => {
    const { dispatch } = await import("../server/routes/index.js");
    const req = { method: "GET", headers: {}, query: { __path: "health", path: "health", keep: "1" } };
    const res = { status() { return this; }, json() { return this; }, setHeader() { return this; } };
    await dispatch("nope/x", req as never, res as never);
    assert.deepEqual(req.query, { __path: "health", path: "health", keep: "1" }, "404s leave the request alone");
    const req2 = { method: "DELETE", headers: {}, query: { __path: "health", path: "health", keep: "1" } };
    await dispatch("health", req2 as never, res as never);
    assert.deepEqual(req2.query, { keep: "1" });
  });
  test("unknown paths are 404", async () => {
    const r = await call(api, { query: { __path: "does/not/exist" } });
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: "Not found" });
  });
});
