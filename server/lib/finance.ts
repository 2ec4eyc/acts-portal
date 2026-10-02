import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { can, type User } from "./auth.js";
import { HttpError } from "./http.js";
import { notify, type NewNotification } from "./notifications.js";
import { assertRoom, checkAlerts } from "./receipt-storage.js";
import { getSetting } from "./settings.js";
import { SCHOOL_NAME } from "./transcripts.js";
import { MAX_RECEIPT_BYTES, RECEIPT_TYPES, r2DownloadUrl, r2ObjectSize, r2UploadUrl, storageMode } from "./storage.js";
import {
  billingTemplates, invoiceLines, invoices, paymentAllocations, paymentMethod, paymentReminders, payments, receiptFiles, receiptUploads,
  studentRecords, users,
} from "../db/schema.js";

// ---------- helpers ----------
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const formatPeso = (n: number) => peso.format(n);
const amount = z.number().positive().max(10_000_000).multipleOf(0.01);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const toMoney = (n: number) => n.toFixed(2);
const num = (v: unknown) => Number(v ?? 0);
const manilaToday = sql`(now() AT TIME ZONE 'Asia/Manila')::date`;

async function admins(db: DbOrTx) {
  return (await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")))).map((u) => u.id);
}

async function assertStudents(db: DbOrTx, ids: string[]) {
  const found = await db.select({ id: users.id }).from(users)
    .where(and(inArray(users.id, ids), eq(users.role, "student")));
  if (found.length !== ids.length) throw new HttpError(400, "studentIds: every id must be a student account");
}

/** Students see only their own money; finance:read sees anyone's. */
export function assertCanSeeStudent(user: User, studentId: string) {
  if (user.id !== studentId && !can(user, "finance:read")) throw new HttpError(403, "Forbidden");
}

// ---------- balances (views from migration 0007) ----------
type BalanceRow = {
  invoice_id: string; number: string; student_id: string; description: string; issued_on: string; due_on: string;
  state: "issued" | "void"; created_at: string; amount: string; paid: string; balance: string;
  payment_status: "paid" | "partially_paid" | "pending" | "overdue" | "void";
};
const shapeInvoice = (r: BalanceRow & { first_name?: string; last_name?: string; student_no?: string | null }) => ({
  id: r.invoice_id, number: r.number, studentId: r.student_id, description: r.description,
  issuedOn: r.issued_on, dueOn: r.due_on, state: r.state, createdAt: r.created_at,
  amount: num(r.amount), paid: num(r.paid), balance: num(r.balance), status: r.payment_status,
  ...(r.first_name !== undefined && { studentName: `${r.first_name} ${r.last_name}`, studentNo: r.student_no ?? null }),
});

export const InvoiceFilter = z.object({
  studentId: z.uuid().optional(),
  status: z.enum(["paid", "partially_paid", "pending", "overdue", "void", "open"]).optional(),
});
export async function listInvoices(db: DbOrTx, f: z.infer<typeof InvoiceFilter>) {
  const rows = (await db.execute(sql`
    SELECT b.*, u.first_name, u.last_name, sr.student_no
    FROM invoice_balances b JOIN users u ON u.id = b.student_id LEFT JOIN student_records sr ON sr.user_id = b.student_id
    WHERE (${f.studentId ?? null}::uuid IS NULL OR b.student_id = ${f.studentId ?? null}::uuid)
      AND (${f.status ?? null}::text IS NULL
           OR (${f.status ?? null} = 'open' AND b.payment_status IN ('pending', 'partially_paid', 'overdue'))
           OR b.payment_status = ${f.status ?? null})
    ORDER BY b.due_on DESC, b.number DESC
    LIMIT 500`)).rows as (BalanceRow & { first_name: string; last_name: string; student_no: string | null })[];
  return rows.map(shapeInvoice);
}

/** Every student with their totals (admins' overview). */
export async function studentBalances(db: DbOrTx) {
  const rows = (await db.execute(sql`
    SELECT u.id, u.first_name, u.last_name, u.status, sr.student_no, c.name AS cohort,
           coalesce(sum(b.amount) FILTER (WHERE b.state = 'issued'), 0) AS charged,
           coalesce(p.paid, 0) AS paid,
           coalesce(sum(b.balance) FILTER (WHERE b.payment_status IN ('pending', 'partially_paid', 'overdue')), 0) AS outstanding,
           count(*) FILTER (WHERE b.payment_status = 'overdue') AS overdue_count,
           coalesce(r.pending, 0) AS pending_receipts
    FROM users u
    LEFT JOIN student_records sr ON sr.user_id = u.id
    LEFT JOIN cohorts c ON c.id = sr.cohort_id
    LEFT JOIN invoice_balances b ON b.student_id = u.id
    LEFT JOIN (SELECT student_id, sum(amount) AS paid FROM payments WHERE voided_at IS NULL GROUP BY student_id) p ON p.student_id = u.id
    LEFT JOIN (SELECT student_id, count(*) AS pending FROM receipt_uploads WHERE status = 'pending' GROUP BY student_id) r ON r.student_id = u.id
    WHERE u.role = 'student'
    GROUP BY u.id, sr.student_no, c.name, p.paid, r.pending
    ORDER BY u.last_name, u.first_name`)).rows as Record<string, unknown>[];
  return rows.map((r) => ({
    studentId: r.id as string, studentName: `${r.first_name} ${r.last_name}`, studentNo: (r.student_no as string) ?? null,
    cohort: (r.cohort as string) ?? null, archived: r.status === "archived",
    charged: num(r.charged), paid: num(r.paid), outstanding: num(r.outstanding),
    overdueCount: num(r.overdue_count), pendingReceipts: num(r.pending_receipts),
  }));
}

// ---------- invoices ----------
export const InvoiceInput = z.strictObject({
  studentIds: z.array(z.uuid()).min(1).max(500),
  description: z.string().trim().min(1).max(200),
  dueOn: isoDate,
  lines: z.array(z.strictObject({ description: z.string().trim().min(1).max(200), amount })).min(1).max(20),
});

/** One invoice per student (batch billing), each with the same lines. Students are notified. */
export async function createInvoices(db: DbOrTx, user: User, input: z.infer<typeof InvoiceInput>) {
  const ids = [...new Set(input.studentIds)];
  await assertStudents(db, ids);
  const total = input.lines.reduce((n, l) => n + l.amount, 0);
  const created: string[] = [];
  const notes: NewNotification[] = [];
  for (const studentId of ids) {
    const [{ number }] = (await db.execute(sql`
      SELECT 'INV-' || to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0') AS number`)).rows as { number: string }[];
    const [inv] = await db.insert(invoices).values({
      number, studentId, description: input.description, dueOn: input.dueOn, createdBy: user.id,
      issuedOn: sql`(now() AT TIME ZONE 'Asia/Manila')::date` as unknown as string,
    }).returning({ id: invoices.id });
    await db.insert(invoiceLines).values(input.lines.map((l) => ({ invoiceId: inv.id, description: l.description, amount: toMoney(l.amount) })));
    created.push(inv.id);
    notes.push({
      userId: studentId, kind: "invoice_issued", link: "billing", title: `New invoice ${number}`,
      body: `${input.description}: ${formatPeso(total)}, due ${input.dueOn}.`, data: { invoiceId: inv.id },
    });
  }
  await notify(db, notes);
  return created;
}

// ---------- billing templates ----------
const chargeLines = z.array(z.strictObject({ description: z.string().trim().min(1).max(200), amount })).min(1).max(20);
export const TemplateInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(200),
  lines: chargeLines,
});
type TemplateRow = typeof billingTemplates.$inferSelect;
const shapeTemplate = (t: TemplateRow) => ({
  id: t.id, name: t.name, description: t.description, lines: t.lines,
  total: round(t.lines.reduce((n, l) => n + l.amount, 0)), updatedAt: t.updatedAt,
});
const duplicateName = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

