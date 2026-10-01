ALTER TYPE "public"."notification_kind" ADD VALUE 'course_material';--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "file_key" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "link_url" text;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_link_or_file_ck" CHECK ("materials"."link_url" IS NULL OR "materials"."file_key" IS NULL);