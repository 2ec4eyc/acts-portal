# ACTS Portal: Architecture Blueprint

A review of the current portal and a plan to move it from Firebase to PostgreSQL on Vercel.

**Decisions:**
- Keep the Vite + React SPA and add Vercel Functions under `/api`.
- Keep Firebase Auth. The API verifies Firebase ID tokens, and roles live in Postgres.
- Neon Postgres, with Drizzle ORM.
- Current roles only: student, teacher, admin (Day/Night Secretary, Faculty, Admin), president, vice president.

**Status of the code in this document:**
- The schema compiles and generates SQL (`drizzle-kit`), and the SQL applies cleanly to Postgres (PGlite).
- The API and migration scripts type-check under `strict`.
- The ETL scripts ran end to end on sample Firestore data, including a second run to prove re-runs are safe.

---

## 1. Feature gap analysis and code/architecture review

### 1.1 What exists today

| Area | Implemented | Where (`index.tsx`) |
|---|---|---|
| Accounts | Create/edit/archive/restore/delete users, bulk upload, password reset email, edit history | `AdminPanel`, `EditUserModal`, `BulkUploadModal` |
| Profiles | Personal, church, baptism and emergency-contact data; cropped profile photo | `ProfilePage` |
| Courses | Scheduling with recurrence (days of week, frequency), year level/semester/school year, trash | `CourseManagementPage`, `CourseCalendar` |
| Enrollment | By year level + batch + school year; courses copied into each student's `grades[]` | `EnrollModal`, `syncStudentToCourses` |
| Grades | Per course, incomplete flag, release date, GPA, PDF export | `GradesModal`, `TeacherGradesView`, `SubmitGrades`, `StudentGradesView` |
| Attendance | Per course per date, present/absent, excused, notes | `AttendanceTracker` |
| Materials | Teacher uploads (notes/exams/activities) with event date and instructions | `TeacherUploadFilesView` |
| Schedule | Calendar for students and staff | `StudentCalendarView`, `CalendarDayModal` |
| Sessions | One active session per account (client-enforced) | `App` |

### 1.2 Missing features (prioritized for a two-year Bible school)

**P1: needed for a real academic record**
- **Admissions/intake.** An application form, document upload, review queue and accept/reject. `status: 'Pending'` exists, but nothing feeds it. Accepting an applicant should create the user and their enrollment in one step.
- **Official transcript (TOR).** Generated from `grades` plus `terms`, with registrar sign-off, a locked/released state, and a verification code or QR on the PDF. Today's PDF is a screenshot (`html2canvas`) of the current view.
- **Grading policy.** Configurable scale (numeric to letter/remarks), passing mark, incomplete deadline, and grade locking after release. Changes after release need a reason (`grade_changes.reason`).
- **Graduation clearance.** Required courses per year level, completion check and clearance status.
- **Attendance rules.** Late status, an absence threshold per course, and alerts when a student approaches it.

**P2: operations**
- **Fee billing.** Fee schedule per program and term, invoices, partial payments/receipts, balances on the student dashboard, and a hold on transcripts while a balance is unpaid. Start with manual payment recording; add a local payment gateway later.
- **Scheduling.** Rooms, and conflict detection for instructors, rooms and cohorts.
- **Syllabus tracking.** Lessons per offering with planned and delivered dates. Teachers mark progress; admins see coverage.
- **Assignments.** Students submit files against an `activity` material; teachers grade and give feedback. This feeds grade components.

**P3: communication**
- **Announcements.** Targeted by role, cohort, school type or offering, with pinning and expiry.
- **Messaging.** Staff↔student threads (course-scoped), with read receipts.
- **Notifications.** Email (Resend/Postmark) and in-app for grade release, new materials, schedule changes and absence alerts.

**Cross-cutting**
- An audit log for every privileged write (table included in the schema).
- Reports: enrollment per term, grade distribution, attendance rates.
- CSV export, and documented backup/restore.

### 1.3 Security and RBAC findings

Fixed in this branch (`firestore.rules`, commit "Close Firestore privilege-escalation holes"). All were reproduced against the old rules in the Firestore emulator; the new rules pass 25/25 checks:

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | A student could set their own `role: 'admin'` and rewrite their own `grades` | **Critical** | Owners may only change a whitelist of personal fields |
| 2 | Anyone who signs up could self-create an **admin** profile (the web API key is public, by design) | **Critical** | Self-created profiles must be `student`/`Active` with `grades: []` |
| 3 | Teachers and executives could rewrite any user doc, including `role` | High | Teachers: only `grades`/`editHistory` on students. Executives: anything except `role`/`uid` |
| 4 | Every signed-in user could read every profile (birth dates, addresses, emergency contacts) | High | Read limited to owner and staff |
| 5 | Any signed-in user could create, overwrite or delete anyone's uploaded files | High | Only staff can upload; only the uploader or an admin can change or delete |
| 6 | `/api/admin/update-email` wrote to a caller-chosen collection | Medium | Whitelisted to `users`/`archived_users` |

> **Action required:** these rules take effect only after they're published in the Firebase console (Firestore → Rules) or with `firebase deploy --only firestore:rules`. Also confirm that the deployed rules actually match this file.

Remaining issues, which the Postgres migration resolves structurally:
- **Permission checks live in the UI** (for example `canEditGrade` at `index.tsx:1442` and the sidebar gating). Firestore rules can't express "a teacher may only grade their own course", because grades are embedded in the student doc. The API (§2.6) enforces this server-side.
- **Grades embedded in `users/{uid}.grades[]`.** Every write rewrites the whole array, so two staff saving at once lose one another's changes. There's also no per-grade history, and the doc grows without limit.
- **Base64 files in Firestore** (`uploaded_files.fileData`, `photoURL`). Documents are capped at 1 MiB, so large PDFs fail, and every list query downloads every file. These move to Vercel Blob.
- **Hardcoded admin emails** in `firestore.rules`, `server.ts` (two emails) and `index.tsx` (`HIDDEN_ADMIN_EMAILS`), and they don't match each other. Replace them with a seeded admin row plus a break-glass procedure.
- **Two Firebase projects.** `server.ts` uses `gen-lang-client-0286347355` (`firebase-applet-config.json`), while `index.tsx` falls back to `acts-bible-school-portal`. The Admin SDK would reject the client's ID tokens, so the Express endpoints can't work as deployed. They're also unused (the client makes no `fetch` calls).
- **Single-session enforcement is client-side** (`currentSessionId` in the user doc), so it's trivially bypassed. Server-side replacement: `revokeRefreshTokens(uid)` on login, plus `verifyIdToken(token, true)`.
- **Maintainability.** The whole app is one 7,000-line `index.tsx`. Tailwind loads from a CDN (not for production). There are stray one-off scripts (`patch_*.sh`, `fix*.cjs`, `tmp.txt`) and no `.gitignore`.