export async function listTemplates(db: DbOrTx) {
  const rows = await db.select().from(billingTemplates).orderBy(sql`lower(${billingTemplates.name})`);
  return rows.map(shapeTemplate);
}

async function nameTaken(db: DbOrTx, name: string, exceptId?: string) {
  const [row] = (await db.execute(sql`
    SELECT 1 FROM billing_templates WHERE lower(name) = lower(${name}) ${exceptId ? sql`AND id <> ${exceptId}` : sql``} LIMIT 1`)).rows;
  if (row) throw new HttpError(409, "A template with this name already exists");
}

export async function createTemplate(db: DbOrTx, user: User, input: z.infer<typeof TemplateInput>) {
  await nameTaken(db, input.name);
  try {
    const [t] = await db.insert(billingTemplates).values({ ...input, createdBy: user.id }).returning();
    return shapeTemplate(t);
  } catch (e) {
    if (duplicateName(e)) throw new HttpError(409, "A template with this name already exists");
    throw e;
  }
}

export async function updateTemplate(db: DbOrTx, id: string, input: z.infer<typeof TemplateInput>) {
  await nameTaken(db, input.name, id);
  const [t] = await db.update(billingTemplates).set({ ...input, updatedAt: new Date() })
    .where(eq(billingTemplates.id, id)).returning();
  if (!t) throw new HttpError(404, "Template not found");
  return shapeTemplate(t);
}

