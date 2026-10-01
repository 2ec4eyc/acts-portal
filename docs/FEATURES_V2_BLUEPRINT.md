# ACTS Portal: Blueprint for Six New Modules

Covers chat and announcements, automated attendance alerts, billing and receipts, audit logs, admin analytics, and global settings with feature toggles and custom fields.

**Decisions:**
- **Stack stays as it is:** a Vite + React SPA, **one** Vercel Function (`api/index.ts` → `server/routes/index.ts`), Neon Postgres, **Drizzle ORM** and Firebase Auth.
  - The request mentioned Prisma, but the portal is built on Drizzle, and switching ORMs would be a rewrite with no gain. Every model below is Drizzle plus SQL.
  - The Prisma-specific questions (middleware, client extensions) are answered with the Drizzle/Postgres equivalent, which is stronger because it can't be bypassed.
- **Hosting is the Vercel Hobby plan.** That means at most 12 functions (we use 1), crons that run **once a day**, a 4.5 MB request body limit, and no long-lived WebSockets.
- **Payments:** students pay outside the portal (bank transfer, GCash, Maya, cash) and **upload proof**. An admin verifies it. There is no online gateway yet (§3.6 shows where one would plug in).
- **Real-time** uses **Ably**. Money is in **PHP**, and receipts are images or PDF **up to 2 MB**.

**Status of the code in this document:**
- The Drizzle models type-check against the real `server/db/schema.ts`.
- `drizzle-kit` generated their SQL, which applied cleanly on top of migrations 0000–0004 on Postgres 17.
- The hand-written SQL (views, audit trigger, materialized views) and the attendance-alert query ran against that database with test data:
  - invoice status and running balance came out right (an overdue partial payment, balance ₱3,750.50);
  - every write was audited with the acting admin, and the audit log refused a `DELETE`;
  - a bad receipt type and a bad custom-field key were rejected;
  - the JSONB filter worked, and both materialized views refreshed concurrently;
  - the alert fired once at 2 absences and once at 3, never twice, and skipped excused absences.
- The TypeScript in §3 (route, Ably, R2 and cache code) is the implementation pattern and is **not yet compiled**. It is written against the real helpers (`requireUser`, `methods`, `db`) and gets compiled and tested in each phase's PR.

---

## 1. What each module needs, and how it fits what exists

| Module | Reuses | Adds |
|---|---|---|
| 1. Chat & announcements | `users`, `cohorts`, `course_offerings`; client `live()` polling as fallback | `conversations`, `messages`, `announcements`, `announcement_reads`, `notifications`; Ably |
| 2. Attendance alerts | `attendance_sessions`/`attendance_records` (these *are* the attendance log), `saveAttendance()` | `attendance_alerts`; alert step inside the existing save transaction |
| 3. Billing | `users`, `terms` | `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `receipt_uploads`, `payment_reminders`; views `invoice_balances`, `student_ledger`; R2 bucket; daily cron |
| 4. Audit | `audit_log` (already written for transcripts, resets, admin grants) | row-level columns, a trigger on every sensitive table, `withActor()`; append-only guard |
| 5. Analytics | everything above | `mv_enrollment_by_term`, `mv_attendance_daily`; `GET /api/analytics/summary` |
| 6. Settings & custom fields | `app_settings` (JSONB key/value) | typed keys + code defaults; `custom_field_definitions`; `student_records.custom_fields` JSONB |

Design rules used throughout:
- **Derive, don't store.** Invoice status (paid, partially paid, pending, overdue) and running balances come from views, so they can't drift from the underlying rows.
- **Never hard-delete money or records.** Invoices and payments are *voided* with a reason, and the audit trigger keeps every version.
- **Idempotent automation.** Every automatic notification is guarded by a unique key (`attendance_alerts`, `payment_reminders`). Retries, double saves and cron reruns can't double-send.
- **The database is the source of truth.** Ably only delivers. A message that missed the socket is still in Postgres, and the next fetch shows it.

---

## 2. Database schema (migration `0005`)

How the models named in the request map to tables:

| Requested model | Table(s) | New or existing |
|---|---|---|
| `Messages` | `conversations`, `messages` | new |
| `Announcements` | `announcements`, `announcement_reads` (+ `notifications` for personal alerts) | new |
| `AttendanceLogs` | `attendance_sessions`, `attendance_records` (+ `attendance_alerts`) | existing (+ new) |
| `Invoices` | `invoices`, `invoice_lines` (+ views `invoice_balances`, `student_ledger`) | new |
| `Payments` | `payments`, `payment_allocations`, `payment_reminders` | new |
| `Receipts` | `receipt_uploads` (file in R2, metadata and verification here) | new |
| `AuditLogs` | `audit_log`, extended with row-level history | existing, extended |
| `SystemSettings` | `app_settings` (typed keys) + `custom_field_definitions` | existing, extended + new |

### 2.1 Drizzle models (`server/db/schema.ts` additions)

```ts
// Drizzle models for the six v2 modules (blueprint draft, verified against the real schema).
import { sql } from "drizzle-orm";
import {
  bigserial, boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey,
  smallint, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { cohorts, courseOfferings, terms, userRole, users } from "./schema.js";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

// ---------- Module 1: communication ----------
export const conversationStatus = pgEnum("conversation_status", ["open", "closed"]);

/** One thread per student with the school office (a shared inbox any admin can answer). */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  status: conversationStatus("status").notNull().default("open"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  studentLastReadAt: timestamp("student_last_read_at", { withTimezone: true }),
  adminLastReadAt: timestamp("admin_last_read_at", { withTimezone: true }),
  createdAt,
}, (t) => [index("conversations_last_message_idx").on(t.lastMessageAt)]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt,
}, (t) => [
  index("messages_conversation_idx").on(t.conversationId, t.createdAt),
  check("messages_body_ck", sql`char_length(${t.body}) BETWEEN 1 AND 4000`),
]);