### 1.4 Target RBAC model

Authorization moves to the API. Every handler declares a permission, and `withAuth` (§2.6) checks it against the role from Postgres, never from the client.

| Permission | student | teacher | president / VP | admin |
|---|:-:|:-:|:-:|:-:|
| Read own profile, grades, attendance, schedule | ✓ | ✓ | ✓ | ✓ |
| Edit own personal fields | ✓ | ✓ | ✓ | ✓ |
| `users:read` (staff directory, student records) | | own students | ✓ | ✓ |
| `users:write` (create/edit/archive accounts) | | | ✓ | ✓ |
| `users:change_role` | | | | ✓ |
| `grades:write_own_offerings` | | ✓ | ✓ | ✓ |
| `grades:write_any` | | | ✓ | ✓ |
| `attendance:write` | | own offerings* | ✓ | ✓ |
| `offerings:write` (courses, schedule, enrollment) | | | | ✓ |
| `materials:write_own` | | ✓ | | ✓ |

\* Teachers currently can't take attendance in the UI. Enabling it for their own offerings is a one-line permission change.

`staff_category` (Day/Night Secretary, Faculty) is kept for display and for scoping. For example, a Night Secretary could be limited to `school_type = 'night'` students with a `WHERE` clause in the handler.

---

## 2. Migration plan: Firebase → PostgreSQL

### 2.1 ORM choice: Drizzle ORM + drizzle-kit

| | Drizzle | Prisma |
|---|---|---|
| Serverless cold start | Tiny, pure-TS runtime | Heavier client, plus a generate step at build time |
| Pooling (PgBouncer/Neon) | Works with `pg`, Neon serverless and PGlite drivers | Works, but needs driver-adapter configuration |
| Queries | SQL-shaped (joins, `FOR UPDATE`, `ON CONFLICT`) | Higher-level, and harder to hand-tune |
| Migrations | Generated SQL files you review and commit | Generated SQL, similar |

For a small team on Vercel Functions, Drizzle's SQL-first style and small footprint are the better fit. The schema below is plain TypeScript, so the frontend can share inferred types with the API.

### 2.2 From documents to 3NF

| Firestore | Problem | PostgreSQL |
|---|---|---|
| `users` + `archived_users` | Same entity in two collections; archive = copy + delete | `users.status` + `archived_at` (CHECK keeps them consistent) |
| `users.{birthDate, church, emergency…}` | Student-only data on every account | `student_profiles` (1:1) |
| `users.firstYearSchoolYear/secondYearSchoolYear` | Repeating group in columns | `student_year_levels` (student × year level → school year) |
| `users.batchName` (free text) | Typos create "new" batches | `cohorts` |
| `courses` (one doc per class instance) | Course identity and term mixed together; `professor` stored as a name string | `courses` (catalog) + `course_offerings` (term, year level, `instructor_id` FK) |
| `courses.{date, startTime, daysOfWeek[]…}` | Array inside the doc | `offering_meetings` (one row per weekday) |
| `trash` | Soft delete by copying the doc | `course_offerings.deleted_at` |
| `users.grades[]` | Enrollment and grade embedded in the student | `enrollments` (student × offering, unique) + `grades` (1:1) |
| `users.editHistory[]` | Unbounded, free-text | `grade_changes` (typed old/new values) + `audit_log` |
| `attendance/{course_date_student}` | Session identity encoded in the id | `attendance_sessions` (offering × date) + `attendance_records` |
| `uploaded_files.fileData` (base64) | 1 MiB cap, bloats queries | `materials.blob_url` (Vercel Blob) |
| `settings` / AppSettings | `currentSchoolYear`, `publishCurrentGrades` | `terms.is_current` (unique partial index), `terms.grades_published`, `app_settings` (k/v) |

### 2.3 Schema (`db/schema.ts`)

> **Implemented** in `server/db/schema.ts`, which is the source of truth; endpoints are listed in `docs/API.md`. Changes from the version below: uploaded files are stored in Postgres (`material_files`, max 800 KB) instead of Vercel Blob, so downloads go through the API's access checks and no extra service is needed; and personal details apply to staff too, so `student_profiles` became `user_profiles` (personal/church/emergency fields, for every user) plus `student_records` (student number, school type, cohort, year level).
```ts
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, uuid, text, smallint, integer, boolean, date, time,
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

export const studentProfiles = pgTable("student_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  studentNo: text("student_no").unique(),
  schoolType: schoolType("school_type"),
  cohortId: integer("cohort_id").references(() => cohorts.id, { onDelete: "set null" }),
  currentYearLevel: smallint("current_year_level"),        // 1 | 2
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
export const materials = pgTable("materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  legacyId: text("legacy_id").unique(),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "cascade" }),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  category: materialCategory("category").notNull(),
  fileName: text("file_name").notNull(),
  blobUrl: text("blob_url").notNull(),                     // Vercel Blob, not base64
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  eventDate: date("event_date"),
  eventTime: time("event_time"),
  instructions: text("instructions"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("materials_offering_category_idx").on(t.offeringId, t.category)]);

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
```

