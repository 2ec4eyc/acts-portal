// Chat with the school office: threads, messages, polling, unread state, notifications, archiving.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
const h: Record<string, Handler> = {};

before(async () => {
  f = await setup();
  for (const name of ["chat/conversations/index", "chat/conversations/[id]", "chat/conversations/[id]/messages",
    "chat/conversations/[id]/read", "chat/unread", "chat/archive/index", "chat/archive/messages", "chat/archive/purge",
    "settings/[key]", "audit/index"]) {
    h[name] = await route(name);
  }
});
after(() => f.close());

const mine = async (token: string) => (await call(h["chat/conversations/index"], { token })).body;
const inbox = async (query: Record<string, string> = {}) => (await call(h["chat/conversations/index"], { token: f.tokens.admin, query })).body;
const send = (token: string, id: string, body: string) =>
  call(h["chat/conversations/[id]/messages"], { method: "POST", token, query: { id }, body: { body } });
const list = async (token: string, id: string, query: Record<string, string> = {}) =>
  (await call(h["chat/conversations/[id]/messages"], { token, query: { id, ...query } })).body;
const read = (token: string, id: string) => call(h["chat/conversations/[id]/read"], { method: "POST", token, query: { id } });
const unread = async (token: string) => (await call(h["chat/unread"], { token })).body.count;
const messageAlerts = async (userId: string) =>
  (await f.pool.query("SELECT title, body FROM notifications WHERE kind = 'message' AND user_id = $1 ORDER BY id", [userId])).rows;

let sam = "", rita = "";