/** Targeted by role (and optionally a batch or a course). Not fanned out: readers query by audience. */
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audienceRoles: userRole("audience_roles").array().notNull(),   // e.g. {student} or {student,teacher}
  cohortId: integer("cohort_id").references(() => cohorts.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").references(() => courseOfferings.id, { onDelete: "cascade" }),
  pinned: boolean("pinned").notNull().default(false),
  publishAt: timestamp("publish_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt,
}, (t) => [
  index("announcements_publish_idx").on(t.publishAt),
  check("announcements_audience_ck", sql`cardinality(${t.audienceRoles}) > 0`),
]);

export const announcementReads = pgTable("announcement_reads", {
  announcementId: uuid("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.announcementId, t.userId] })]);

/** Per-user inbox: attendance alerts, payment reminders, receipt reviews, new-message pings. */
export const notificationKind = pgEnum("notification_kind", [
  "attendance_warning", "attendance_escalation", "payment_reminder", "receipt_reviewed", "message",
]);
export const notifications = pgTable("notifications", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: notificationKind("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),                                       // in-app route, e.g. "records" or "finance"
  data: jsonb("data"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt,
}, (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)]);

// ---------- Module 2: attendance alerts (records stay in attendance_sessions/records) ----------
/** One row per threshold crossed; the unique key makes each alert fire exactly once. */
export const attendanceAlerts = pgTable("attendance_alerts", {
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "cascade" }),
  threshold: smallint("threshold").notNull(),               // 2 = warning, 3 = escalation (from settings)
  absences: smallint("absences").notNull(),
  createdAt,
}, (t) => [primaryKey({ columns: [t.studentId, t.offeringId, t.threshold] })]);

// ---------- Module 3: finance ----------
export const invoiceState = pgEnum("invoice_state", ["issued", "void"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "bank_transfer", "gcash", "maya", "other"]);
export const receiptStatus = pgEnum("receipt_status", ["pending", "approved", "rejected"]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),               // INV-2026-0001
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  termId: integer("term_id").references(() => terms.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  issuedOn: date("issued_on").notNull().defaultNow(),
  dueOn: date("due_on").notNull(),
  state: invoiceState("state").notNull().default("issued"),
  voidReason: text("void_reason"),
  voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt,
}, (t) => [
  index("invoices_student_idx").on(t.studentId),
  index("invoices_due_idx").on(t.dueOn),
  check("invoices_void_ck", sql`(${t.state} = 'void') = (${t.voidedAt} IS NOT NULL AND ${t.voidReason} IS NOT NULL)`),
]);

export const invoiceLines = pgTable("invoice_lines", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),               // "Tuition, 1st semester"
  amount: money("amount").notNull(),
}, (t) => [check("invoice_lines_amount_ck", sql`${t.amount} > 0`)]);

export const receiptUploads = pgTable("receipt_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  amountClaimed: money("amount_claimed").notNull(),
  paidOn: date("paid_on").notNull(),
  method: paymentMethod("method").notNull(),
  reference: text("reference"),                             // bank / GCash reference no.
  fileKey: text("file_key").notNull().unique(),             // object key in the private R2 bucket
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  status: receiptStatus("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  createdAt,
}, (t) => [
  index("receipts_status_idx").on(t.status, t.createdAt),
  uniqueIndex("receipts_student_sha_uq").on(t.studentId, t.sha256),   // same file uploaded twice
  check("receipts_size_ck", sql`${t.sizeBytes} BETWEEN 1 AND 2097152`),
  check("receipts_type_ck", sql`${t.contentType} IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')`),
]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  amount: money("amount").notNull(),
  paidOn: date("paid_on").notNull(),
  method: paymentMethod("method").notNull(),
  reference: text("reference"),
  receiptUploadId: uuid("receipt_upload_id").unique().references(() => receiptUploads.id, { onDelete: "set null" }),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
  voidReason: text("void_reason"),
  voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt,
}, (t) => [
  index("payments_student_idx").on(t.studentId),
  check("payments_amount_ck", sql`${t.amount} > 0`),
]);