Design notes:
- **UUID primary keys** for anything exposed in URLs. Small lookup tables use `serial`.
- **`ON DELETE` rules** are deliberate:
  - `restrict` where history must survive (you can't delete a student who has enrollments; archive them instead).
  - `cascade` for owned children (meetings, attendance records).
  - `set null` for "who did it" columns.
- **Case-insensitive unique email** via `lower(email)`, so `A@x.com` and `a@x.com` can't both exist.
- **Only one current term**, enforced by a partial unique index.
- **Known limitation:** `attendance_records` doesn't prove that the student is enrolled in the session's offering. Enforce that in the API (the handler inserts only enrolled students). Enforcing it with an FK would mean denormalizing `offering_id` into the table.

<details>
<summary><b>Generated SQL DDL</b> (<code>drizzle-kit generate</code> output, <code>db/migrations/0000_init.sql</code>)</summary>

```sql
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late');
CREATE TYPE "public"."enrollment_status" AS ENUM('enrolled', 'dropped', 'completed');
CREATE TYPE "public"."material_category" AS ENUM('notes', 'exams', 'activity');
CREATE TYPE "public"."meeting_frequency" AS ENUM('once', 'daily', 'weekly', 'biweekly', 'monthly');
CREATE TYPE "public"."school_type" AS ENUM('day', 'night');
CREATE TYPE "public"."staff_category" AS ENUM('day_secretary', 'night_secretary', 'faculty', 'admin');
CREATE TYPE "public"."user_role" AS ENUM('student', 'teacher', 'admin', 'president', 'vice_president');
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'archived');
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);

CREATE TABLE "attendance_records" (
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"is_excused" boolean DEFAULT false NOT NULL,
	"notes" text,
	CONSTRAINT "attendance_records_session_id_student_id_pk" PRIMARY KEY("session_id","student_id")
);

CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"data" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "cohorts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"school_type" "school_type" NOT NULL,
	CONSTRAINT "cohorts_name_unique" UNIQUE("name")
);

CREATE TABLE "course_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"course_id" uuid NOT NULL,
	"term_id" integer NOT NULL,
	"year_level" smallint NOT NULL,
	"school_type" "school_type",
	"instructor_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_offerings_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "offerings_year_level_ck" CHECK ("course_offerings"."year_level" IN (1, 2))
);

CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "courses_code_unique" UNIQUE("code")
);

CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'enrolled' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "grade_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"changed_by" uuid,
	"old_value" numeric(5, 2),
	"new_value" numeric(5, 2),
	"old_incomplete" boolean,
	"new_incomplete" boolean,
	"reason" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "grades" (
	"enrollment_id" uuid PRIMARY KEY NOT NULL,
	"value" numeric(5, 2),
	"is_incomplete" boolean DEFAULT false NOT NULL,
	"released_at" timestamp with time zone,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grades_value_ck" CHECK ("grades"."value" IS NULL OR "grades"."value" BETWEEN 0 AND 100)
);

CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"offering_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"category" "material_category" NOT NULL,
	"file_name" text NOT NULL,
	"blob_url" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"event_date" date,
	"event_time" time,
	"instructions" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_legacy_id_unique" UNIQUE("legacy_id")
);

CREATE TABLE "offering_meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"offering_id" uuid NOT NULL,
	"frequency" "meeting_frequency" NOT NULL,
	"weekday" smallint,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "meetings_slot_uq" UNIQUE NULLS NOT DISTINCT("offering_id","weekday","start_time"),
	CONSTRAINT "meetings_time_ck" CHECK ("offering_meetings"."end_time" > "offering_meetings"."start_time"),
	CONSTRAINT "meetings_weekday_ck" CHECK ("offering_meetings"."weekday" BETWEEN 0 AND 6)
);

CREATE TABLE "school_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	CONSTRAINT "school_years_label_unique" UNIQUE("label")
);

CREATE TABLE "student_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"student_no" text,
	"school_type" "school_type",
	"cohort_id" integer,
	"current_year_level" smallint,
	"gender" text,
	"birth_date" date,
	"address" text,
	"city" text,
	"province" text,
	"postal_code" text,
	"church" text,
	"pastor_name" text,
	"holy_ghost_baptism_date" date,
	"holy_ghost_baptism_location" text,
	"water_baptism_date" date,
	"water_baptism_location" text,
	"emergency_first_name" text,
	"emergency_last_name" text,
	"emergency_relationship" text,
	"emergency_contact_number" text,
	CONSTRAINT "student_profiles_student_no_unique" UNIQUE("student_no"),
	CONSTRAINT "student_year_level_ck" CHECK ("student_profiles"."current_year_level" IN (1, 2))
);

CREATE TABLE "student_year_levels" (
	"student_id" uuid NOT NULL,
	"year_level" smallint NOT NULL,
	"school_year_id" integer NOT NULL,
	CONSTRAINT "student_year_levels_student_id_year_level_pk" PRIMARY KEY("student_id","year_level"),
	CONSTRAINT "syl_year_level_ck" CHECK ("student_year_levels"."year_level" IN (1, 2))
);

CREATE TABLE "terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_year_id" integer NOT NULL,
	"semester" smallint NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"grades_published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "terms_semester_ck" CHECK ("terms"."semester" BETWEEN 1 AND 3)
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"photo_url" text,
	"contact_number" text,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"staff_category" "staff_category",
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "users_archived_ck" CHECK (("users"."status" = 'archived') = ("users"."archived_at" IS NOT NULL))
);

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "grades" ADD CONSTRAINT "grades_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "grades" ADD CONSTRAINT "grades_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "materials" ADD CONSTRAINT "materials_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "materials" ADD CONSTRAINT "materials_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "offering_meetings" ADD CONSTRAINT "offering_meetings_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "student_year_levels" ADD CONSTRAINT "student_year_levels_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "student_year_levels" ADD CONSTRAINT "student_year_levels_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "attendance_records_student_idx" ON "attendance_records" USING btree ("student_id");
CREATE UNIQUE INDEX "attendance_sessions_uq" ON "attendance_sessions" USING btree ("offering_id","held_on");
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");
CREATE INDEX "offerings_term_level_idx" ON "course_offerings" USING btree ("term_id","year_level");
CREATE INDEX "offerings_instructor_idx" ON "course_offerings" USING btree ("instructor_id");
CREATE UNIQUE INDEX "enrollments_offering_student_uq" ON "enrollments" USING btree ("offering_id","student_id");
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_id");
CREATE INDEX "grade_changes_enrollment_idx" ON "grade_changes" USING btree ("enrollment_id","changed_at");
CREATE INDEX "materials_offering_category_idx" ON "materials" USING btree ("offering_id","category");
CREATE INDEX "meetings_offering_idx" ON "offering_meetings" USING btree ("offering_id");
CREATE UNIQUE INDEX "terms_year_semester_uq" ON "terms" USING btree ("school_year_id","semester");
CREATE UNIQUE INDEX "terms_single_current_uq" ON "terms" USING btree ("is_current") WHERE "terms"."is_current";
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));
CREATE INDEX "users_role_status_idx" ON "users" USING btree ("role","status");
```
</details>

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
});
```

### 2.4 Data export → transform → load

The pipeline lives in `scripts/migrate/` and has three stages:

```
Firestore ──export.ts──▶ migration-data/*.json ──transform.ts──▶ typed rows + problem report ──load.ts──▶ Postgres (1 transaction)
```

**Principles:**
- **Deterministic IDs.** UUIDs are derived from Firestore ids (`legacyUuid`), so re-running the load inserts nothing new (`ON CONFLICT DO NOTHING`). This was verified: two consecutive loads gave identical row counts.
- **Validate, don't guess.** Every doc is parsed with zod. Anything that doesn't fit goes to a problem report, for example "grade stu1/gone: course no longer exists" or "users/bad: Invalid email address". It is never silently dropped.
- **Transform is pure.** The only I/O is reading the JSON dump, so it can be unit-tested with fixture files.
- **`migration-data/` contains personal data.** Add it to `.gitignore`, keep it off shared drives, and delete it after cutover.

**`scripts/migrate/export.ts`** needs a service-account key for the project the client actually uses. Download it from Firebase console → Project settings → Service accounts, and never commit it.

```ts
// Usage: GOOGLE_APPLICATION_CREDENTIALS=./sa.json FIRESTORE_DB_ID=... npx tsx scripts/migrate/export.ts
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { mkdirSync, writeFileSync } from "node:fs";

const COLLECTIONS = ["users", "archived_users", "courses", "trash", "attendance", "uploaded_files", "settings"];

initializeApp({ credential: applicationDefault() });
const fs = process.env.FIRESTORE_DB_ID ? getFirestore(process.env.FIRESTORE_DB_ID) : getFirestore();

// Firestore Timestamps -> ISO strings so the dump is plain JSON.
const plain = (v: unknown): unknown =>
  v instanceof Timestamp ? v.toDate().toISOString()
  : Array.isArray(v) ? v.map(plain)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  : v;

mkdirSync("migration-data", { recursive: true });
for (const name of COLLECTIONS) {
  const snap = await fs.collection(name).get();
  const docs = snap.docs.map((d) => ({ _id: d.id, ...(plain(d.data()) as object) }));
  writeFileSync(`migration-data/${name}.json`, JSON.stringify(docs, null, 2));
  console.log(`${name}: ${docs.length}`);
}
```

**`scripts/migrate/transform.ts`** (the student personal fields not shown are copied 1:1):

```ts
// Pure Firestore-JSON -> relational rows. No I/O besides reading the dump, so it is unit-testable.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type * as s from "../../db/schema";

type Row<T extends { $inferInsert: unknown }> = T["$inferInsert"];

// Deterministic UUID from a legacy key: re-running the migration produces the same ids (idempotent loads).
export const legacyUuid = (ns: string, key: string) => {
  const h = createHash("sha1").update(`${ns}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const FsGrade = z.object({
  id: z.string(), courseName: z.string().optional(),
  gradeValue: z.union([z.number(), z.literal(""), z.string()]).optional(),
  isIncomplete: z.boolean().optional(), dateReleased: z.string().optional(),
});
const FsUser = z.object({
  _id: z.string(), uid: z.string().optional(), email: z.string().email(),
  firstName: z.string().optional(), middleName: z.string().optional(), lastName: z.string().optional(),
  fullName: z.string().optional(), photoURL: z.string().optional(), contactNumber: z.string().optional(),
  role: z.enum(["student", "admin", "vice president", "president", "teacher"]),
  adminCategory: z.enum(["Day Secretary", "Night Secretary", "Faculty", "Admin"]).optional(),
  status: z.enum(["Active", "Pending", "Archived"]).default("Active"),
  studentId: z.string().optional(), batchName: z.string().optional(),
  schoolType: z.enum(["Day School", "Night School"]).optional(),
  yearLevel: z.enum(["1st Year", "2nd Year"]).optional(),
  firstYearSchoolYear: z.string().optional(), secondYearSchoolYear: z.string().optional(),
  birthDate: z.string().optional(),
  grades: z.array(FsGrade).default([]),
  archivedAt: z.string().optional(), createdAt: z.string().optional(),
}).passthrough();
const FsCourse = z.object({
  _id: z.string(), name: z.string(), professor: z.string().optional(), instructorId: z.string().optional(),
  date: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(),
  isRecurring: z.boolean().optional(), daysOfWeek: z.array(z.string()).optional(),
  frequency: z.enum(["Daily", "Weekly", "Bi-weekly", "Monthly"]).optional(),
  yearLevel: z.enum(["1st Year", "2nd Year"]),
  semester: z.enum(["1st Semester", "2nd Semester", "3rd Semester"]),
  schoolYear: z.string().optional(), archivedAt: z.string().optional(),
});
const FsAttendance = z.object({
  _id: z.string(), courseId: z.string(), date: z.string(), studentId: z.string(),
  status: z.enum(["present", "absent"]), isExcused: z.boolean().optional(), notes: z.string().optional(),
});

const load = <T>(name: string, schema: z.ZodType<T>, problems: string[]) =>
  (JSON.parse(readFileSync(`migration-data/${name}.json`, "utf8")) as unknown[]).flatMap((raw) => {
    const r = schema.safeParse(raw);
    if (!r.success) { problems.push(`${name}/${(raw as { _id: string })._id}: ${r.error.issues[0].message}`); return []; }
    return [r.data];
  });

const ROLE = { student: "student", admin: "admin", teacher: "teacher", president: "president", "vice president": "vice_president" } as const;
const CATEGORY = { "Day Secretary": "day_secretary", "Night Secretary": "night_secretary", Faculty: "faculty", Admin: "admin" } as const;
const WEEKDAY: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const yearLevel = (y: string) => (y === "2nd Year" ? 2 : 1);
const semester = (s: string) => Number(s[0]);
const ts = (v?: string | null) => (v ? new Date(v) : null);
const isoDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

export function transform() {
  const problems: string[] = [];
  const active = load("users", FsUser, problems);
  const archived = load("archived_users", FsUser, problems).map((u) => ({ ...u, status: "Archived" as const }));
  const courses = [...load("courses", FsCourse, problems), ...load("trash", FsCourse, problems).map((c) => ({ ...c, _trashed: true }))];
  const attendance = load("attendance", FsAttendance, problems);

  const userId = new Map<string, string>(); // firebase uid -> uuid
  const out = {
    users: [] as Row<typeof s.users>[], studentProfiles: [] as Row<typeof s.studentProfiles>[],
    studentYearLevels: [] as Row<typeof s.studentYearLevels>[],
    schoolYears: new Map<string, number>(), terms: new Map<string, { id: number; schoolYearId: number; semester: number }>(),
    cohorts: new Map<string, number>(), courses: new Map<string, { id: string; name: string }>(), // key: lower(name)
    offerings: [] as Row<typeof s.courseOfferings>[], meetings: [] as Row<typeof s.offeringMeetings>[],
    enrollments: [] as Row<typeof s.enrollments>[], grades: [] as Row<typeof s.grades>[],
    sessions: new Map<string, Row<typeof s.attendanceSessions>>(), records: [] as Row<typeof s.attendanceRecords>[], problems,
  };
  const schoolYearId = (label: string) => out.schoolYears.get(label) ?? (out.schoolYears.set(label, out.schoolYears.size + 1), out.schoolYears.size);
  const termId = (sy: string, sem: number) => {
    const key = `${sy}#${sem}`;
    if (!out.terms.has(key)) out.terms.set(key, { id: out.terms.size + 1, schoolYearId: schoolYearId(sy), semester: sem });
    return out.terms.get(key)!.id;
  };

  // users + archived_users -> users (+ student_profiles). Active wins if a uid is in both.
  const seen = new Set<string>();
  for (const u of [...active, ...archived]) {
    const uid = u.uid ?? u._id;
    if (seen.has(uid)) { problems.push(`duplicate uid ${uid} in users and archived_users (kept active)`); continue; }
    seen.add(uid);
    const id = legacyUuid("user", uid);
    userId.set(uid, id);
    const [first, ...rest] = (u.fullName ?? u.email.split("@")[0]).split(" ");
    out.users.push({
      id, firebaseUid: uid, email: u.email.trim(),
      firstName: u.firstName ?? first, middleName: u.middleName ?? null, lastName: u.lastName ?? (rest.join(" ") || "-"),
      photoUrl: u.photoURL ?? null, contactNumber: u.contactNumber ?? null,
      role: ROLE[u.role], staffCategory: u.adminCategory ? CATEGORY[u.adminCategory] : null,
      status: ({ Active: "active", Pending: "pending", Archived: "archived" } as const)[u.status],
      archivedAt: u.status === "Archived" ? (ts(u.archivedAt) ?? new Date()) : null,
    });
    if (u.role !== "student") continue;
    const cohortId = u.batchName
      ? out.cohorts.get(u.batchName) ?? (out.cohorts.set(u.batchName, out.cohorts.size + 1), out.cohorts.size)
      : null;
    out.studentProfiles.push({
      userId: id, studentNo: u.studentId || null, cohortId,
      schoolType: u.schoolType === "Night School" ? "night" : u.schoolType ? "day" : null,
      currentYearLevel: u.yearLevel ? yearLevel(u.yearLevel) : null, birthDate: isoDate(u.birthDate),
      // ...remaining personal/church/emergency fields copied 1:1 (camelCase -> column)
    });
    if (u.firstYearSchoolYear) out.studentYearLevels.push({ studentId: id, yearLevel: 1, schoolYearId: schoolYearId(u.firstYearSchoolYear) });
    if (u.secondYearSchoolYear) out.studentYearLevels.push({ studentId: id, yearLevel: 2, schoolYearId: schoolYearId(u.secondYearSchoolYear) });
  }

  // courses + trash -> courses (catalog by name) + course_offerings + offering_meetings
  const offeringId = new Map<string, string>();
  for (const c of courses) {
    const courseKey = c.name.trim().toLowerCase();
    if (!out.courses.has(courseKey)) out.courses.set(courseKey, { id: legacyUuid("course", courseKey), name: c.name.trim() });
    const courseId = out.courses.get(courseKey)!.id;
    const id = legacyUuid("offering", c._id);
    offeringId.set(c._id, id);
    if (!c.schoolYear) problems.push(`course ${c._id}: no schoolYear, assigned to "unknown"`);
    out.offerings.push({
      id, legacyId: c._id, courseId, termId: termId(c.schoolYear ?? "unknown", semester(c.semester)),
      yearLevel: yearLevel(c.yearLevel),
      instructorId: c.instructorId ? userId.get(c.instructorId) ?? null : null, // `professor` name-only rows: resolve manually
      deletedAt: "_trashed" in c ? (ts(c.archivedAt) ?? new Date()) : null,
    });
    if (c.startTime && c.endTime && isoDate(c.date)) {
      const days = c.isRecurring && c.daysOfWeek?.length ? c.daysOfWeek.map((d) => WEEKDAY[d]) : [null];
      for (const weekday of days) out.meetings.push({
        offeringId: id, weekday, startsOn: isoDate(c.date)!, startTime: c.startTime, endTime: c.endTime,
        frequency: !c.isRecurring ? "once" : ({ Daily: "daily", Weekly: "weekly", "Bi-weekly": "biweekly", Monthly: "monthly" } as const)[c.frequency ?? "Weekly"],
      });
    }
  }

  // users[].grades[] -> enrollments + grades (the array entry id is the course doc id)
  for (const u of [...active, ...archived]) {
    const studentId = userId.get(u.uid ?? u._id);
    if (!studentId || u.role !== "student") continue;
    for (const g of u.grades) {
      const off = offeringId.get(g.id);
      if (!off) { problems.push(`grade ${u._id}/${g.id}: course no longer exists`); continue; }
      const enrollmentId = legacyUuid("enrollment", `${g.id}:${u._id}`);
      out.enrollments.push({ id: enrollmentId, offeringId: off, studentId });
      const value = typeof g.gradeValue === "number" ? g.gradeValue.toFixed(2) : g.gradeValue ? Number(g.gradeValue).toFixed(2) : null;
      if (value !== null || g.isIncomplete || g.dateReleased) {
        out.grades.push({ enrollmentId, value, isIncomplete: g.isIncomplete ?? false, releasedAt: ts(g.dateReleased) });
      }
    }
  }

  // attendance/{course_date_student} -> attendance_sessions + attendance_records
  for (const a of attendance) {
    const off = offeringId.get(a.courseId), student = userId.get(a.studentId);
    if (!off || !student) { problems.push(`attendance ${a._id}: unknown course or student`); continue; }
    const key = `${a.courseId}#${a.date}`;
    const sessionId = legacyUuid("session", key);
    out.sessions.set(key, { id: sessionId, offeringId: off, heldOn: a.date });
    out.records.push({ sessionId, studentId: student, status: a.status, isExcused: a.isExcused ?? false, notes: a.notes || null });
  }
  return out;
}
```

**`scripts/migrate/load.ts`**:

```ts
// Usage: DATABASE_URL=<unpooled> npx tsx scripts/migrate/load.ts
// Loads everything in ONE transaction; ON CONFLICT DO NOTHING makes re-runs safe.
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "../../db/schema";
import { transform } from "./transform";

type Rows<T extends { $inferInsert: unknown }> = T["$inferInsert"][];

export async function loadAll(db: PgDatabase<PgQueryResultHKT, typeof s>) {
  const t = transform();
  if (t.problems.length) console.warn(`${t.problems.length} problems:\n` + t.problems.join("\n"));

  await db.transaction(async (tx) => {
    const insert = async <T extends typeof s.users | typeof s.schoolYears | typeof s.terms | typeof s.cohorts
      | typeof s.studentProfiles | typeof s.studentYearLevels | typeof s.courses | typeof s.courseOfferings
      | typeof s.offeringMeetings | typeof s.enrollments | typeof s.grades | typeof s.attendanceSessions
      | typeof s.attendanceRecords>(table: T, rows: Rows<T>) => {
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(table).values(rows.slice(i, i + 500) as never).onConflictDoNothing();
      }
    };
    // Parents before children (FK order).
    await insert(s.schoolYears, [...t.schoolYears].map(([label, id]) => ({ id, label })));
    await insert(s.terms, [...t.terms.values()]);
    await insert(s.cohorts, [...t.cohorts].map(([name, id]) => ({ id, name, schoolType: "day" as const })));
    await insert(s.users, t.users);
    await insert(s.studentProfiles, t.studentProfiles);
    await insert(s.studentYearLevels, t.studentYearLevels);
    await insert(s.courses, [...t.courses.values()]);
    await insert(s.courseOfferings, t.offerings);
    await insert(s.offeringMeetings, t.meetings);
    await insert(s.enrollments, t.enrollments);
    await insert(s.grades, t.grades);
    await insert(s.attendanceSessions, [...t.sessions.values()]);
    await insert(s.attendanceRecords, t.records);
    // Explicit ids were inserted into serial columns: move the sequences past them.
    for (const table of ["school_years", "terms", "cohorts"]) {
      await tx.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT max(id) FROM ${table}), 0) + 1, false)`));
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import("../../lib/db");
  await loadAll(db);
  console.log("Loaded.");
  process.exit(0);
}
```

**Materials (base64 → Vercel Blob)** run as a separate, resumable step, because each file is a network call:

```ts
import { put } from "@vercel/blob";
// for each uploaded_files doc:
const [, meta, b64] = doc.fileData.match(/^data:([^;]+);base64,(.+)$/)!;
const blob = await put(`materials/${doc._id}/${doc.fileName}`, Buffer.from(b64, "base64"), {
  access: "public", contentType: meta, addRandomSuffix: true,
});
// insert into materials (legacy_id = doc._id, blob_url = blob.url, ...) ON CONFLICT (legacy_id) DO NOTHING
```

Profile photos (`photoURL` data URLs) follow the same pattern, into `avatars/`.

> `access: "public"` URLs are unguessable but not secret. If exams must stay private until their `event_date`, store them as private blobs and serve them through an `/api/materials/:id` route that checks enrollment and date.

**Verification (`scripts/migrate/verify.ts`)** must pass before cutover:
1. Row counts: users = users + archived_users − duplicates; enrollments = Σ `grades[]` − orphans; attendance_records = attendance docs − orphans.
2. For each student, a checksum of (course, grade value) from Firestore equals the checksum from `grades ⋈ enrollments`.
3. Spot-check 10 students by hand in the new UI against the old one.
4. Every entry in the problem report is resolved or explicitly accepted.

**Accounts-only start (chosen for this cutover).** Pass `--accounts-only` to `export.ts`, `load.ts` and `verify.ts` (`npm run migrate:load -- --accounts-only`). Only `users` and `archived_users` are exported and loaded: every account keeps its Firebase login, role, profile, student number, year level, batch and school year. Courses, enrollments, grades, grade history, attendance and uploaded files are not carried over, so admins recreate the courses in the portal after cutover and students are enrolled automatically by year level, batch and school year. The Firestore data stays available read-only during the rollback window.

**Cutover runbook.** The dataset is small (hundreds of users), so a one-time cutover is simpler and safer than running both databases in parallel:
1. *(Optional)* Rehearse steps 3–6 against a Neon *branch*, such as a PR preview's.
2. Announce a window (about 1 hour, outside class time).
3. **Freeze writes:** publish `firestore.freeze.rules` (the current read rules, `allow write: if false;` everywhere).
4. From the release branch, with `DATABASE_URL_UNPOOLED` set to production's unpooled URL: run `npm run db:migrate` **first** (production only has the migrations already merged to `main`, and the load writes columns added by later ones), then `export.ts`, `load.ts` and `verify.ts` (all three with `--accounts-only` for the accounts-only start).
5. Merge the release PR so Vercel deploys the API-backed frontend; its build re-runs migrations as a no-op.
6. Smoke-test as each role: student, teacher, secretary, president, admin.
7. Keep Firestore read-only for 30 days as the rollback path. Rolling back means re-publishing the old rules and redeploying the previous Vercel deployment (instant rollback). Then export a final archive and delete the Firestore data.

### 2.5 Authentication: keep Firebase Auth

| Option | Verdict |
|---|---|
| **Keep Firebase Auth + Postgres (recommended)** | No forced password resets, and login UX is unchanged. The API verifies ID tokens with the Admin SDK; `users.firebase_uid` links the two. The free tier covers this scale. |
| Better Auth (self-hosted, in Postgres) | A good later step if you want to drop Google entirely. Firebase exports scrypt password hashes (`firebase auth:export`) that can be verified on first login and rehashed. |
| Supabase Auth | Only makes sense if Supabase is also the database. It adds a second migration of the same users. |
| Lucia | **Deprecated** (in 2025 the maintainers turned it into a learning resource rather than a maintained library). Don't start new work on it. |
| NextAuth / Auth.js | Built around Next.js. Awkward in a Vite SPA with plain functions. |

How it works with Firebase Auth kept:
- **Client:** unchanged sign-in. Each API call sends `Authorization: Bearer ${await auth.currentUser.getIdToken()}`. The SDK refreshes the token automatically.
- **Server:** `verifyIdToken(token, /* checkRevoked */ true)` → look up `users` by `firebase_uid` → check `status` and permission (`lib/auth.ts` below).
- **Account creation moves server-side.** `POST /api/users` calls `getAuth().createUser()` and inserts the row in one handler. This replaces the "secondary Firebase app" trick in `AdminPanel` (`index.tsx:2879`), which briefly signs in as the new user in the browser.
- **Roles are never stored in Firebase custom claims.** Postgres is the single source of truth, so a role change applies on the next request.
- **Single session:** on login, call `POST /api/session`, which runs `revokeRefreshTokens(uid)`. Other devices' tokens then fail `checkRevoked` within the hour, or immediately on their next refresh.

### 2.6 API layer: code

**`lib/db.ts`:** one connection pool per function instance, reused across invocations:

```ts
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";

