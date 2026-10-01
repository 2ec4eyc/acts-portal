ALTER TABLE "enrollments" ADD COLUMN "manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "added_by" uuid;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;