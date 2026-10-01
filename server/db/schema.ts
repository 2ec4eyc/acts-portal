import { sql } from "drizzle-orm";
import {
  customType, pgTable, pgEnum, uuid, text, smallint, integer, boolean, date, time,
  timestamp, numeric, jsonb, bigint, bigserial, serial, primaryKey, unique, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------
export const userRole = pgEnum("user_role", ["student", "teacher", "admin", "president", "vice_president"]);
export const staffCategory = pgEnum("staff_category", ["day_secretary", "night_secretary", "faculty", "admin"]);
export const userStatus = pgEnum("user_status", ["pending", "active", "archived"]);
export const schoolType = pgEnum("school_type", ["day", "night"]);
export const meetingFrequency = pgEnum("meeting_frequency", ["once", "daily", "weekly", "biweekly", "monthly"]);
export const enrollmentStatus = pgEnum("enrollment_status", ["enrolled", "dropped", "completed"]);
export const attendanceStatus = pgEnum("attendance_status", ["present", "absent", "late"]);
export const materialCategory = pgEnum("material_category", ["notes", "exams", "activity"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

// ---------- People ----------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firebaseUid: text("firebase_uid").notNull().unique(),   // = Firestore users/{uid}
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  photoUrl: text("photo_url"),
  contactNumber: text("contact_number"),
  role: userRole("role").notNull().default("student"),
  staffCategory: staffCategory("staff_category"),
  status: userStatus("status").notNull().default("active"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** The browser session allowed to use this account; a newer sign-in replaces it. */
  currentSessionId: text("current_session_id"),
  ...timestamps,
}, (t) => [
  uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`),
  index("users_role_status_idx").on(t.role, t.status),
  check("users_archived_ck", sql`(${t.status} = 'archived') = (${t.archivedAt} IS NOT NULL)`),
]);

export const schoolYears = pgTable("school_years", {
  id: serial("id").primaryKey(),
  label: text("label").notNull().unique(),                 // "2025-2026"
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
});

export const terms = pgTable("terms", {
  id: serial("id").primaryKey(),
  schoolYearId: integer("school_year_id").notNull().references(() => schoolYears.id, { onDelete: "restrict" }),
  semester: smallint("semester").notNull(),                // 1..3
  isCurrent: boolean("is_current").notNull().default(false),
  gradesPublished: boolean("grades_published").notNull().default(false),
}, (t) => [
  uniqueIndex("terms_year_semester_uq").on(t.schoolYearId, t.semester),
  uniqueIndex("terms_single_current_uq").on(t.isCurrent).where(sql`${t.isCurrent}`),
  check("terms_semester_ck", sql`${t.semester} BETWEEN 1 AND 3`),
]);

export const cohorts = pgTable("cohorts", {                // "Batch 2024-A"
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  schoolType: schoolType("school_type").notNull(),
});

// Personal details, editable by the user themselves (same allow-list as firestore.rules).
export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  gender: text("gender"),
  birthDate: date("birth_date"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  church: text("church"),
  pastorName: text("pastor_name"),
  holyGhostBaptismDate: date("holy_ghost_baptism_date"),
  holyGhostBaptismLocation: text("holy_ghost_baptism_location"),
  waterBaptismDate: date("water_baptism_date"),
  waterBaptismLocation: text("water_baptism_location"),
  emergencyFirstName: text("emergency_first_name"),
  emergencyLastName: text("emergency_last_name"),
  emergencyRelationship: text("emergency_relationship"),
  emergencyContactNumber: text("emergency_contact_number"),
});

// Student-only academic placement, managed by staff.
export const studentRecords = pgTable("student_records", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  studentNo: text("student_no").unique(),
  schoolType: schoolType("school_type"),
  cohortId: integer("cohort_id").references(() => cohorts.id, { onDelete: "set null" }),
  currentYearLevel: smallint("current_year_level"),        // 1 | 2
}, (t) => [
  check("student_year_level_ck", sql`${t.currentYearLevel} IN (1, 2)`),
]);

// Replaces firstYearSchoolYear / secondYearSchoolYear on the profile.
export const studentYearLevels = pgTable("student_year_levels", {
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  yearLevel: smallint("year_level").notNull(),
  schoolYearId: integer("school_year_id").notNull().references(() => schoolYears.id, { onDelete: "restrict" }),
}, (t) => [
  primaryKey({ columns: [t.studentId, t.yearLevel] }),
  check("syl_year_level_ck", sql`${t.yearLevel} IN (1, 2)`),
]);

// ---------- Courses ----------
export const courses = pgTable("courses", {                // catalog: "Old Testament Survey"
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").unique(),
  name: text("name").notNull(),
  description: text("description"),
});

export const courseOfferings = pgTable("course_offerings", { // one Firestore `courses` doc
  id: uuid("id").primaryKey().defaultRandom(),
  legacyId: text("legacy_id").unique(),                     // Firestore doc id
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "restrict" }),
  termId: integer("term_id").notNull().references(() => terms.id, { onDelete: "restrict" }),
  yearLevel: smallint("year_level").notNull(),
  schoolType: schoolType("school_type"),
  instructorId: uuid("instructor_id").references(() => users.id, { onDelete: "set null" }),
  /** Display-only instructor name for migrated courses whose teacher has no account. */
  instructorLabel: text("instructor_label"),
  /** Credit units, shown on the transcript and used to weight the general average. */
  units: numeric("units", { precision: 3, scale: 1 }).notNull().default("3"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // replaces `trash`
  deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [
  index("offerings_term_level_idx").on(t.termId, t.yearLevel),
  index("offerings_instructor_idx").on(t.instructorId),
  check("offerings_year_level_ck", sql`${t.yearLevel} IN (1, 2)`),
  check("offerings_units_ck", sql`${t.units} > 0`),
]);

export const offeringMeetings = pgTable("offering_meetings", { // one row per weekday
  id: serial("id").primaryKey(),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "cascade" }),
  frequency: meetingFrequency("frequency").notNull(),
  weekday: smallint("weekday"),                             // 0=Sun..6=Sat, NULL for once/daily
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
}, (t) => [
  index("meetings_offering_idx").on(t.offeringId),
  unique("meetings_slot_uq").on(t.offeringId, t.weekday, t.startTime).nullsNotDistinct(),
  check("meetings_time_ck", sql`${t.endTime} > ${t.startTime}`),
  check("meetings_weekday_ck", sql`${t.weekday} BETWEEN 0 AND 6`),
]);

// ---------- Enrollment & grades ----------
export const enrollments = pgTable("enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "restrict" }),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: enrollmentStatus("status").notNull().default("enrolled"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("enrollments_offering_student_uq").on(t.offeringId, t.studentId),
  index("enrollments_student_idx").on(t.studentId),
]);

export const grades = pgTable("grades", {                  // 1:1 with enrollment
  enrollmentId: uuid("enrollment_id").primaryKey().references(() => enrollments.id, { onDelete: "cascade" }),
  value: numeric("value", { precision: 5, scale: 2 }),
  isIncomplete: boolean("is_incomplete").notNull().default(false),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [
  check("grades_value_ck", sql`${t.value} IS NULL OR ${t.value} BETWEEN 0 AND 100`),
]);

export const gradeChanges = pgTable("grade_changes", {     // replaces editHistory[]
  id: bigserial("id", { mode: "number" }).primaryKey(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
  oldValue: numeric("old_value", { precision: 5, scale: 2 }),
  newValue: numeric("new_value", { precision: 5, scale: 2 }),
  oldIncomplete: boolean("old_incomplete"),
  newIncomplete: boolean("new_incomplete"),
  reason: text("reason"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("grade_changes_enrollment_idx").on(t.enrollmentId, t.changedAt)]);

// ---------- Attendance ----------
export const attendanceSessions = pgTable("attendance_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "cascade" }),
  heldOn: date("held_on").notNull(),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [uniqueIndex("attendance_sessions_uq").on(t.offeringId, t.heldOn)]);

export const attendanceRecords = pgTable("attendance_records", {
  sessionId: uuid("session_id").notNull().references(() => attendanceSessions.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: attendanceStatus("status").notNull(),
  isExcused: boolean("is_excused").notNull().default(false),
  notes: text("notes"),
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.studentId] }),
  index("attendance_records_student_idx").on(t.studentId),
]);

// ---------- Materials, settings, audit ----------
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const materials = pgTable("materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  legacyId: text("legacy_id").unique(),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "cascade" }),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  category: materialCategory("category").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  eventDate: date("event_date"),
  eventTime: time("event_time"),
  instructions: text("instructions"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("materials_offering_category_idx").on(t.offeringId, t.category)]);

// File contents kept apart from `materials` so listing never loads file bytes.
// Uploads are capped at 800 KB (as in the app), well within Postgres and Vercel request limits.
export const materialFiles = pgTable("material_files", {
  materialId: uuid("material_id").primaryKey().references(() => materials.id, { onDelete: "cascade" }),
  content: bytea("content").notNull(),
});

// ---------- Official transcripts ----------
// An issued transcript is frozen: `content` is the transcript as it was at issue time, so later grade
// edits never change a document that was already handed out. Revoking keeps the row (verification
// then reports it as revoked).
export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  /** Public verification code (printed with a QR code). */
  code: text("code").notNull().unique(),
  purpose: text("purpose"),
  content: jsonb("content").notNull(),
  issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "set null" }),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
  revokeReason: text("revoke_reason"),
}, (t) => [index("transcripts_student_idx").on(t.studentId)]);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),                           // "features"; schemas in server/lib/settings.ts
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

// Append-only (a trigger refuses UPDATE and DELETE). Rows come from two places: the audit_row_change()
// trigger on sensitive tables (table_name, op, old, new; migration 0005) and explicit events written
// by the API ("transcript.issued", "system.reset"). actor_id has no foreign key on purpose: deleting
// an account must not erase or rewrite who did what.
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),                        // "grades.update", "transcript.issued"
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  data: jsonb("data"),
  tableName: text("table_name"),
  op: text("op"),                                          // INSERT | UPDATE | DELETE
  old: jsonb("old"),
  new: jsonb("new"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_entity_idx").on(t.entity, t.entityId),
  index("audit_at_idx").on(t.at),
  index("audit_actor_idx").on(t.actorId, t.at),
]);

// ---------- Notifications, announcements, attendance alerts (phase 2) ----------
export const notificationKind = pgEnum("notification_kind", [
  "attendance_warning", "attendance_escalation", "payment_reminder", "receipt_reviewed", "message",
  "invoice_issued", "receipt_submitted", "storage_warning",
]);

/** Per-person inbox (the bell): attendance alerts now; reminders and messages in later phases. */
export const notifications = pgTable("notifications", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: notificationKind("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),                                       // in-app page, e.g. "records"
  data: jsonb("data"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)]);

/** One row per absence threshold crossed; the key makes each alert go out exactly once. */
export const attendanceAlerts = pgTable("attendance_alerts", {
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "cascade" }),
  threshold: smallint("threshold").notNull(),
  absences: smallint("absences").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.studentId, t.offeringId, t.threshold] })]);

/** Posted by admins to roles, optionally narrowed to one batch or one course. Not copied per reader. */
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audienceRoles: userRole("audience_roles").array().notNull(),
  cohortId: integer("cohort_id").references(() => cohorts.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").references(() => courseOfferings.id, { onDelete: "cascade" }),
  pinned: boolean("pinned").notNull().default(false),
  publishAt: timestamp("publish_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [
  index("announcements_publish_idx").on(t.publishAt),
  check("announcements_audience_ck", sql`cardinality(${t.audienceRoles}) > 0`),
  check("announcements_expiry_ck", sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.publishAt}`),
]);

export const announcementReads = pgTable("announcement_reads", {
  announcementId: uuid("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.announcementId, t.userId] })]);

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

// ---------- Billing (phase 3) ----------
// Money is numeric(12,2), PHP. Invoice status and balances are derived in views (migration 0007), never
// stored. Nothing is hard-deleted: invoices and payments are voided with a reason.
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  /** "r2:receipts/…" (private Cloudflare R2 bucket) or "db:<id>" (stored in receipt_files). */
  fileKey: text("file_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  status: receiptStatus("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  /** Set when an admin deleted the file to free space; the receipt record stays. */
  fileDeletedAt: timestamp("file_deleted_at", { withTimezone: true }),
  fileDeletedBy: uuid("file_deleted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("receipts_status_idx").on(t.status, t.createdAt),
  index("receipts_stored_size_idx").on(t.sizeBytes).where(sql`${t.fileDeletedAt} IS NULL`),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

/** Receipt file contents when R2 isn't configured (kept out of receipt_uploads so lists stay light). */
export const receiptFiles = pgTable("receipt_files", {
  receiptId: uuid("receipt_id").primaryKey().references(() => receiptUploads.id, { onDelete: "cascade" }),
  content: bytea("content").notNull(),
});

export const storageAlertLevel = pgEnum("storage_alert_level", ["ok", "warn", "full"]);

/** One row: the last measurement of the receipt bucket, and the last alert level admins were told about. */
export const storageStatus = pgTable("storage_status", {
  id: smallint("id").primaryKey().default(1),
  measuredBytes: bigint("measured_bytes", { mode: "number" }),
  objectCount: integer("object_count"),
  measuredAt: timestamp("measured_at", { withTimezone: true }),
  orphansRemoved: integer("orphans_removed").notNull().default(0),
  alertLevel: storageAlertLevel("alert_level").notNull().default("ok"),
}, (t) => [check("storage_status_one_row_ck", sql`${t.id} = 1`)]);

// ---------- Chat with the school office (phase 4) ----------
// Stored here, delivered by polling (no outside service). Messages aren't audited row by row (that
// would double their size); archiving them writes one "chat.archived" audit entry instead.
export const conversationStatus = pgEnum("conversation_status", ["open", "closed"]);

/** One thread per student with the school office: a shared inbox any admin can answer. */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  status: conversationStatus("status").notNull().default("open"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  /** Who sent the latest message, for "waiting for a reply" in the inbox. */
  lastSenderRole: text("last_sender_role"),                 // "student" | "admin"
  studentLastReadAt: timestamp("student_last_read_at", { withTimezone: true }),
  adminLastReadAt: timestamp("admin_last_read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("conversations_last_message_idx").on(t.lastMessageAt)]);

export const messages = pgTable("messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("messages_conversation_idx").on(t.conversationId, t.id),
  index("messages_created_idx").on(t.createdAt),
  check("messages_body_ck", sql`char_length(${t.body}) BETWEEN 1 AND 4000`),
]);