// One pool per function instance, reused across invocations (Fluid compute).
// DATABASE_URL is Neon's *pooled* (-pooler) connection string.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,                    // per instance; PgBouncer multiplexes to Postgres
  idleTimeoutMillis: 5_000,  // release idle clients before the instance suspends
});
attachDatabasePool(pool);    // closes idle clients cleanly when Vercel suspends the instance

export const db = drizzle(pool, { schema });
```

**`lib/auth.ts`:** token verification plus the permission matrix:

```ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { eq } from "drizzle-orm";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./db";
import { users } from "../db/schema";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export type Role = typeof users.$inferSelect["role"];
export type Permission =
  | "users:read" | "users:write" | "users:change_role"
  | "grades:write_own_offerings" | "grades:write_any"
  | "attendance:write" | "offerings:write" | "materials:write_own";

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  student: [],
  teacher: ["grades:write_own_offerings", "materials:write_own"],
  president: ["users:read", "users:write", "grades:write_any", "attendance:write"],
  vice_president: ["users:read", "users:write", "grades:write_any", "attendance:write"],
  admin: ["users:read", "users:write", "users:change_role", "grades:write_any",
          "attendance:write", "offerings:write", "materials:write_own"],
};

export const can = (role: Role, p: Permission) => PERMISSIONS[role].includes(p);

