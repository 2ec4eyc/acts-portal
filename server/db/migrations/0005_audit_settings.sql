ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "table_name" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "op" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "old" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "new" jsonb;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id","at");--> statement-breakpoint
-- Row-level audit: every write to an audited table is recorded with the acting user, taken from
-- the transaction-local setting app.actor_id (set per request by server/lib/db.ts). Arguments:
-- 1) the column that identifies the row, 2) comma-separated columns to ignore (an UPDATE that only
-- changes those, e.g. a sign-in's session id, isn't recorded). updated_at is always ignored.
-- Bulk restores set app.audit_off = 'on' so restored rows aren't logged again.
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ignored text[] := array_remove(string_to_array(coalesce(TG_ARGV[1], ''), ','), '') || ARRAY['updated_at'];
  old_row jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - ignored END;
  new_row jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - ignored END;
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
BEGIN
  IF current_setting('app.audit_off', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND old_row = new_row THEN RETURN NULL; END IF;
  INSERT INTO audit_log (actor_id, action, entity, entity_id, table_name, op, old, new, data)
  VALUES (
    actor, TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME,
    coalesce(coalesce(new_row, old_row) ->> TG_ARGV[0], '?'), TG_TABLE_NAME, TG_OP, old_row, new_row,
    CASE WHEN actor IS NULL THEN jsonb_build_object('source', coalesce(nullif(current_setting('app.source', true), ''), 'system')) END
  );
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_grades AFTER INSERT OR UPDATE OR DELETE ON grades
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('enrollment_id');
--> statement-breakpoint
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('id', 'current_session_id');
--> statement-breakpoint
CREATE TRIGGER audit_user_profiles AFTER INSERT OR UPDATE OR DELETE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('user_id');
--> statement-breakpoint
CREATE TRIGGER audit_student_records AFTER INSERT OR UPDATE OR DELETE ON student_records
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('user_id');
--> statement-breakpoint
CREATE TRIGGER audit_course_offerings AFTER INSERT OR UPDATE OR DELETE ON course_offerings
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('id');
--> statement-breakpoint
CREATE TRIGGER audit_attendance_records AFTER INSERT OR UPDATE OR DELETE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('student_id');
--> statement-breakpoint
CREATE TRIGGER audit_materials AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('id');
--> statement-breakpoint
CREATE TRIGGER audit_transcripts AFTER INSERT OR UPDATE OR DELETE ON transcripts
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('id');
--> statement-breakpoint
CREATE TRIGGER audit_app_settings AFTER INSERT OR UPDATE OR DELETE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('key');
