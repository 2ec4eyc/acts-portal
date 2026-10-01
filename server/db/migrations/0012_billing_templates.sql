CREATE TABLE "billing_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"lines" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_templates" ADD CONSTRAINT "billing_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_templates_name_lower_uq" ON "billing_templates" USING btree (lower("name"));--> statement-breakpoint
CREATE TRIGGER audit_billing_templates AFTER INSERT OR UPDATE OR DELETE ON billing_templates
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('id');