export type AuthedUser = typeof users.$inferSelect;
type Handler = (req: VercelRequest, res: VercelResponse, user: AuthedUser) => Promise<unknown>;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function withAuth(permission: Permission | null, handler: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new HttpError(401, "Missing token");
      // checkRevoked=true: signing a user out everywhere (revokeRefreshTokens) takes effect immediately.
      const decoded = await getAuth().verifyIdToken(token, true).catch(() => {
        throw new HttpError(401, "Invalid or revoked token");
      });
      const [user] = await db.select().from(users).where(eq(users.firebaseUid, decoded.uid)).limit(1);
      if (!user || user.status !== "active") throw new HttpError(403, "Account inactive");
      if (permission && !can(user.role, permission)) throw new HttpError(403, "Forbidden");
      await handler(req, res, user);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error(err);
      return res.status(500).json({ error: "Internal error" });
    }
  };
}
```

**`api/offerings/[id]/grades.ts`:** an example handler. It validates input, enforces teacher-owns-offering, and writes the grade and its audit row in one transaction with a row lock, which fixes the lost-update race in today's `grades[]` array:

```ts
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withAuth, can, HttpError } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { courseOfferings, enrollments, grades, gradeChanges } from "../../../db/schema";

const Body = z.object({
  studentId: z.string().uuid(),
  value: z.number().min(0).max(100).nullable(),
  isIncomplete: z.boolean().default(false),
  reason: z.string().max(500).optional(),
});