/** Invoices copy their lines, so deleting a template changes no invoice. */
export async function deleteTemplate(db: DbOrTx, id: string) {
  const [t] = await db.delete(billingTemplates).where(eq(billingTemplates.id, id)).returning({ id: billingTemplates.id });
  if (!t) throw new HttpError(404, "Template not found");
}

export async function getInvoice(db: DbOrTx, id: string) {
  const [row] = (await db.execute(sql`SELECT * FROM invoice_balances WHERE invoice_id = ${id}`)).rows as BalanceRow[];
  if (!row) throw new HttpError(404, "Invoice not found");
  const lines = await db.select({ description: invoiceLines.description, amount: invoiceLines.amount })
    .from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.id));
  return { ...shapeInvoice(row), lines: lines.map((l) => ({ ...l, amount: num(l.amount) })) };
}

export const VoidInput = z.strictObject({ void: z.strictObject({ reason: z.string().trim().min(3).max(500) }) });

/** Cancels an invoice. Refused while payments are applied to it (void or move those first). */
export async function voidInvoice(db: DbOrTx, user: User, id: string, reason: string) {
  const inv = await getInvoice(db, id);
  if (inv.state === "void") throw new HttpError(409, "Already void");
  if (inv.paid > 0) throw new HttpError(409, "Payments are applied to this invoice; void those payments first");
  await db.update(invoices).set({ state: "void", voidReason: reason, voidedBy: user.id, voidedAt: new Date() }).where(eq(invoices.id, id));
  return getInvoice(db, id);
}

/** Sends the student a reminder now (once per invoice per day). */
export async function remindInvoice(db: DbOrTx, user: User, id: string) {
  const inv = await getInvoice(db, id);
  if (inv.state === "void" || inv.balance <= 0) throw new HttpError(409, "Nothing is owed on this invoice");
  const sent = await db.insert(paymentReminders).values({ invoiceId: id, kind: "manual", sentBy: user.id, sentOn: sql`${manilaToday}` as unknown as string })
    .onConflictDoNothing().returning();
  if (!sent.length) throw new HttpError(409, "A reminder was already sent today");
  await notify(db, [reminderFor(inv)]);
}

function reminderFor(inv: { id: string; studentId: string; number: string; balance: number; dueOn: string; status: string }): NewNotification {
  const overdue = inv.status === "overdue";
  return {
    userId: inv.studentId, kind: "payment_reminder", link: "billing", data: { invoiceId: inv.id },
    title: overdue ? `Payment overdue: ${inv.number}` : `Payment reminder: ${inv.number}`,
    body: overdue
      ? `${formatPeso(inv.balance)} was due on ${inv.dueOn}. Please settle it or upload your receipt if you've already paid.`
      : `${formatPeso(inv.balance)} is due on ${inv.dueOn}.`,
  };
}

// ---------- payments ----------
export const PaymentInput = z.strictObject({
  studentId: z.uuid(),
  amount,
  paidOn: isoDate,
  method: z.enum(paymentMethod.enumValues),
  reference: z.string().trim().max(100).nullish(),
  /** Apply to this invoice first; the rest goes to the oldest open invoices. */
  invoiceId: z.uuid().nullish(),
});