/** How a payment is applied to invoices (oldest due first by default; admins can re-allocate). */
export const paymentAllocations = pgTable("payment_allocations", {
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  amount: money("amount").notNull(),
}, (t) => [
  primaryKey({ columns: [t.paymentId, t.invoiceId] }),
  index("allocations_invoice_idx").on(t.invoiceId),
  check("allocations_amount_ck", sql`${t.amount} > 0`),
]);

export const paymentReminders = pgTable("payment_reminders", {
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                             // "due_soon" | "overdue" | "manual"
  sentOn: date("sent_on").notNull().defaultNow(),
  sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [primaryKey({ columns: [t.invoiceId, t.kind, t.sentOn] })]);

// ---------- Module 6: settings and dynamic custom fields ----------
export const customFieldType = pgEnum("custom_field_type", ["text", "number", "date", "select", "boolean"]);
export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),                      // stable slug: "bus_route", "blood_type"
  label: text("label").notNull(),
  type: customFieldType("type").notNull(),
  options: jsonb("options").$type<string[]>(),              // for "select"
  required: boolean("required").notNull().default(false),
  studentVisible: boolean("student_visible").notNull().default(true),
  studentEditable: boolean("student_editable").notNull().default(false),
  sortOrder: smallint("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt,
}, (t) => [check("custom_field_key_ck", sql`${t.key} ~ '^[a-z][a-z0-9_]{0,39}$'`)]);

// Additions to existing tables (shown as the columns the migration adds):
//   student_records.custom_fields  jsonb NOT NULL DEFAULT '{}'   + GIN index
//   app_settings.updated_at        timestamptz NOT NULL DEFAULT now()
//   app_settings.updated_by        uuid REFERENCES users(id) ON DELETE SET NULL
//   audit_log.table_name text, op text, old jsonb, new jsonb   (row-level history from the trigger)
```

**Custom fields: JSONB, not EAV.** Each student's extra fields live in one `custom_fields` JSONB object on `student_records`, keyed by the definition's stable `key`:
```json
{ "bus_route": "Route 2", "blood_type": "O+", "has_laptop": true }
```

| | JSONB on `student_records` (chosen) | Entity-Attribute-Value table |
|---|---|---|
| Read a profile | one row | one row per field, pivoted |
| Filter ("everyone on Route 2") | `custom_fields @> '{"bus_route":"Route 2"}'`, GIN-indexed | self-join per condition |
| Types | validated in the API from the definitions (zod built at runtime) | needs one value column per type, or text + casts |
| Add a field | insert a definition row, no migration | same |
| Remove a field | archive the definition (data kept, hidden) | same |

Values are validated on every write. The API loads the active definitions (cached as in §3.7) and builds a `z.strictObject` from them:
- unknown keys are rejected;
- `select` values must be one of the options;
- `required` is enforced;
- students may write only the `student_editable` fields.

Because the key never changes, renaming a label is safe.

### 2.2 SQL that Drizzle can't express (same migration, hand-written)

```sql
-- ===== Columns added to existing tables =====
ALTER TABLE student_records ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX student_records_custom_fields_gin ON student_records USING gin (custom_fields jsonb_path_ops);
ALTER TABLE app_settings
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_log
  ADD COLUMN table_name text,
  ADD COLUMN op text,
  ADD COLUMN old jsonb,
  ADD COLUMN new jsonb;
CREATE INDEX audit_actor_at_idx ON audit_log (actor_id, at DESC);
CREATE INDEX audit_at_idx ON audit_log (at DESC);

-- ===== Finance views: status is derived, never stored =====
CREATE VIEW invoice_balances AS
SELECT i.id AS invoice_id, i.number, i.student_id, i.description, i.issued_on, i.due_on, i.state,
       coalesce(l.total, 0)                           AS amount,
       coalesce(a.paid, 0)                            AS paid,
       coalesce(l.total, 0) - coalesce(a.paid, 0)     AS balance,
       CASE
         WHEN i.state = 'void'                                   THEN 'void'
         WHEN coalesce(l.total, 0) - coalesce(a.paid, 0) <= 0    THEN 'paid'
         WHEN i.due_on < current_date                            THEN 'overdue'
         WHEN coalesce(a.paid, 0) > 0                            THEN 'partially_paid'
         ELSE 'pending'
       END AS payment_status
FROM invoices i
LEFT JOIN (SELECT invoice_id, sum(amount) AS total FROM invoice_lines GROUP BY invoice_id) l ON l.invoice_id = i.id
LEFT JOIN (SELECT pa.invoice_id, sum(pa.amount) AS paid
           FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
           WHERE p.voided_at IS NULL GROUP BY pa.invoice_id) a ON a.invoice_id = i.id;