// PUT /api/offerings/:id/grades  — record one student's grade for an offering.
export default withAuth("grades:write_own_offerings", async (req, res, user) => {
  if (req.method !== "PUT") throw new HttpError(405, "Method not allowed");
  const offeringId = z.string().uuid().parse(req.query.id);
  const body = Body.safeParse(req.body);
  if (!body.success) throw new HttpError(400, body.error.issues[0].message);

  const [offering] = await db.select().from(courseOfferings).where(eq(courseOfferings.id, offeringId));
  if (!offering) throw new HttpError(404, "Offering not found");
  // Teachers may only grade their own offerings; admins/executives any.
  if (!can(user.role, "grades:write_any") && offering.instructorId !== user.id) {
    throw new HttpError(403, "Not your offering");
  }

  await db.transaction(async (tx) => {
    const [enrollment] = await tx.select().from(enrollments).where(
      and(eq(enrollments.offeringId, offeringId), eq(enrollments.studentId, body.data.studentId)));
    if (!enrollment) throw new HttpError(404, "Student not enrolled");

    const [prev] = await tx.select().from(grades).where(eq(grades.enrollmentId, enrollment.id)).for("update");
    const value = body.data.value === null ? null : body.data.value.toFixed(2);
    await tx.insert(grades)
      .values({ enrollmentId: enrollment.id, value, isIncomplete: body.data.isIncomplete, recordedBy: user.id })
      .onConflictDoUpdate({
        target: grades.enrollmentId,
        set: { value, isIncomplete: body.data.isIncomplete, recordedBy: user.id },
      });
    await tx.insert(gradeChanges).values({
      enrollmentId: enrollment.id, changedBy: user.id,
      oldValue: prev?.value ?? null, newValue: value,
      oldIncomplete: prev?.isIncomplete ?? null, newIncomplete: body.data.isIncomplete,
      reason: body.data.reason,
    });
  });
  res.status(204).end();
});
```

Client helper, replacing direct Firestore calls:

```ts
// src/lib/api.ts
import { auth } from "./firebase";
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }), ...init.headers },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}
```

### 2.7 Frontend migration order

A big-bang rewrite of a 7,000-line file is where regressions hide. Do it in slices:

1. **Modularize first (no behavior change).** Split `index.tsx` into `src/components/*`, `src/pages/*` (one per sidebar page), `src/lib/firebase.ts` and `src/types.ts`. Replace the Tailwind CDN with the Tailwind build plugin. Delete the `patch_*.sh`/`fix*.cjs`/`tmp.txt` scripts and add a `.gitignore`. Each page then becomes one migration unit.
2. **Add TanStack Query.** `onSnapshot` gives live updates; replace it with `useQuery` (`refetchOnWindowFocus` plus a 30–60 s `refetchInterval` on grade and attendance screens) and `useMutation` + `invalidateQueries`. Nothing in this app needs sub-second realtime.
3. **Migrate one page at a time, behind the API:** Profile → Courses/Schedule → Enrollment → Grades → Attendance → Materials → Accounts. Each page's Firestore calls are replaced by `api()` calls.
4. **Cutover** (§2.4) once every page reads from the API. Then remove the `firebase/firestore` import; only `firebase/auth` stays in the client bundle.

---

## 3. Vercel hosting and production setup

### 3.1 Architecture

```
Browser (Vite SPA, static on Vercel CDN)
   │  Firebase Auth SDK (sign-in, ID token)
   │  fetch /api/*  (Authorization: Bearer <ID token>)
   ▼
Vercel Functions  api/**/*.ts  (Node 22, Fluid compute)
   ├─ firebase-admin: verifyIdToken, createUser, revokeRefreshTokens
   ├─ Drizzle + pg Pool ──▶ Neon Postgres (pooled endpoint, PgBouncer)
   └─ @vercel/blob ──▶ Vercel Blob (materials, avatars)