/** Records a payment and applies it to open invoices, oldest due first; anything left stays as credit. */
export async function recordPayment(db: DbOrTx, user: User, input: z.infer<typeof PaymentInput>, receiptUploadId: string | null = null) {
  await assertStudents(db, [input.studentId]);
  const [p] = await db.insert(payments).values({
    studentId: input.studentId, amount: toMoney(input.amount), paidOn: input.paidOn, method: input.method,
    reference: input.reference ?? null, receiptUploadId, recordedBy: user.id,
  }).returning({ id: payments.id });
  const open = (await db.execute(sql`
    SELECT invoice_id, balance FROM invoice_balances
    WHERE student_id = ${input.studentId} AND state = 'issued' AND balance > 0
    ORDER BY (invoice_id = ${input.invoiceId ?? null}::uuid) DESC NULLS LAST, due_on, created_at`)).rows as { invoice_id: string; balance: string }[];
  let left = Math.round(input.amount * 100);
  const allocations: { paymentId: string; invoiceId: string; amount: string }[] = [];
  for (const inv of open) {
    if (left <= 0) break;
    const take = Math.min(left, Math.round(num(inv.balance) * 100));
    allocations.push({ paymentId: p.id, invoiceId: inv.invoice_id, amount: (take / 100).toFixed(2) });
    left -= take;
  }
  if (allocations.length) await db.insert(paymentAllocations).values(allocations);
  return p.id;
}

const STATEMENT_HINT = "Download your updated statement of account from Billing.";
const METHOD_NAMES: Record<z.infer<typeof PaymentInput>["method"], string> = {
  cash: "cash", bank_transfer: "bank transfer", gcash: "GCash", maya: "Maya", other: "other",
};

/** A payment taken at the office: records it and tells the student, who can download their statement. */
export async function recordOfficePayment(db: DbOrTx, user: User, input: z.infer<typeof PaymentInput>) {
  const id = await recordPayment(db, user, input);
  await notify(db, [{
    userId: input.studentId, kind: "payment_recorded", link: "billing", data: { paymentId: id },
    title: "Payment recorded",
    body: `Your payment of ${formatPeso(input.amount)} on ${input.paidOn} (${METHOD_NAMES[input.method]}) was recorded. ${STATEMENT_HINT}`,
  }]);
  return id;
}

/** Cancels a recorded payment; its amounts come off the invoices it paid (the views ignore void payments). */
export async function voidPayment(db: DbOrTx, user: User, id: string, reason: string) {
  const updated = await db.update(payments).set({ voidReason: reason, voidedBy: user.id, voidedAt: new Date() })
    .where(and(eq(payments.id, id), isNull(payments.voidedAt))).returning({ id: payments.id });
  if (!updated.length) {
    const [exists] = await db.select({ id: payments.id }).from(payments).where(eq(payments.id, id));
    throw new HttpError(exists ? 409 : 404, exists ? "Already void" : "Payment not found");
  }
}

async function listPayments(db: DbOrTx, studentId: string) {
  const rows = await db.select().from(payments).where(eq(payments.studentId, studentId)).orderBy(desc(payments.paidOn), desc(payments.createdAt));
  const allocs = rows.length
    ? await db.select({ paymentId: paymentAllocations.paymentId, number: invoices.number, amount: paymentAllocations.amount })
      .from(paymentAllocations).innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
      .where(inArray(paymentAllocations.paymentId, rows.map((r) => r.id)))
    : [];
  return rows.map((p) => ({
    id: p.id, amount: num(p.amount), paidOn: p.paidOn, method: p.method, reference: p.reference,
    receiptUploadId: p.receiptUploadId, voided: Boolean(p.voidedAt), voidReason: p.voidReason, createdAt: p.createdAt,
    appliedTo: allocs.filter((a) => a.paymentId === p.id).map((a) => ({ number: a.number, amount: num(a.amount) })),
  }));
}

