// Billing: invoices, payments, statements, receipts, reminders.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { call, route, setup, type Fixture, type Handler } from "./helpers.js";

let f: Fixture;
const h: Record<string, Handler> = {};
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
// A tiny valid PNG (1x1).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

before(async () => {
  f = await setup();
  for (const name of ["finance/invoices/index", "finance/invoices/[id]", "finance/invoices/[id]/remind", "finance/payments/index",
    "finance/payments/[id]", "finance/students/index", "finance/students/[id]/statement", "me/finance", "finance/receipts/index",
    "finance/receipts/upload-url", "finance/receipts/[id]/file", "finance/receipts/[id]/review", "cron/daily", "settings/[key]", "notifications/index", "audit/index",
    "finance/templates/index", "finance/templates/[id]"]) {
    h[name] = await route(name);
  }
});
after(() => f.close());

const statementOf = async (id: string, token = f.tokens.admin) => (await call(h["finance/students/[id]/statement"], { token, query: { id } })).body;
let invoiceId = "";

describe("invoices and payments", () => {
  test("admins bill a batch of students; each is notified", async () => {
    const r = await call(h["finance/invoices/index"], { method: "POST", token: f.tokens.admin, body: {
      studentIds: [f.ids.student, f.ids.student2], description: "Tuition, 1st semester", dueOn: days(20),
      lines: [{ description: "Tuition", amount: 5000 }, { description: "Books", amount: 750.5 }],
    } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.created, 2);
    const list = (await call(h["finance/invoices/index"], { token: f.tokens.admin, query: { studentId: f.ids.student } })).body;
    assert.equal(list.length, 1);
    assert.match(list[0].number, /^INV-\d{4}-000[12]$/);
    assert.deepEqual([list[0].amount, list[0].balance, list[0].status], [5750.5, 5750.5, "pending"]);
    invoiceId = list[0].id;
    const bell = (await call(h["notifications/index"], { token: f.tokens.student })).body;
    assert.equal(bell.items[0].kind, "invoice_issued");
    assert.match(bell.items[0].body, /₱5,750\.50/);
  });

  test("only admins handle money", async () => {
    for (const role of ["president", "teacher", "student"] as const) {
      assert.equal((await call(h["finance/invoices/index"], { method: "POST", token: f.tokens[role], body: {
        studentIds: [f.ids.student], description: "x", dueOn: days(5), lines: [{ description: "x", amount: 1 }] } })).status, 403, role);
      assert.equal((await call(h["finance/payments/index"], { method: "POST", token: f.tokens[role], body: {
        studentId: f.ids.student, amount: 1, paidOn: days(0), method: "cash" } })).status, 403, role);
    }
    assert.equal((await call(h["finance/invoices/index"], { method: "POST", token: f.tokens.admin, body: {
      studentIds: [f.ids.teacher], description: "x", dueOn: days(5), lines: [{ description: "x", amount: 1 }] } })).status, 400);
    assert.equal((await call(h["finance/invoices/index"], { method: "POST", token: f.tokens.admin, body: {
      studentIds: [f.ids.student], description: "x", dueOn: days(5), lines: [{ description: "x", amount: 1.234 }] } })).status, 400);
  });

  test("a payment is applied to the invoice and the statement keeps a running balance", async () => {
    const r = await call(h["finance/payments/index"], { method: "POST", token: f.tokens.admin, body: {
      studentId: f.ids.student, amount: 2000, paidOn: days(0), method: "cash", reference: "OR-1001" } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const s = await statementOf(f.ids.student);
    assert.deepEqual(s.totals, { charged: 5750.5, paid: 2000, balance: 3750.5, outstanding: 3750.5, credit: 0 });
    assert.equal(s.invoices[0].status, "partially_paid");
    assert.deepEqual(s.ledger.map((l: { kind: string; balance: number }) => [l.kind, l.balance]), [["charge", 5750.5], ["payment", 3750.5]]);
    assert.deepEqual(s.payments[0].appliedTo, [{ number: s.invoices[0].number, amount: 2000 }]);
  });

  test("students see only their own statement", async () => {
    const own = await call(h["me/finance"], { token: f.tokens.student });
    assert.equal(own.status, 200);
    assert.equal(own.body.totals.balance, 3750.5);
    assert.equal((await call(h["finance/students/[id]/statement"], { token: f.tokens.student, query: { id: f.ids.student } })).status, 200);
    assert.equal((await call(h["finance/students/[id]/statement"], { token: f.tokens.student2, query: { id: f.ids.student } })).status, 403);
    assert.equal((await call(h["finance/students/[id]/statement"], { token: f.tokens.teacher, query: { id: f.ids.student } })).status, 403);
    assert.equal((await call(h["finance/students/index"], { token: f.tokens.student })).status, 403);
  });

  test("past the due date it shows as overdue", async () => {
    await f.pool.query("UPDATE invoices SET due_on = current_date - 3 WHERE id = $1", [invoiceId]);
    const list = (await call(h["finance/invoices/index"], { token: f.tokens.admin, query: { status: "overdue" } })).body;
    assert.deepEqual(list.map((i: { id: string }) => i.id), [invoiceId]);
    const overview = (await call(h["finance/students/index"], { token: f.tokens.admin })).body;
    const sam = overview.find((s: { studentId: string }) => s.studentId === f.ids.student);
    assert.deepEqual([sam.outstanding, sam.overdueCount], [3750.5, 1]);
  });

  test("overpaying leaves credit; voiding a payment restores the balance", async () => {
    const r = await call(h["finance/payments/index"], { method: "POST", token: f.tokens.admin, body: {
      studentId: f.ids.student, amount: 4000, paidOn: days(0), method: "gcash" } });
    let s = await statementOf(f.ids.student);
    assert.equal(s.invoices[0].status, "paid");
    assert.equal(s.totals.credit, 249.5);
    assert.equal((await call(h["finance/payments/[id]"], { method: "PATCH", token: f.tokens.admin, query: { id: r.body.id }, body: { void: { reason: "Entered twice" } } })).status, 204);
    s = await statementOf(f.ids.student);
    assert.equal(s.invoices[0].balance, 3750.5);
    assert.equal(s.payments.find((p: { id: string }) => p.id === r.body.id).voided, true);
    assert.equal((await call(h["finance/payments/[id]"], { method: "PATCH", token: f.tokens.admin, query: { id: r.body.id }, body: { void: { reason: "again" } } })).status, 409);
  });

  test("an invoice with payments can't be voided; one without can, with a reason", async () => {
    assert.equal((await call(h["finance/invoices/[id]"], { method: "PATCH", token: f.tokens.admin, query: { id: invoiceId }, body: { void: { reason: "Wrong amount" } } })).status, 409);
    const rita = (await call(h["finance/invoices/index"], { token: f.tokens.admin, query: { studentId: f.ids.student2 } })).body[0];
    assert.equal((await call(h["finance/invoices/[id]"], { method: "PATCH", token: f.tokens.admin, query: { id: rita.id }, body: { void: {} } })).status, 400);
    const v = await call(h["finance/invoices/[id]"], { method: "PATCH", token: f.tokens.admin, query: { id: rita.id }, body: { void: { reason: "Scholarship" } } });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.equal(v.body.status, "void");
    assert.equal((await statementOf(f.ids.student2)).totals.balance, 0);
  });
});

describe("receipts", () => {
  let receiptId = "";
  const submit = (token: string, body: Record<string, unknown>) => call(h["finance/receipts/index"], { method: "POST", token, body });
  const base = () => ({ contentType: "image/png", sizeBytes: PNG.length, sha256: sha(PNG), data: PNG.toString("base64"),
    amountClaimed: 1000, paidOn: days(0), method: "bank_transfer", reference: "BDO-778899", invoiceId });

  test("without R2 the file goes through the API and is stored in the database", async () => {
    const r = await call(h["finance/receipts/upload-url"], { method: "POST", token: f.tokens.student, body: { contentType: "image/png", sizeBytes: PNG.length, sha256: sha(PNG) } });
    assert.deepEqual(r.body, { mode: "db" });
    const s = await submit(f.tokens.student, base());
    assert.equal(s.status, 201, JSON.stringify(s.body));
    receiptId = s.body.id;
    const admin = (await call(h["notifications/index"], { token: f.tokens.admin })).body;
    assert.equal(admin.items[0].kind, "receipt_submitted");
    assert.match(admin.items[0].body, /Sam Student uploaded a receipt for ₱1,000\.00/);
  });

  test("duplicates, fake files, other people's invoices and staff uploads are refused", async () => {
    assert.equal((await submit(f.tokens.student, base())).status, 409);
    const fake = Buffer.from("not really a png");
    assert.equal((await submit(f.tokens.student, { ...base(), data: fake.toString("base64"), sizeBytes: fake.length, sha256: sha(fake) })).status, 400);
    assert.equal((await submit(f.tokens.student2, { ...base(), sha256: "0".repeat(64) })).status, 400, "invoice isn't Rita's");
    assert.equal((await submit(f.tokens.admin, base())).status, 403);
    const big = { ...base(), sizeBytes: 3 * 1024 * 1024 };
    assert.equal((await submit(f.tokens.student, big)).status, 400);
  });

  test("the file is visible to its student and finance staff only", async () => {
    const own = await call(h["finance/receipts/[id]/file"], { token: f.tokens.student, query: { id: receiptId } });
    assert.equal(own.status, 200);
    assert.ok(Buffer.from(own.body).equals(PNG));
    assert.equal(own.headers["content-type"], "image/png");
    assert.equal((await call(h["finance/receipts/[id]/file"], { token: f.tokens.admin, query: { id: receiptId } })).status, 200);
    assert.equal((await call(h["finance/receipts/[id]/file"], { token: f.tokens.student2, query: { id: receiptId } })).status, 403);
    assert.equal((await call(h["finance/receipts/[id]/file"], { token: f.tokens.teacher, query: { id: receiptId } })).status, 403);
  });

  test("approving records the payment and tells the student", async () => {
    const pending = (await call(h["finance/receipts/index"], { token: f.tokens.admin, query: { status: "pending" } })).body;
    assert.equal(pending.length, 1);
    const r = await call(h["finance/receipts/[id]/review"], { method: "POST", token: f.tokens.admin, query: { id: receiptId }, body: { decision: "approve" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s = await statementOf(f.ids.student);
    assert.equal(s.invoices[0].balance, 2750.5);
    assert.equal(s.payments.find((p: { id: string }) => p.id === r.body.paymentId).receiptUploadId, receiptId);
    assert.equal(s.receipts[0].status, "approved");
    assert.equal(s.receipts[0].reviewedBy, "Ada Admin");
    const bell = (await call(h["notifications/index"], { token: f.tokens.student })).body;
    assert.equal(bell.items[0].title, "Payment confirmed");
    assert.equal((await call(h["finance/receipts/[id]/review"], { method: "POST", token: f.tokens.admin, query: { id: receiptId }, body: { decision: "approve" } })).status, 409);
  });

  test("rejecting needs a reason, and the student can upload again", async () => {
    const other = Buffer.concat([PNG, Buffer.from([0])]);
    const s = await submit(f.tokens.student, { ...base(), data: other.toString("base64"), sizeBytes: other.length, sha256: sha(other), amountClaimed: 500 });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call(h["finance/receipts/[id]/review"], { method: "POST", token: f.tokens.admin, query: { id: s.body.id }, body: { decision: "reject" } })).status, 400);
    const r = await call(h["finance/receipts/[id]/review"], { method: "POST", token: f.tokens.admin, query: { id: s.body.id }, body: { decision: "reject", note: "Amount is unreadable" } });
    assert.equal(r.status, 200);
    const bell = (await call(h["notifications/index"], { token: f.tokens.student })).body;
    assert.match(bell.items[0].body, /wasn't accepted: Amount is unreadable/);
    assert.equal((await call(h["finance/receipts/[id]/review"], { method: "POST", token: f.tokens.teacher, query: { id: s.body.id }, body: { decision: "approve" } })).status, 403);
  });

  test("switched off: no uploads", async () => {
    await call(h["settings/[key]"], { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { receiptUploads: false } });
    assert.equal((await call(h["finance/receipts/upload-url"], { method: "POST", token: f.tokens.student, body: { contentType: "image/png", sizeBytes: 10, sha256: "1".repeat(64) } })).status, 403);
    await call(h["settings/[key]"], { method: "PATCH", token: f.tokens.admin, query: { key: "features" }, body: { receiptUploads: true } });
  });

  test("with R2 configured, uploads get a short-lived signed link for the student's own folder", async () => {
    Object.assign(process.env, { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "receipts-test" });
    try {
      const r = await call(h["finance/receipts/upload-url"], { method: "POST", token: f.tokens.student, body: { contentType: "image/jpeg", sizeBytes: 1234, sha256: "2".repeat(64) } });
      assert.equal(r.body.mode, "r2");
      assert.match(r.body.key, new RegExp(`^receipts/${f.ids.student}/[0-9a-f-]{36}$`));
      const url = new URL(r.body.url);
      assert.equal(url.hostname, "receipts-test.acct.r2.cloudflarestorage.com");
      assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
      assert.ok(url.searchParams.get("X-Amz-Signature"));
      assert.match(url.searchParams.get("X-Amz-SignedHeaders") ?? "", /content-length/);
      // Someone else's key is refused before any network call.
      assert.equal((await submit(f.tokens.student, { ...base(), data: undefined, key: `receipts/${f.ids.student2}/x` })).status, 400);
    } finally {
      for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) delete process.env[k];
    }
  });
});

describe("reminders", () => {
  test("manual reminder: once a day, only when something is owed", async () => {
    const r = await call(h["finance/invoices/[id]/remind"], { method: "POST", token: f.tokens.admin, query: { id: invoiceId } });
    assert.equal(r.status, 204, JSON.stringify(r.body));
    const bell = (await call(h["notifications/index"], { token: f.tokens.student })).body;
    assert.equal(bell.items[0].title.startsWith("Payment overdue"), true);
    assert.equal((await call(h["finance/invoices/[id]/remind"], { method: "POST", token: f.tokens.admin, query: { id: invoiceId } })).status, 409);
  });

  test("the daily job needs its secret, sends due-soon and overdue reminders, and is safe to repeat", async () => {
    assert.equal((await call(h["cron/daily"], {})).status, 401);
    process.env.CRON_SECRET = "test-secret";
    try {
      assert.equal((await call(h["cron/daily"], { headers: { authorization: "Bearer wrong" } })).status, 401);
      await call(h["finance/invoices/index"], { method: "POST", token: f.tokens.admin, body: {
        studentIds: [f.ids.student2], description: "Retreat fee", dueOn: days(2), lines: [{ description: "Retreat", amount: 300 }] } });
      const first = await call(h["cron/daily"], { headers: { authorization: "Bearer test-secret" } });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.deepEqual(first.body.reminders, { dueSoon: 1, overdue: 1 });
      const again = await call(h["cron/daily"], { headers: { authorization: "Bearer test-secret" } });
      assert.deepEqual(again.body.reminders, { dueSoon: 0, overdue: 0 });
      const rita = (await call(h["notifications/index"], { token: f.tokens.student2 })).body;
      assert.equal(rita.items[0].title.startsWith("Payment reminder"), true);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  test("every money change is in the audit log with the admin", async () => {
    const rows = (await f.pool.query(
      "SELECT DISTINCT table_name FROM audit_log WHERE actor_id = $1 AND table_name IN ('invoices','invoice_lines','payments','payment_allocations','receipt_uploads')",
      [f.ids.admin])).rows.map((r) => r.table_name).sort();
    assert.deepEqual(rows, ["invoice_lines", "invoices", "payment_allocations", "payments", "receipt_uploads"]);
  });

  test("the audit log names money entries readably", async () => {
    const subjects = async (table: string) =>
      (await call(h["audit/index"], { token: f.tokens.admin, query: { table } })).body.entries.map((e: { subject: string }) => e.subject);
    assert.ok((await subjects("invoices")).some((s: string) => /^INV-\d{4}-\d{4} · Sam Student$/.test(s)));
    assert.ok((await subjects("payments")).some((s: string) => /^Sam Student · ₱2,000\.00$/.test(s)));
    assert.ok((await subjects("receipt_uploads")).some((s: string) => /^Sam Student · ₱1,000\.00$/.test(s)));
  });
});

describe("billing templates", () => {
  const tpl = (body: Record<string, unknown>, token = f.tokens.admin) => call(h["finance/templates/index"], { method: "POST", token, body });
  const edit = (id: string, body: Record<string, unknown>) => call(h["finance/templates/[id]"], { method: "PATCH", token: f.tokens.admin, query: { id }, body });
  const list = async () => (await call(h["finance/templates/index"], { token: f.tokens.admin })).body;
  const sem1 = { name: "Tuition – 1st Semester", description: "Tuition, 1st semester", lines: [
    { description: "Tuition", amount: 5000 }, { description: "Miscellaneous", amount: 1200.25 }, { description: "Library", amount: 300 }] };
  let id = "";

  test("admins create, list (by name), edit and delete templates", async () => {
    const r = await tpl(sem1);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.total, 6500.25);
    id = r.body.id;
    assert.equal((await tpl({ ...sem1, name: "Enrollment fee", lines: [{ description: "Enrollment", amount: 500 }] })).status, 201);
    assert.deepEqual((await list()).map((t: { name: string }) => t.name), ["Enrollment fee", "Tuition – 1st Semester"]);
    const e = await edit(id, { ...sem1, lines: [{ description: "Tuition", amount: 5500 }] });
    assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.deepEqual([e.body.total, e.body.lines.length], [5500, 1]);
  });

  test("only admins can use templates", async () => {
    for (const role of ["president", "vice president", "teacher", "student"] as const) {
      const token = (f.tokens as Record<string, string>)[role];
      if (!token) continue;
      assert.equal((await call(h["finance/templates/index"], { token })).status, 403, role);
      assert.equal((await tpl({ ...sem1, name: `x ${role}` }, token)).status, 403, role);
    }
  });

  test("templates are validated, and names are unique in any case", async () => {
    const line = { description: "A", amount: 1 };
    for (const [why, body] of [
      ["no lines", { ...sem1, name: "a", lines: [] }],
      ["too many lines", { ...sem1, name: "b", lines: Array.from({ length: 21 }, () => line) }],
      ["zero", { ...sem1, name: "c", lines: [{ description: "A", amount: 0 }] }],
      ["negative", { ...sem1, name: "d", lines: [{ description: "A", amount: -5 }] }],
      ["3 decimals", { ...sem1, name: "e", lines: [{ description: "A", amount: 1.005 }] }],
      ["empty name", { ...sem1, name: "  " }],
    ] as const) assert.equal((await tpl(body as Record<string, unknown>)).status, 400, why);
    assert.equal((await tpl({ ...sem1, name: "tuition – 1st semester" })).status, 409);
    const other = (await list()).find((t: { name: string }) => t.name === "Enrollment fee");
    assert.equal((await edit(other.id, { ...sem1, name: "TUITION – 1st Semester" })).status, 409);
    assert.equal((await edit("00000000-0000-4000-8000-000000000000", { ...sem1, name: "zzz" })).status, 404);
  });

  test("invoices billed from a template keep their lines when it changes or is deleted", async () => {
    const t = (await list()).find((x: { id: string }) => x.id === id);
    const r = await call(h["finance/invoices/index"], { method: "POST", token: f.tokens.admin,
      body: { studentIds: [f.ids.student2], description: t.description, dueOn: days(30), lines: t.lines } });
    assert.equal(r.status, 201);
    const lines = async () => (await f.pool.query("SELECT description, amount::float AS amount FROM invoice_lines WHERE invoice_id = $1 ORDER BY id", [r.body.ids[0]])).rows;
    const before = await lines();
    assert.deepEqual(before, [{ description: "Tuition", amount: 5500 }]);
    await edit(id, { ...sem1, lines: [{ description: "Tuition", amount: 9999 }] });
    assert.equal((await call(h["finance/templates/[id]"], { method: "DELETE", token: f.tokens.admin, query: { id } })).status, 204);
    assert.deepEqual(await lines(), before);
    assert.equal((await call(h["finance/templates/[id]"], { method: "DELETE", token: f.tokens.admin, query: { id } })).status, 404);
  });

  test("template changes are in the audit log by name", async () => {
    const entries = (await call(h["audit/index"], { token: f.tokens.admin, query: { table: "billing_templates" } })).body.entries as { subject: string; op: string }[];
    const mine = entries.filter((e) => e.subject === "Tuition – 1st Semester").map((e) => e.op).sort();
    assert.deepEqual([...new Set(mine)], ["DELETE", "INSERT", "UPDATE"]);
  });
});