```

- **Serverless functions, not a standalone backend.** The workload (CRUD, low concurrency, spiky around grade release) fits functions exactly. No server to patch, and previews get their own API automatically.
- **`server.ts` + Express is retired.** Its two endpoints become `api/users/[id]/password.ts` and `api/users/[id]/email.ts`, both using `withAuth("users:change_role")`.
- **Fluid compute** (the default for new projects) reuses function instances across concurrent requests. That's what makes a module-scope connection pool worthwhile.

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "bash scripts/vercel-build.sh",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
    ]
  }]
}
```

Add `"engines": { "node": "22.x" }` to `package.json`. Keep `api/` in a separate `tsconfig.api.json` (Node types, no DOM) and type-check it alongside the app: `"lint": "tsc --noEmit && tsc -p tsconfig.api.json --noEmit"`.

### 3.2 Managed PostgreSQL: Neon

| Provider | Fit |
|---|---|
| **Neon (recommended)** | Vercel's native Postgres (Vercel Postgres became Neon via the Marketplace). One-click integration injects `DATABASE_URL`/`DATABASE_URL_UNPOOLED`. **A database branch per preview deployment.** Scale-to-zero suits a school's usage pattern. Built-in PgBouncer pooling. Point-in-time restore. |
| Supabase | Also good. Pick it only if you want its extras (auth, storage, realtime). You'd be using it as plain Postgres here. |
| AWS RDS / Cloud SQL | Overkill at this scale, and a cold-connection pain from serverless without RDS Proxy. |