// ---------- statement ----------
export async function statement(db: DbOrTx, studentId: string) {
  const [student] = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, studentNo: studentRecords.studentNo })
    .from(users).leftJoin(studentRecords, eq(studentRecords.userId, users.id)).where(eq(users.id, studentId));
  if (!student || student.role !== "student") throw new HttpError(404, "Student not found");
  const invoiceRows = await listInvoices(db, { studentId });
  const lineRows = invoiceRows.length
    ? await db.select({ invoiceId: invoiceLines.invoiceId, description: invoiceLines.description, amount: invoiceLines.amount })
      .from(invoiceLines).where(inArray(invoiceLines.invoiceId, invoiceRows.map((i) => i.id))).orderBy(asc(invoiceLines.id))
    : [];
  const paymentRows = await listPayments(db, studentId);
  const ledger = ((await db.execute(sql`
    SELECT entry_date, kind, ref_id, description, debit, credit, running_balance
    FROM student_ledger WHERE student_id = ${studentId} ORDER BY entry_date, created_at, ref_id`)).rows as Record<string, unknown>[])
    .map((r) => ({ date: r.entry_date as string, kind: r.kind as "charge" | "payment", refId: r.ref_id as string,
      description: r.description as string, debit: num(r.debit), credit: num(r.credit), balance: num(r.running_balance) }));
  const charged = invoiceRows.filter((i) => i.state === "issued").reduce((n, i) => n + i.amount, 0);
  const paid = paymentRows.filter((p) => !p.voided).reduce((n, p) => n + p.amount, 0);
  const outstanding = invoiceRows.filter((i) => ["pending", "partially_paid", "overdue"].includes(i.status)).reduce((n, i) => n + i.balance, 0);
  return {
    school: SCHOOL_NAME,
    generatedAt: new Date().toISOString(),
    student: { id: student.id, name: `${student.firstName} ${student.lastName}`, studentNo: student.studentNo ?? null },
    totals: { charged: round(charged), paid: round(paid), balance: round(charged - paid), outstanding: round(outstanding),
      credit: round(Math.max(0, paid - charged)) },
    invoices: invoiceRows.map((i) => ({
      ...i, lines: lineRows.filter((l) => l.invoiceId === i.id).map((l) => ({ description: l.description, amount: num(l.amount) })),
    })),
    payments: paymentRows,
    receipts: await listReceipts(db, { studentId }),
    ledger,
  };
}
const round = (n: number) => Math.round(n * 100) / 100;

