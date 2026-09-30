CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('enrolled', 'dropped', 'completed');--> statement-breakpoint
CREATE TYPE "public"."material_category" AS ENUM('notes', 'exams', 'activity');--> statement-breakpoint
CREATE TYPE "public"."meeting_frequency" AS ENUM('once', 'daily', 'weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."school_type" AS ENUM('day', 'night');--> statement-breakpoint
CREATE TYPE "public"."staff_category" AS ENUM('day_secretary', 'night_secretary', 'faculty', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'teacher', 'admin', 'president', 'vice_president');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"is_excused" boolean DEFAULT false NOT NULL,
	"notes" text,
	CONSTRAINT "attendance_records_session_id_student_id_pk" PRIMARY KEY("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"data" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"school_type" "school_type" NOT NULL,
	CONSTRAINT "cohorts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "courses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'enrolled' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "school_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	CONSTRAINT "school_years_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "student_records" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"student_no" text,
	"school_type" "school_type",
	"cohort_id" integer,
	"current_year_level" smallint,
	CONSTRAINT "student_records_student_no_unique" UNIQUE("student_no"),
	CONSTRAINT "student_year_level_ck" CHECK ("student_records"."current_year_level" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "student_year_levels" (
	"student_id" uuid NOT NULL,
	"year_level" smallint NOT NULL,
	"school_year_id" integer NOT NULL,
	CONSTRAINT "student_year_levels_student_id_year_level_pk" PRIMARY KEY("student_id","year_level"),
	CONSTRAINT "syl_year_level_ck" CHECK ("student_year_levels"."year_level" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_year_id" integer NOT NULL,
	"semester" smallint NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"grades_published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "terms_semester_ck" CHECK ("terms"."semester" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
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
	"emergency_contact_number" text
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_meetings" ADD CONSTRAINT "offering_meetings_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_records" ADD CONSTRAINT "student_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_records" ADD CONSTRAINT "student_records_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_year_levels" ADD CONSTRAINT "student_year_levels_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_year_levels" ADD CONSTRAINT "student_year_levels_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_records_student_idx" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_uq" ON "attendance_sessions" USING btree ("offering_id","held_on");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "offerings_term_level_idx" ON "course_offerings" USING btree ("term_id","year_level");--> statement-breakpoint
CREATE INDEX "offerings_instructor_idx" ON "course_offerings" USING btree ("instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_offering_student_uq" ON "enrollments" USING btree ("offering_id","student_id");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "grade_changes_enrollment_idx" ON "grade_changes" USING btree ("enrollment_id","changed_at");--> statement-breakpoint
CREATE INDEX "materials_offering_category_idx" ON "materials" USING btree ("offering_id","category");--> statement-breakpoint
CREATE INDEX "meetings_offering_idx" ON "offering_meetings" USING btree ("offering_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_year_semester_uq" ON "terms" USING btree ("school_year_id","semester");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_single_current_uq" ON "terms" USING btree ("is_current") WHERE "terms"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_role_status_idx" ON "users" USING btree ("role","status");