Choose the Neon region closest to your Vercel function region. For example, for users in Southeast Asia, `aws-ap-southeast-1` (Singapore) with Vercel's `sin1`. Set the function region in `vercel.json` with `"regions": ["sin1"]`.

### 3.3 Connection pooling in serverless

The failure mode: every cold function instance opens its own connections, so 50 concurrent instances × 10 connections = 500. That exhausts Postgres's `max_connections` and requests fail with `too many connections`.

The setup that prevents it, all shown in `lib/db.ts`:
1. **Connect through Neon's pooled endpoint** (hostname contains `-pooler`). PgBouncer in transaction mode multiplexes thousands of client connections onto a small set of real ones.
2. **Keep a small pool per instance** (`max: 5`) at **module scope**, so Fluid compute's concurrent requests on one instance share it instead of opening new connections.
3. **Call `attachDatabasePool(pool)`** (`@vercel/functions`), so idle clients are released before the instance is suspended rather than leaking until Postgres times them out.
4. **Transaction-mode caveats:** no session state between queries (`SET`, advisory locks, `LISTEN`), and no named prepared statements. Drizzle's `node-postgres` driver uses unnamed statements, so it's compatible.
5. **Migrations use the unpooled URL.** DDL and long transactions shouldn't go through PgBouncer.

An alternative for edge or very spiky traffic: `@neondatabase/serverless` over HTTP (`drizzle-orm/neon-http`) needs no pool at all, but supports only non-interactive transactions. The grade handler's `SELECT … FOR UPDATE` needs the pooled TCP driver above.

### 3.4 Environment variables

| Variable | Scope | Source |
|---|---|---|
| `DATABASE_URL` | Prod, Preview, Dev | Neon integration (pooled). Previews get a per-branch value automatically |
| `DATABASE_URL_UNPOOLED` | Prod, Preview, Dev | Neon integration (direct), for migrations |
| `FIREBASE_PROJECT_ID` | all | Firebase console → Project settings |
| `FIREBASE_CLIENT_EMAIL` | all | Service-account JSON `client_email` |
| `FIREBASE_PRIVATE_KEY` | all, **Sensitive** | Service-account JSON `private_key`. Paste it with literal `\n`; `lib/auth.ts` restores the newlines |
| `BLOB_READ_WRITE_TOKEN` | all | Vercel Blob store integration |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, … | all | Firebase web config. **Public by design** (bundled into the JS); `VITE_` prefixed variables are never secret |

Steps:
1. Vercel dashboard → the project → **Integrations** → add **Neon** (create the database, and enable "Create a branch for each preview deployment") and **Blob**. This injects the `DATABASE_*` and `BLOB_*` variables.
2. **Settings → Environment Variables:** add the `FIREBASE_*` values (mark the private key *Sensitive*) and the `VITE_FIREBASE_*` values.
3. Locally, run `npx vercel link`, then `npx vercel env pull .env.local` to get the development values. Make sure `.env*` is in `.gitignore`.
4. Remove the hardcoded fallback config from `index.tsx` (`firebaseConfig` at line 87) so a missing variable fails loudly instead of silently pointing at the wrong project.

### 3.5 Automated migrations on deploy

Workflow:
1. Change `db/schema.ts`.
2. Run `npx drizzle-kit generate --name <change>` and **review the SQL**.
3. Commit it with the code.
4. Deploy. Migrations apply automatically during the build.

`scripts/vercel-build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Production: migrate the production DB. Preview: migrate that deployment's Neon branch.
if [[ "${VERCEL_ENV:-}" == "production" || "${VERCEL_ENV:-}" == "preview" ]]; then
  echo "Applying migrations to $VERCEL_ENV database…"
  npx drizzle-kit migrate          # uses DATABASE_URL_UNPOOLED via drizzle.config.ts
fi
npx vite build
```

- **A failed migration fails the build,** so the previous deployment keeps serving. drizzle-kit records applied migrations in `drizzle.__drizzle_migrations`, so re-runs are safe.
- **Migrations must be backward compatible (expand/contract).** They run while the *old* deployment is still live:
  - To rename a column: add the new column → deploy code that writes both → backfill → deploy code that reads the new one → drop the old column in a later deploy.
  - Never combine "drop column" with the code change that stops using it.
- **Never run `drizzle-kit push` against production.** It diffs and applies without a reviewable file.
- **Optional CI gate** (`.github/workflows/db.yml`): on pull requests, run `drizzle-kit check` (migration history consistency) and apply all migrations to a throwaway Postgres service container, so broken SQL fails before merge rather than at deploy.

### 3.6 Production checklist

- **Backups:** Neon point-in-time restore. Check the retention window on your plan, and do a restore drill once per term.
- **Monitoring:** Sentry (browser + functions), with `console.error` in `withAuth` → Vercel log drains.
- **Rate limiting:** Vercel Firewall rules on `/api/*`, stricter on account endpoints (password/email change).
- **Firebase Auth hardening:** disable public email/password sign-up (Authentication → Settings → User actions) since accounts are admin-created, turn on email enumeration protection, and restrict the web API key to your domains in Google Cloud console.
- **Data protection:** student personal data (birth dates, baptism records, emergency contacts) is covered by data-protection law in most countries (for example the Philippines Data Privacy Act or GDPR). Restrict access by role (done), log staff access to records (`audit_log`), and document retention.

---

## 4. Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 (done)** | Firestore rules hardening, profile save allow-list, email-endpoint whitelist | Rules published in the Firebase console; emulator suite passes |
| **1** | Modularize `index.tsx`, Tailwind build, cleanup, `.gitignore`, env-only Firebase config | App behaves identically; `npm run lint`/`build` clean |
| **2** | Neon + Vercel project, schema + first migration, `lib/db`/`lib/auth`, API endpoints per page, TanStack Query | Every page served from `/api` on a preview deployment backed by a migrated Neon branch |
| **3** | ETL rehearsal on a branch, cutover, 30-day read-only Firestore, then decommission | `verify.ts` green; role smoke tests pass in production |
| **4** | P1 features (admissions, TOR, grading policy, clearance), then P2/P3 | Per-feature |