-- Statement of account: charges (debit) and payments (credit) with a running balance.
CREATE VIEW student_ledger AS
WITH entries AS (
  SELECT i.student_id, i.issued_on AS entry_date, i.created_at, 'charge' AS kind, i.id AS ref_id,
         i.number || ': ' || i.description AS description, b.amount AS debit, 0::numeric AS credit
  FROM invoices i JOIN invoice_balances b ON b.invoice_id = i.id
  WHERE i.state = 'issued'
  UNION ALL
  SELECT p.student_id, p.paid_on, p.created_at, 'payment', p.id,
         'Payment (' || p.method || coalesce(', ref ' || p.reference, '') || ')', 0, p.amount
  FROM payments p WHERE p.voided_at IS NULL
)
SELECT *, sum(debit - credit) OVER (PARTITION BY student_id ORDER BY entry_date, created_at, ref_id) AS running_balance
FROM entries;

-- ===== Audit: automatic row history for every write, with the actor from the request =====
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  row_id text;
BEGIN
  row_id := coalesce(to_jsonb(NEW), to_jsonb(OLD)) ->> coalesce(TG_ARGV[0], 'id');
  INSERT INTO audit_log (actor_id, action, entity, entity_id, table_name, op, old, new, data)
  VALUES (actor, TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME, coalesce(row_id, '?'),
          TG_TABLE_NAME, TG_OP,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
          CASE WHEN actor IS NULL THEN jsonb_build_object('source', coalesce(nullif(current_setting('app.source', true), ''), 'system')) END);
  RETURN coalesce(NEW, OLD);
END $$;

-- Audit rows are append-only.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_grades AFTER INSERT OR UPDATE OR DELETE ON grades
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('enrollment_id');
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_invoice_lines AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_payment_allocations AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('payment_id');
CREATE TRIGGER audit_receipt_uploads AFTER INSERT OR UPDATE OR DELETE ON receipt_uploads
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_student_records AFTER INSERT OR UPDATE OR DELETE ON student_records
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('user_id');
CREATE TRIGGER audit_transcripts AFTER INSERT OR UPDATE OR DELETE ON transcripts
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_app_settings AFTER INSERT OR UPDATE OR DELETE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('key');
CREATE TRIGGER audit_custom_field_definitions AFTER INSERT OR UPDATE OR DELETE ON custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ===== Analytics: precomputed history, refreshed by the daily cron =====
CREATE MATERIALIZED VIEW mv_enrollment_by_term AS
SELECT sy.label AS school_year, t.semester, o.year_level, count(DISTINCT e.student_id) AS students
FROM enrollments e
JOIN course_offerings o ON o.id = e.offering_id AND o.deleted_at IS NULL
JOIN terms t ON t.id = o.term_id
JOIN school_years sy ON sy.id = t.school_year_id
WHERE e.status <> 'dropped'
GROUP BY sy.label, t.semester, o.year_level;
CREATE UNIQUE INDEX mv_enrollment_by_term_uq ON mv_enrollment_by_term (school_year, semester, year_level);

CREATE MATERIALIZED VIEW mv_attendance_daily AS
SELECT s.held_on AS day,
       count(*)                                              AS marked,
       count(*) FILTER (WHERE r.status = 'present')          AS present,
       count(*) FILTER (WHERE r.status = 'late')             AS late,
       count(*) FILTER (WHERE r.status = 'absent')           AS absent
FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
GROUP BY s.held_on;
CREATE UNIQUE INDEX mv_attendance_daily_uq ON mv_attendance_daily (day);
```

**Why the audit trigger instead of Prisma middleware or client extensions?**
- An ORM hook only sees writes made through that ORM instance. Raw SQL, scripts (`db:reset`, `admin:grant`), the Neon console and future code would all slip past it.
- A trigger fires on **every** write to the table, whatever made it.
- The trigger can't know *who* is acting, so each request tells it (§3.4).
- Rows written outside a request are tagged `{"source":"system"}`, or whatever `app.source` was set to, such as `cron`.

---

## 3. Serverless infrastructure on Vercel

### 3.1 Real-time chat: Postgres + Ably

Vercel Functions can't hold a WebSocket open, so a managed real-time service holds the sockets. The function stays request/response.

```
Student browser ──POST /api/chat/conversations/:id/messages──▶ Vercel Function
                                                                 1. requireUser, feature flag "chat" on?
                                                                 2. INSERT message (Postgres, source of truth)
                                                                 3. Ably REST publish → channel chat:{studentId}
Admin browsers ◀──── Ably WebSocket (subscribed to chat:*) ◀────┘
```

**Why Ably.** The free tier covers this school many times over, it offers token auth with per-channel capabilities, and it has a REST publish that suits serverless.
- **Pusher Channels** works the same way.
- **Supabase Realtime** would add a second Postgres provider.
- **Polling-only** stays as the fallback.

**Token endpoint.** The browser never sees the API key. Capabilities are derived from the role stored in Postgres.

```ts
// server/routes/realtime/token.ts
import Ably from "ably";
import { can, requireUser } from "../../lib/auth.js";
import { methods } from "../../lib/http.js";

