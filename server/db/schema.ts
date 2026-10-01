import { sql } from "drizzle-orm";
import {
  customType, pgTable, pgEnum, uuid, text, smallint, integer, boolean, date, time,
  timestamp, numeric, jsonb, bigserial, serial, primaryKey, unique, uniqueIndex, index, check,
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
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // replaces `trash`
  deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [
  index("offerings_term_level_idx").on(t.termId, t.yearLevel),
  index("offerings_instructor_idx").on(t.instructorId),
  check("offerings_year_level_ck", sql`${t.yearLevel} IN (1, 2)`),
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

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),                           // e.g. "show_student_schedule"
  value: jsonb("value").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),                        // "user.role_changed"
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  data: jsonb("data"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId)]);