describe("threads and access", () => {
  test("a student's thread is created on first visit", async () => {
    const t = await mine(f.tokens.student);
    assert.match(t.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual([t.status, t.unread, t.chatEnabled], ["open", false, true]);
    assert.equal((await mine(f.tokens.student)).id, t.id, "same thread next time");
    sam = t.id;
    rita = (await mine(f.tokens.student2)).id;
  });

  test("students can't read or write someone else's thread; teachers have no inbox", async () => {
    assert.equal((await call(h["chat/conversations/[id]/messages"], { token: f.tokens.student2, query: { id: sam } })).status, 403);
    assert.equal((await send(f.tokens.student2, sam, "hi")).status, 403);
    assert.equal((await call(h["chat/conversations/index"], { token: f.tokens.teacher })).status, 403);
    assert.equal((await call(h["chat/conversations/[id]/messages"], { token: f.tokens.teacher, query: { id: sam } })).status, 403);
    assert.equal((await call(h["chat/conversations/[id]"], { method: "PATCH", token: f.tokens.student, query: { id: sam }, body: { status: "closed" } })).status, 403);
  });

  test("the office can start a thread with a student, not with staff", async () => {
    const r = await call(h["chat/conversations/index"], { method: "POST", token: f.tokens.admin, body: { studentId: f.ids.student } });
    assert.equal(r.body.id, sam);
    assert.equal((await call(h["chat/conversations/index"], { method: "POST", token: f.tokens.admin, body: { studentId: f.ids.teacher } })).status, 400);
    assert.equal((await call(h["chat/conversations/index"], { method: "POST", token: f.tokens.student, body: { studentId: f.ids.student2 } })).status, 403);
  });
});

describe("messages, polling and unread", () => {
  let firstId = 0;

  test("a burst of student messages notifies the office once", async () => {
    for (const body of ["Good morning!", "When is the enrollment deadline?", "Thank you"]) {
      const r = await send(f.tokens.student, sam, body);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      firstId ||= r.body.id;
    }
    const alerts = await messageAlerts(f.ids.admin);
    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0], { title: "Message from Sam Student", body: "Good morning!" });
    assert.equal(await unread(f.tokens.admin), 1);
    const row = (await inbox()).find((c: { id: string }) => c.id === sam);
    assert.deepEqual([row.unread, row.studentName, row.preview, row.lastSenderRole], [true, "Sam Student", "Thank you", "student"]);
    assert.deepEqual((await inbox({ unread: "true" })).map((c: { id: string }) => c.id), [sam]);
  });

  test("polling returns only newer messages; older pages load before an id", async () => {
    const all = await list(f.tokens.student, sam);
    assert.deepEqual(all.messages.map((m: { body: string }) => m.body), ["Good morning!", "When is the enrollment deadline?", "Thank you"]);
    assert.deepEqual([all.messages[0].mine, all.messages[0].fromOffice, all.more], [true, false, false]);
    const newer = await list(f.tokens.admin, sam, { after: String(firstId) });
    assert.deepEqual(newer.messages.map((m: { body: string }) => m.body), ["When is the enrollment deadline?", "Thank you"]);
    assert.equal(newer.messages[0].mine, false);
    const older = await list(f.tokens.admin, sam, { before: String(firstId + 1) });
    assert.deepEqual(older.messages.map((m: { body: string }) => m.body), ["Good morning!"]);
    assert.deepEqual((await list(f.tokens.admin, sam, { after: String(firstId + 2) })).messages, []);
  });

  test("the office reads and replies; the student is notified once", async () => {
    assert.equal((await read(f.tokens.admin, sam)).status, 204);
    assert.equal(await unread(f.tokens.admin), 0);
    assert.equal((await send(f.tokens.admin, sam, "Hi Sam, it's on the 15th.")).status, 201);
    assert.equal((await send(f.tokens.admin, sam, "Bring your form.")).status, 201);
    const alerts = await messageAlerts(f.ids.student);
    assert.deepEqual(alerts, [{ title: "New message from the school office", body: "Hi Sam, it's on the 15th." }]);
    assert.equal(await unread(f.tokens.student), 1);
    assert.equal((await mine(f.tokens.student)).unread, true);
    const last = (await list(f.tokens.student, sam)).messages.at(-1);
    assert.deepEqual([last.fromOffice, last.senderName, last.mine], [true, "Ada Admin", false]);
    await read(f.tokens.student, sam);
    assert.equal(await unread(f.tokens.student), 0);
    // A new message after reading notifies again.
    await send(f.tokens.admin, sam, "See you!");
    assert.equal((await messageAlerts(f.ids.student)).length, 2);
  });

  test("bodies are checked", async () => {
    assert.equal((await send(f.tokens.student, sam, "   ")).status, 400);
    assert.equal((await send(f.tokens.student, sam, "x".repeat(4001))).status, 400);
    assert.equal((await send(f.tokens.student, sam, "x".repeat(4000))).status, 201);
  });

  test("closing a thread or switching chat off stops students, not the office", async () => {
    assert.equal((await call(h["chat/conversations/[id]"], { method: "PATCH", token: f.tokens.admin, query: { id: rita }, body: { status: "closed" } })).body.status, "closed");
    const closed = await send(f.tokens.student2, rita, "hello?");
    assert.deepEqual([closed.status, closed.body.error], [409, "This conversation is closed"]);
    assert.equal((await send(f.tokens.admin, rita, "We'll reopen this soon.")).status, 201);
    await call(h["chat/conversations/[id]"], { method: "PATCH", token: f.tokens.admin, query: { id: rita }, body: { status: "open" } });
    assert.equal((await send(f.tokens.student2, rita, "Thanks")).status, 201);

    await call(h["settings/[key]"], { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { chat: false } });
    try {
      const off = await send(f.tokens.student, sam, "anyone?");
      assert.deepEqual([off.status, off.body.error], [403, "Chat is turned off"]);
      assert.equal((await mine(f.tokens.student)).chatEnabled, false);
      assert.equal((await list(f.tokens.student, sam)).messages.length > 0, true, "history still readable");
      assert.equal((await send(f.tokens.admin, sam, "Office still writes")).status, 201);
    } finally {
      await call(h["settings/[key]"], { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { chat: true } });
    }
  });
});