const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY! });

// POST /api/realtime/token → an Ably TokenRequest for this user's channels only (1 hour).
export default methods({
  POST: async (req, res) => {
    const user = await requireUser(req);
    const capability: Record<string, ("subscribe" | "publish" | "presence")[]> = { [`notify:${user.id}`]: ["subscribe"] };
    if (user.role === "student") capability[`chat:${user.id}`] = ["subscribe", "presence"];
    if (can(user, "chat:admin_inbox")) { capability["chat:*"] = ["subscribe", "presence"]; capability["admin"] = ["subscribe"]; }
    res.status(200).json(await ably.auth.createTokenRequest({ clientId: user.id, capability: JSON.stringify(capability), ttl: 3_600_000 }));
  },
});
```

**Publishing after the write commits:**
```ts
// server/lib/realtime.ts: never fail the request because the socket service is down
export async function publish(channel: string, name: string, data: unknown) {
  if (!process.env.ABLY_API_KEY) return;
  await ably.channels.get(channel).publish(name, data).catch((err) => console.error("ably publish", err));
}
```

**Client side:**
1. `new Ably.Realtime({ authCallback })` calls `/api/realtime/token`.
2. It subscribes to `chat:{me}` (students) or `chat:*` (admins), plus `notify:{me}`.
3. When an event arrives, it **appends the payload** to the open thread, or calls `refreshAll()` from `src/lib/live.ts` for lists.
4. If Ably fails to connect, the existing 30 s polling keeps everything working, just slower.

Unread counts come from `conversations.*_last_read_at` compared with `last_message_at`. There's no per-message read row.

**Rules:**
- Messages are plain text up to 4,000 characters.
- A student can only post to their own conversation.
- With the `chat` toggle off, students get `403 Chat is turned off` and the UI hides the composer. Admins can still read the history.

### 3.2 Absence alerts: event-driven, inside the attendance save

The alerts depend only on attendance writes, and every attendance write goes through `saveAttendance()`. So the check runs **in the same transaction**: no cron, no delay, no missed rows.

The query below was run against Postgres. With thresholds `[2, 3]`, it returned nothing at 1 absence and nothing for an excused absence. It returned `2` at the second absence, nothing when the same day was saved again, `3` at the third, and nothing at the fourth.

```sql
WITH counts AS (
  SELECT r.student_id, s.offering_id, count(*)::smallint AS absences
  FROM attendance_records r
  JOIN attendance_sessions s ON s.id = r.session_id
  WHERE s.offering_id = $1 AND r.student_id = ANY($2::uuid[])
    AND r.status = 'absent' AND (NOT r.is_excused OR $3)      -- $3 = settings.countExcused
  GROUP BY r.student_id, s.offering_id
)
INSERT INTO attendance_alerts (student_id, offering_id, threshold, absences)
SELECT c.student_id, c.offering_id, t.threshold, c.absences
FROM counts c CROSS JOIN unnest($4::smallint[]) AS t(threshold)   -- $4 = [warnAt, escalateAt] = [2, 3]
WHERE c.absences >= t.threshold
ON CONFLICT DO NOTHING
RETURNING student_id, offering_id, threshold, absences;
```

For each **returned** row, which is a threshold crossed for the first time, the same transaction inserts `notifications` for:
- the **student**;
- the offering's **instructor**;
- **every admin**.

The kind is `attendance_warning` at 2 and `attendance_escalation` at 3. After commit, it publishes to `notify:{userId}`. Two details:
- `>=` rather than `=` means a backfill that jumps from 1 to 3 absences in one save still sends **both** alerts, once each.
- Correcting a record back to *present* doesn't re-arm an alert. The unique key remembers that it was already sent.

The thresholds, and whether excused or late marks count, live in the `attendanceAlerts` setting, so an admin can change them without a deploy.

### 3.3 Payment reminders: one daily Vercel Cron

Hobby crons run once a day, which is exactly what reminders need:

```jsonc
// vercel.json
{ "crons": [{ "path": "/api/cron/daily", "schedule": "0 22 * * *" }] }   // 22:00 UTC = 06:00 Manila
```

Vercel calls the path with `Authorization: Bearer $CRON_SECRET`. The route checks it and refuses anything else. It goes through the same dispatcher, so it's still one function. Each step is idempotent, so a rerun or a manual trigger is harmless:

1. Inside `withActor(null, …, "cron")`, insert `payment_reminders (invoice_id, 'due_soon', today)` for open invoices due within `billing.reminderDaysBefore` days, using `ON CONFLICT DO NOTHING RETURNING`. Notify each returned student.
2. Do the same with `'overdue'` for overdue invoices whose last overdue reminder is at least `billing.overdueEveryDays` days old.
3. `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_enrollment_by_term, mv_attendance_daily`.
4. Delete read notifications older than 180 days.

Admins also get a **Send reminder** button per invoice (`POST /api/finance/invoices/:id/remind`, recorded as kind `manual`).

**Statuses shown to admins and students.** Everything comes from `invoice_balances.payment_status`:

| Status | Meaning |
|---|---|
| `paid` | balance is ₱0 or less |
| `overdue` | past its due date with a balance left |
| `partially_paid` | something paid, not yet due |
| `pending` | nothing paid, not yet due |

A receipt waiting for review shows next to the invoice as **"Receipt under review"**.

### 3.4 Automatic audit logging with `withActor`

```ts
// server/lib/db.ts
import { sql } from "drizzle-orm";