// ---------- receipts ----------
export const UploadRequest = z.strictObject({
  contentType: z.enum(RECEIPT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_RECEIPT_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

async function assertReceiptsOpen(db: DbOrTx) {
  if (!(await getSetting(db, "features")).receiptUploads) throw new HttpError(403, "Receipt uploads are turned off");
}
async function assertNotDuplicate(db: DbOrTx, studentId: string, sha256: string) {
  const [dupe] = await db.select({ id: receiptUploads.id }).from(receiptUploads)
    .where(and(eq(receiptUploads.studentId, studentId), eq(receiptUploads.sha256, sha256)));
  if (dupe) throw new HttpError(409, "This file was already uploaded");
}

/** Step 1 of an upload: where to send the file. */
export async function requestUpload(db: DbOrTx, user: User, input: z.infer<typeof UploadRequest>) {
  if (user.role !== "student") throw new HttpError(403, "Only students upload receipts");
  await assertReceiptsOpen(db);
  await assertNotDuplicate(db, user.id, input.sha256);
  await assertRoom(db, input.sizeBytes);
  if (storageMode() === "db") return { mode: "db" as const };
  const key = `receipts/${user.id}/${randomUUID()}`;
  return { mode: "r2" as const, key, url: await r2UploadUrl(key, input.contentType, input.sizeBytes) };
}

export const ReceiptInput = z.strictObject({
  contentType: z.enum(RECEIPT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_RECEIPT_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** R2 mode: the key from step 1, after the browser uploaded the file. */
  key: z.string().max(200).optional(),
  /** Database mode: the file itself, base64. */
  data: z.string().max(Math.ceil(MAX_RECEIPT_BYTES / 3) * 4 + 8).optional(),
  amountClaimed: amount,
  paidOn: isoDate,
  method: z.enum(paymentMethod.enumValues),
  reference: z.string().trim().max(100).nullish(),
  invoiceId: z.uuid().nullish(),
});

// File signatures, so a renamed file can't pass as a receipt.
function looksLike(contentType: string, b: Buffer) {
  if (contentType === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8;
  if (contentType === "image/png") return b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (contentType === "image/webp") return b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  return b.subarray(0, 5).toString() === "%PDF-";
}

/** Step 2: records the receipt for review and tells the admins. */
export async function submitReceipt(db: DbOrTx, user: User, input: z.infer<typeof ReceiptInput>) {
  if (user.role !== "student") throw new HttpError(403, "Only students upload receipts");
  await assertReceiptsOpen(db);
  if (input.invoiceId) {
    const [inv] = await db.select({ studentId: invoices.studentId }).from(invoices).where(eq(invoices.id, input.invoiceId));
    if (inv?.studentId !== user.id) throw new HttpError(400, "invoiceId: not one of your invoices");
  }
  const id = randomUUID();
  let fileKey: string;
  let content: Buffer | null = null;
  let sha256 = input.sha256;
  if (storageMode() === "db") {
    if (!input.data) throw new HttpError(400, "data: the file is required");
    content = Buffer.from(input.data, "base64");
    if (content.length !== input.sizeBytes || content.length > MAX_RECEIPT_BYTES) throw new HttpError(400, "data: size doesn't match");
    if (!looksLike(input.contentType, content)) throw new HttpError(400, "data: the file isn't a valid JPEG, PNG, WebP or PDF");
    sha256 = createHash("sha256").update(content).digest("hex");
    fileKey = `db:${id}`;
  } else {
    if (!input.key?.startsWith(`receipts/${user.id}/`)) throw new HttpError(400, "key: not an upload of yours");
    const size = await r2ObjectSize(input.key);
    if (size === null) throw new HttpError(400, "key: the upload didn't finish; please try again");
    if (size !== input.sizeBytes) throw new HttpError(400, "key: uploaded file size doesn't match");
    fileKey = `r2:${input.key}`;
  }
  await assertNotDuplicate(db, user.id, sha256);
  await assertRoom(db, input.sizeBytes);
  await db.insert(receiptUploads).values({
    id, studentId: user.id, invoiceId: input.invoiceId ?? null, amountClaimed: toMoney(input.amountClaimed),
    paidOn: input.paidOn, method: input.method, reference: input.reference ?? null,
    fileKey, contentType: input.contentType, sizeBytes: input.sizeBytes, sha256,
  });
  if (content) await db.insert(receiptFiles).values({ receiptId: id, content });
  await checkAlerts(db);
  await notify(db, (await admins(db)).map((userId) => ({
    userId, kind: "receipt_submitted" as const, link: "billing", data: { receiptId: id, studentId: user.id },
    title: "Receipt to review",
    body: `${user.firstName} ${user.lastName} uploaded a receipt for ${formatPeso(input.amountClaimed)} (${input.method.replace("_", " ")}).`,
  })));
  return id;
}

export const ReceiptFilter = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  studentId: z.uuid().optional(),
});
export async function listReceipts(db: DbOrTx, f: z.infer<typeof ReceiptFilter>) {
  const rows = await db.select({
    r: receiptUploads, firstName: users.firstName, lastName: users.lastName, invoiceNumber: invoices.number,
  }).from(receiptUploads)
    .innerJoin(users, eq(users.id, receiptUploads.studentId))
    .leftJoin(invoices, eq(invoices.id, receiptUploads.invoiceId))
    .where(and(
      f.status ? eq(receiptUploads.status, f.status) : undefined,
      f.studentId ? eq(receiptUploads.studentId, f.studentId) : undefined,
    ))
    .orderBy(desc(receiptUploads.createdAt)).limit(300);
  const reviewers = new Map((await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users)
    .where(inArray(users.id, [...new Set(rows.map((x) => x.r.reviewedBy).filter((v): v is string => !!v)), "00000000-0000-0000-0000-000000000000"])))
    .map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return rows.map(({ r, firstName, lastName, invoiceNumber }) => ({
    id: r.id, studentId: r.studentId, studentName: `${firstName} ${lastName}`, invoiceId: r.invoiceId, invoiceNumber,
    amountClaimed: num(r.amountClaimed), paidOn: r.paidOn, method: r.method, reference: r.reference,
    contentType: r.contentType, sizeBytes: r.sizeBytes, status: r.status, reviewNote: r.reviewNote, fileDeletedAt: r.fileDeletedAt,
    reviewedBy: r.reviewedBy ? reviewers.get(r.reviewedBy) ?? "Deleted account" : null, reviewedAt: r.reviewedAt, createdAt: r.createdAt,
  }));
}

/** The receipt file: a signed link (R2) or the bytes (database). Owner or finance staff only. */
export async function receiptFile(db: DbOrTx, user: User, id: string) {
  const [r] = await db.select().from(receiptUploads).where(eq(receiptUploads.id, id));
  if (!r) throw new HttpError(404, "Receipt not found");
  assertCanSeeStudent(user, r.studentId);
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[r.contentType] ?? "bin";
  const name = `receipt-${r.paidOn}.${ext}`;
  if (r.fileDeletedAt) {
    throw new HttpError(410, `This receipt's file was deleted on ${r.fileDeletedAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })} to free space`);
  }
  if (r.fileKey.startsWith("r2:")) return { mode: "r2" as const, url: await r2DownloadUrl(r.fileKey.slice(3), name) };
  const [file] = await db.select().from(receiptFiles).where(eq(receiptFiles.receiptId, id));
  if (!file) throw new HttpError(404, "File missing");
  return { mode: "db" as const, content: file.content, contentType: r.contentType, name };
}

export const ReviewInput = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("approve"), amount: amount.optional(), note: z.string().trim().max(500).nullish() }),
  z.strictObject({ decision: z.literal("reject"), note: z.string().trim().min(3).max(500) }),
]);

