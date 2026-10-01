CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"code" text NOT NULL,
	"purpose" text,
	"content" jsonb NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text,
	CONSTRAINT "transcripts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "course_offerings" ADD COLUMN "units" numeric(3, 1) DEFAULT '3' NOT NULL;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcripts_student_idx" ON "transcripts" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "offerings_units_ck" CHECK ("course_offerings"."units" > 0);