/** Runs `fn` in a transaction whose writes the audit trigger attributes to `actorId`. */
export function withActor<T>(actorId: string | null, fn: (tx: Tx) => Promise<T>, source = "api"): Promise<T> {
  return db.transaction(async (tx) => {
    // `true` = transaction-local: safe with Neon's PgBouncer (transaction pooling); can't leak to another request.
    await tx.execute(sql`SELECT set_config('app.actor_id', ${actorId ?? ""}, true), set_config('app.source', ${source}, true)`);
    return fn(tx);
  });
}
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
```

Every mutating route calls it once, for example `await withActor(user.id, (tx) => setGrade(tx, input))`. The existing library functions already accept a transaction, so they need no changes.

What the log then holds, with no other code:
- who (`actor_id`);
- when (`at`);
- which table and row;
- the operation;
- the complete before and after (`old`/`new` JSONB).

For example: *Ada Admin changed `grades` row `enrollment 9f…` from 82 to 88 at 14:03*. Or: *Ada Admin voided invoice INV-2026-0012*, which shows as an `UPDATE` with `state: issued → void`, and the reason in `new`.

Sensitive columns never reach the log: the trigger audits the tables listed in §2.2, and none of them hold passwords or tokens.

**Admin "Audit Log" page:**
- Uses `GET /api/audit` with filters for person, table, row and date range, plus a cursor (keyset on `id`).
- Each entry has a "What changed" view that diffs `old` against `new`.
- Viewing it requires `audit:read` (admins).

The log is append-only by trigger. Storage is small at this scale, about a few MB a year. If it ever grows large, partition by year.

### 3.5 Receipt uploads: private Cloudflare R2, direct from the browser

Bank and GCash slips carry account numbers and names, so they must be **private**:
- **Vercel Blob** gives public, unguessable URLs. That isn't private enough for this.
- **Postgres** would quickly use up Neon's storage quota with images.
- **Cloudflare R2** fits: S3-compatible, private by default, free up to 10 GB, and no download fees.

```
1. Student picks a file   → browser shrinks photos (canvas → JPEG, long edge ≤ 2000px) until ≤ 2 MB; PDFs must already be ≤ 2 MB
2. POST /api/finance/receipts/upload-url { contentType, sizeBytes, sha256 }
       → API checks: feature "receiptUploads" on, type ∈ jpeg/png/webp/pdf, size ≤ 2 MB, not a duplicate sha256
       → returns { key: "receipts/{studentId}/{uuid}", url: presigned PUT, 5 min, ContentType + ContentLength signed }
3. Browser PUTs the file straight to R2 (never through the Vercel Function, so the 4.5 MB limit doesn't apply)
4. POST /api/finance/receipts { key, amountClaimed, paidOn, method, reference, invoiceId? } → row with status "pending"
5. Admin opens it   → GET /api/finance/receipts/:id/file → 302 to a 5-minute presigned GET (owner or finance:read only)
6. Admin approves   → POST /api/finance/receipts/:id/review { decision: "approve", amount? }
       → one withActor transaction: create payment (receipt_upload_id = this), allocate to oldest open invoices,
         set status approved; notify the student ("receipt_reviewed")
   Admin rejects    → status rejected + review_note (required); the student is notified and can upload again
```

```ts
// server/lib/storage.ts
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
});
const Bucket = process.env.R2_BUCKET!;

export const uploadUrl = (key: string, contentType: string, size: number) =>
  getSignedUrl(r2, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: size }), { expiresIn: 300 });
export const downloadUrl = (key: string) =>
  getSignedUrl(r2, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 300 });
```

The bucket's CORS rule allows `PUT` only from the portal's domains. **Verification status** lives entirely in `receipt_uploads`:
- `status` (pending, approved or rejected), `reviewed_by`, `reviewed_at` and `review_note`;
- the link to the `payments` row it produced.

Each change is captured by the audit trigger.

*Fallback if you'd rather not add an R2 account:* store the file in Postgres, as `material_files` does today, with the same 2 MB cap. It works, but every receipt counts against the database storage quota.

### 3.6 Where an online gateway would plug in later

Add `payments.provider` and `provider_ref`, and add `POST /api/finance/webhooks/{provider}`. That endpoint verifies the provider's signature, then inserts a payment and allocates it through the same `withActor(null, …, "webhook")` path. The invoice views, statuses and audit work unchanged.

### 3.7 Feature toggles and settings without a database read per page load

```
SPA start ──GET /api/settings/public──▶ Vercel CDN (cached 60 s, then served stale while revalidating)
                                            │ cache miss ≈ once a minute
                                            ▼
                                         Function ──▶ app_settings (one row: "features")