describe("archive", () => {
  const before = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

  test("only admins can see, export or purge", async () => {
    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await call(h["chat/archive/index"], { token: f.tokens[role], query: { before } })).status, 403, role);
      assert.equal((await call(h["chat/archive/messages"], { token: f.tokens[role], query: { before } })).status, 403, role);
      assert.equal((await call(h["chat/archive/purge"], { method: "POST", token: f.tokens[role], body: { before, expectedCount: 1 } })).status, 403, role);
    }
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    assert.equal((await call(h["chat/archive/index"], { token: f.tokens.admin, query: { before: future } })).status, 400);
  });

  test("old messages are counted, exported in order, and removed only if the count still matches", async () => {
    // Backdate Sam's first three messages and Rita's first message to two years ago.
    const ids = (await f.pool.query(`
      (SELECT id FROM messages WHERE conversation_id = $1 ORDER BY id LIMIT 3)
      UNION ALL (SELECT id FROM messages WHERE conversation_id = $2 ORDER BY id LIMIT 1)`, [sam, rita])).rows.map((r) => Number(r.id));
    await f.pool.query("UPDATE messages SET created_at = now() - interval '2 years' WHERE id = ANY($1)", [ids]);
    const total = Number((await f.pool.query("SELECT count(*) FROM messages")).rows[0].count);

    const s = (await call(h["chat/archive/index"], { token: f.tokens.admin, query: { before } })).body;
    assert.deepEqual([s.olderMessages, s.olderConversations, s.totalMessages], [4, 2, total]);
    assert.ok(s.olderBytes > 0 && s.totalBytes > 0 && s.oldestAt);

    const page = (await call(h["chat/archive/messages"], { token: f.tokens.admin, query: { before } })).body;
    assert.deepEqual(page.messages.map((m: { id: number }) => m.id), [...ids].sort((a, b) => a - b));
    assert.equal(page.nextAfterId, null);
    const first = page.messages[0];
    assert.deepEqual([first.studentName, first.senderName, first.fromOffice, first.body], ["Sam Student", "Sam Student", false, "Good morning!"]);
    const rest = (await call(h["chat/archive/messages"], { token: f.tokens.admin, query: { before, afterId: String(page.messages[1].id) } })).body;
    assert.equal(rest.messages.length, 2);

    const wrong = await call(h["chat/archive/purge"], { method: "POST", token: f.tokens.admin, body: { before, expectedCount: 3 } });
    assert.equal(wrong.status, 409);
    assert.match(wrong.body.error, /now 4 messages/);
    const ok = await call(h["chat/archive/purge"], { method: "POST", token: f.tokens.admin, body: { before, expectedCount: 4 } });
    assert.deepEqual([ok.status, ok.body.removed], [200, 4]);
    assert.equal(Number((await f.pool.query("SELECT count(*) FROM messages")).rows[0].count), total - 4);
    assert.equal((await list(f.tokens.student, sam)).messages[0].body, "Hi Sam, it's on the 15th.", "newer messages stay");
    assert.equal((await mine(f.tokens.student)).id, sam, "the thread itself stays");
  });

  test("archiving is recorded in the audit log with the admin", async () => {
    const r = (await f.pool.query("SELECT actor_id, entity_id, data FROM audit_log WHERE action = 'chat.archived'")).rows;
    assert.equal(r.length, 1);
    assert.equal(r[0].actor_id, f.ids.admin);
    assert.deepEqual(r[0].data, { before, messages: 4, conversations: 2 });
  });

  test("closing a thread is audited; message traffic is not", async () => {
    const rows = (await f.pool.query("SELECT op, old, new FROM audit_log WHERE table_name = 'conversations' AND entity_id = $1 ORDER BY id", [rita])).rows;
    assert.deepEqual(rows.map((r) => [r.op, r.new?.status]), [["INSERT", "open"], ["UPDATE", "closed"], ["UPDATE", "open"]]);
  });
});
