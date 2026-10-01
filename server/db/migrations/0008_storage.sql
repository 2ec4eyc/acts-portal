CREATE TYPE "public"."storage_alert_level" AS ENUM('ok', 'warn', 'full');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'storage_warning';--> statement-breakpoint
CREATE TABLE "storage_status" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"measured_bytes" bigint,
	"object_count" integer,
	"measured_at" timestamp with time zone,
	"orphans_removed" integer DEFAULT 0 NOT NULL,
	"alert_level" "storage_alert_level" DEFAULT 'ok' NOT NULL,
	CONSTRAINT "storage_status_one_row_ck" CHECK ("storage_status"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD COLUMN "file_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD COLUMN "file_deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD CONSTRAINT "receipt_uploads_file_deleted_by_users_id_fk" FOREIGN KEY ("file_deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_stored_size_idx" ON "receipt_uploads" USING btree ("size_bytes") WHERE "receipt_uploads"."file_deleted_at" IS NULL;