```

- **Public flags** (`features`) contain nothing sensitive. The response sends `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`, so Vercel's CDN answers almost every request and Postgres sees roughly one read a minute however many people are online. The SPA reads the flags once at start-up and again when the tab regains focus, then hides the switched-off modules.
- **Enforcement is server-side.** Hiding a button isn't security. Routes that a toggle can switch off (chat POST, receipt upload) check a **30-second in-memory cache** in the warm function instance:

```ts
// server/lib/settings.ts
const Features = z.object({
  chat: z.boolean().default(true), receiptUploads: z.boolean().default(true),
  announcements: z.boolean().default(true), studentSchedule: z.boolean().default(true),
});
let cached: { at: number; value: z.infer<typeof Features> } | null = null;

export async function features() {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "features"));
  cached = { at: Date.now(), value: Features.parse(row?.value ?? {}) };    // code defaults fill gaps
  return cached.value;
}
export async function requireFeature(name: keyof z.infer<typeof Features>) {
  if (!(await features())[name]) throw new HttpError(403, `${name} is turned off`);
}
```

A toggle change reaches everyone within about a minute. The admin's own tab updates immediately from the PATCH response. That's fine for "turn chat off during exams".
- If instant global propagation is ever needed, move the flags to **Vercel Edge Config**, which serves reads at the edge in about a millisecond without touching the database. Check the current plan limits first.
- Redis isn't needed at this scale.

Settings keys and their defaults live in code:

| Key | Default |
|---|---|
| `features` | `{ chat: true, receiptUploads: true, announcements: true, studentSchedule: true }` |
| `attendanceAlerts` | `{ warnAt: 2, escalateAt: 3, countExcused: false, countLateAsAbsent: false }` |
| `billing` | `{ reminderDaysBefore: 3, overdueEveryDays: 7, currency: "PHP" }` |

`PATCH /api/settings/:key` validates against the key's schema, writes `updated_by`, and the audit trigger logs it.

### 3.8 Analytics without timeouts

At this school's size (hundreds of students), every dashboard query is milliseconds with the right indexes. The design keeps it that way as years accumulate:

- **One request, one round trip.** `GET /api/analytics/summary` runs a single SQL statement with CTEs:
  - outstanding tuition: `sum(balance)` from `invoice_balances` where the status isn't paid or void;
  - today's attendance rate: live, from today's `attendance_records`;
  - the last 30 days from `mv_attendance_daily`, plus enrollment per term from `mv_enrollment_by_term`.
- **History is precomputed** in the two materialized views, refreshed `CONCURRENTLY` by the daily cron, so readers never block. Only today is computed live.
- **60-second in-memory cache** per warm instance, keyed by nothing (the data is school-wide). The endpoint is admin-only, so responses send `Cache-Control: private, no-store`.
- Nowhere near the function timeout. If a report ever grows heavy, it gets its own materialized view, not a longer timeout.

The dashboard shows four tiles:
- outstanding balance;
- attendance today;
- students enrolled this term;
- receipts waiting for review.

It also shows three charts:
- attendance rate per day (30 days, line);
- enrollment by term (bars by year level);
- outstanding by status (bar).

They'll be built to standard data-visualization practice: one consistent palette, light and dark modes, and accessible labels.

---

## 4. API endpoints

All routes are added to the `ROUTES` table in `server/routes/index.ts`, so it stays one Vercel Function. Every mutation runs through `withActor`, so it is audited.

| Method | Path | Who | Notes |
|---|---|---|---|
| **Communication** ||||
| GET, POST | `/api/chat/conversations` | student (own), admin (all) | POST: student opens or gets their thread. GET (admin): inbox with unread counts |
| GET | `/api/chat/conversations/:id/messages?before=` | owner, admin | Newest 50, keyset pagination |
| POST | `/api/chat/conversations/:id/messages` | owner, admin | `{ body }`. Feature `chat` (students). Publishes to Ably |
| POST | `/api/chat/conversations/:id/read` | owner, admin | Sets the reader's `*_last_read_at` |
| PATCH | `/api/chat/conversations/:id` | admin | `{ status: open\|closed }` |
| POST | `/api/realtime/token` | signed in | Ably TokenRequest for the caller's channels |
| GET, POST | `/api/announcements` | GET: everyone (filtered to their audience); POST: `announcements:write` | `{ title, body, audienceRoles, cohortId?, offeringId?, pinned, publishAt, expiresAt }` |
| PATCH, DELETE | `/api/announcements/:id` | `announcements:write` | |
| POST | `/api/announcements/:id/read` | signed in | |
| GET | `/api/notifications?unread=true` | own | Newest first, plus an unread count |
| POST | `/api/notifications/read` | own | `{ ids }` or `{ all: true }` |
| **Attendance** ||||
| PUT | `/api/attendance` | `attendance:write` | *Existing.* Now also creates alerts and notifications in the same transaction |
| GET | `/api/attendance/alerts?offeringId=\|studentId=` | staff; student (own) | |
| **Finance** ||||
| GET | `/api/finance/students/:id/statement` | `finance:read`; student (own via `/api/me/finance`) | Ledger with running balance, invoices with status, payments, receipts |
| GET, POST | `/api/finance/invoices?studentId=&status=` | `finance:read` / `finance:write` | POST `{ studentId \| studentIds, termId?, description, dueOn, lines[] }`. Bulk billing for a batch |
| PATCH | `/api/finance/invoices/:id` | `finance:write` | `{ void: { reason } }`. Lines editable only while nothing is paid |
| POST | `/api/finance/invoices/:id/remind` | `finance:write` | Manual reminder |
| GET, POST | `/api/finance/payments` | `finance:read` / `finance:write` | POST records a cash or office payment and auto-allocates (or `{ allocations }`) |
| PATCH | `/api/finance/payments/:id` | `finance:write` | `{ void: { reason } }` |
| POST | `/api/finance/receipts/upload-url` | student | `{ contentType, sizeBytes, sha256 }` → presigned PUT. Feature `receiptUploads` |
| GET, POST | `/api/finance/receipts?status=pending` | admin all / student own | POST registers the uploaded file with the claimed amount |
| GET | `/api/finance/receipts/:id/file` | owner, `finance:read` | 302 to a 5-minute presigned GET |
| POST | `/api/finance/receipts/:id/review` | `finance:write` | `{ decision: approve\|reject, amount?, note? }` |
| GET | `/api/me/finance` | student | Own statement |
| **Audit** ||||
| GET | `/api/audit?table=&actorId=&entityId=&from=&to=&cursor=` | `audit:read` | Keyset-paginated, newest first |
| **Analytics** ||||
| GET | `/api/analytics/summary` | admin | Tiles and chart series (§3.8) |
| **Settings** ||||
| GET | `/api/settings/public` | **public** | Feature flags only. CDN-cached 60 s |
| GET, PATCH | `/api/settings/:key` | `settings:write` | `features`, `attendanceAlerts`, `billing` |
| GET, POST | `/api/custom-fields` | GET: signed in (students see `student_visible` only); POST: `settings:write` | |
| PATCH | `/api/custom-fields/:id` | `settings:write` | Edit label, options or flags, or `{ archived: true }` |
| PATCH | `/api/users/:id`, `/api/me` | *existing* | Now accept `customFields`, validated against the definitions |
| **System** ||||
| GET | `/api/cron/daily` | Vercel Cron (`CRON_SECRET`) | Reminders, view refresh, cleanup |

**New permissions** go in `server/lib/auth.ts`, all granted to admins:
- `finance:read`, `finance:write`
- `audit:read`
- `settings:write`
- `chat:admin_inbox`
- `announcements:write` (also president and VP, if you want them to post)

Students reach their own data through `/api/me/*` and ownership checks, never through these permissions.

---

## 5. Configuration and cost

| Service | Plan | Env vars (Vercel → Settings → Environment Variables) |
|---|---|---|
| Ably | Free | `ABLY_API_KEY` |
| Cloudflare R2 | Free (10 GB, no egress fees) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| Vercel Cron | Included in Hobby (daily) | `CRON_SECRET` (any long random string) |
| Neon, Vercel, Firebase | Unchanged | — |

None of these are visible to the browser except through the endpoints above.

---

## 6. Rollout: one pull request per phase

Each phase ships with:
- integration tests in `tests/` (local Postgres and Firebase emulators);
- a browser check of the new screens;
- green lint, build and the full test suite before merge.

| Phase | Contents | Depends on |
|---|---|---|
| 1. Foundations ✅ | `withActor`, audit columns and triggers, Audit Log page; typed settings, `/api/settings/public`, feature toggles panel | — |
| 2. Notifications & attendance alerts | `notifications`, bell/inbox UI, `attendance_alerts` in `saveAttendance`; announcements (create, target, pin, expire, feed) | 1 |
| 3. Billing | invoices (single and batch), payments, allocations, ledger/statement, receipts (R2), review queue, student finance page, daily cron reminders | 1, 2 |
| 4. Chat | conversations, messages, Ably token and publish, student chat and admin inbox, polling fallback | 1, 2 |
| 5. Analytics dashboard | materialized views, summary endpoint, tiles and charts | 2, 3 |
| 6. Custom fields | definitions admin screen, profile and student forms, filters | 1 |

**Before phase 3,** create the R2 bucket. **Before phase 4,** create the Ably app. Exact click-through steps for both will come with those PRs.