/** Approve: records the payment (applied to the chosen invoice, then oldest open). Reject: with a reason. */
export async function reviewReceipt(db: DbOrTx, user: User, id: string, input: z.infer<typeof ReviewInput>) {
  const [r] = await db.select().from(receiptUploads).where(eq(receiptUploads.id, id)).for("update");
  if (!r) throw new HttpError(404, "Receipt not found");
  if (r.status !== "pending") throw new HttpError(409, `Already ${r.status}`);
  let paymentId: string | null = null;
  const value = input.decision === "approve" ? input.amount ?? num(r.amountClaimed) : 0;
  if (input.decision === "approve") {
    paymentId = await recordPayment(db, user, {
      studentId: r.studentId, amount: value, paidOn: r.paidOn, method: r.method, reference: r.reference, invoiceId: r.invoiceId,
    }, r.id);
  }
  await db.update(receiptUploads).set({
    status: input.decision === "approve" ? "approved" : "rejected",
    reviewedBy: user.id, reviewedAt: new Date(), reviewNote: input.note ?? null,
  }).where(eq(receiptUploads.id, id));
  await notify(db, [{
    userId: r.studentId, kind: "receipt_reviewed", link: "billing", data: { receiptId: id, paymentId },
    title: input.decision === "approve" ? "Payment confirmed" : "Receipt not accepted",
    body: input.decision === "approve"
      ? `Your payment of ${formatPeso(value)} on ${r.paidOn} was recorded.${input.note ? ` Note: ${input.note}` : ""} ${STATEMENT_HINT}`
      : `Your receipt for ${formatPeso(num(r.amountClaimed))} wasn't accepted: ${input.note}. You can upload a new one.`,
  }]);
  return paymentId;
}

// ---------- daily reminders (cron) ----------
/** Due-soon (once per invoice) and overdue (every N days) reminders. Safe to run more than once a day. */
export async function sendDueReminders(db: DbOrTx) {
  const rules = await getSetting(db, "billing");
  const due = rules.reminderDaysBefore > 0 ? (await db.execute(sql`
    INSERT INTO payment_reminders (invoice_id, kind, sent_on)
    SELECT b.invoice_id, 'due_soon', ${manilaToday} FROM invoice_balances b
    WHERE b.payment_status IN ('pending', 'partially_paid')
      AND b.due_on <= ${manilaToday} + ${rules.reminderDaysBefore}::int
      AND NOT EXISTS (SELECT 1 FROM payment_reminders pr WHERE pr.invoice_id = b.invoice_id AND pr.kind = 'due_soon')
    ON CONFLICT DO NOTHING RETURNING invoice_id`)).rows : [];
  const overdue = rules.overdueEveryDays > 0 ? (await db.execute(sql`
    INSERT INTO payment_reminders (invoice_id, kind, sent_on)
    SELECT b.invoice_id, 'overdue', ${manilaToday} FROM invoice_balances b
    WHERE b.payment_status = 'overdue'
      AND NOT EXISTS (SELECT 1 FROM payment_reminders pr WHERE pr.invoice_id = b.invoice_id AND pr.kind = 'overdue'
                      AND pr.sent_on > ${manilaToday} - ${rules.overdueEveryDays}::int)
    ON CONFLICT DO NOTHING RETURNING invoice_id`)).rows : [];
  const ids = [...due, ...overdue].map((r) => (r as { invoice_id: string }).invoice_id);
  if (!ids.length) return { dueSoon: 0, overdue: 0 };
  const items: NewNotification[] = [];
  for (const id of ids) items.push(reminderFor(await getInvoice(db, id)));
  await notify(db, items);
  return { dueSoon: due.length, overdue: overdue.length };
}
