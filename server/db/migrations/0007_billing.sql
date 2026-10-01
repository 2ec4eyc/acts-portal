CREATE TYPE "public"."invoice_state" AS ENUM('issued', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'gcash', 'maya', 'other');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'invoice_issued';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'receipt_submitted';--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "invoice_lines_amount_ck" CHECK ("invoice_lines"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" integer,
	"description" text NOT NULL,
	"issued_on" date DEFAULT now() NOT NULL,
	"due_on" date NOT NULL,
	"state" "invoice_state" DEFAULT 'issued' NOT NULL,
	"void_reason" text,
	"voided_by" uuid,
	"voided_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_void_ck" CHECK (("invoices"."state" = 'void') = ("invoices"."voided_at" IS NOT NULL AND "invoices"."void_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "payment_allocations_payment_id_invoice_id_pk" PRIMARY KEY("payment_id","invoice_id"),
	CONSTRAINT "allocations_amount_ck" CHECK ("payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_reminders" (
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sent_on" date DEFAULT now() NOT NULL,
	"sent_by" uuid,
	CONSTRAINT "payment_reminders_invoice_id_kind_sent_on_pk" PRIMARY KEY("invoice_id","kind","sent_on")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"receipt_upload_id" uuid,
	"recorded_by" uuid,
	"void_reason" text,
	"voided_by" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_receipt_upload_id_unique" UNIQUE("receipt_upload_id"),
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "receipt_files" (
	"receipt_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"invoice_id" uuid,
	"amount_claimed" numeric(12, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" "receipt_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_uploads_file_key_unique" UNIQUE("file_key"),
	CONSTRAINT "receipts_size_ck" CHECK ("receipt_uploads"."size_bytes" BETWEEN 1 AND 2097152),
	CONSTRAINT "receipts_type_ck" CHECK ("receipt_uploads"."content_type" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_upload_id_receipt_uploads_id_fk" FOREIGN KEY ("receipt_upload_id") REFERENCES "public"."receipt_uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_files" ADD CONSTRAINT "receipt_files_receipt_id_receipt_uploads_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD CONSTRAINT "receipt_uploads_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD CONSTRAINT "receipt_uploads_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD CONSTRAINT "receipt_uploads_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_student_idx" ON "invoices" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "invoices_due_idx" ON "invoices" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_student_idx" ON "payments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "receipts_status_idx" ON "receipt_uploads" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_student_sha_uq" ON "receipt_uploads" USING btree ("student_id","sha256");--> statement-breakpoint
-- Invoice numbers: INV-<year>-0001, one running sequence.
CREATE SEQUENCE invoice_number_seq;
--> statement-breakpoint
-- Status and balances are derived, so they can't drift from the rows. "Today" is Manila's date.
CREATE VIEW invoice_balances AS
SELECT i.id AS invoice_id, i.number, i.student_id, i.description, i.issued_on, i.due_on, i.state, i.created_at,
       coalesce(l.total, 0)                         AS amount,
       coalesce(a.paid, 0)                          AS paid,
       coalesce(l.total, 0) - coalesce(a.paid, 0)   AS balance,
       CASE
         WHEN i.state = 'void'                                                    THEN 'void'
         WHEN coalesce(l.total, 0) - coalesce(a.paid, 0) <= 0                     THEN 'paid'
         WHEN i.due_on < (now() AT TIME ZONE 'Asia/Manila')::date                 THEN 'overdue'
         WHEN coalesce(a.paid, 0) > 0                                             THEN 'partially_paid'
         ELSE 'pending'
       END AS payment_status
FROM invoices i
LEFT JOIN (SELECT invoice_id, sum(amount) AS total FROM invoice_lines GROUP BY invoice_id) l ON l.invoice_id = i.id
LEFT JOIN (SELECT pa.invoice_id, sum(pa.amount) AS paid
           FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
           WHERE p.voided_at IS NULL GROUP BY pa.invoice_id) a ON a.invoice_id = i.id;
--> statement-breakpoint
-- Statement of account: charges (debit) and payments (credit) with a running balance.
CREATE VIEW student_ledger AS
WITH entries AS (
  SELECT b.student_id, b.issued_on AS entry_date, b.created_at, 'charge' AS kind, b.invoice_id AS ref_id,
         b.number || ': ' || b.description AS description, b.amount AS debit, 0::numeric AS credit
  FROM invoice_balances b WHERE b.state = 'issued'
  UNION ALL
  SELECT p.student_id, p.paid_on, p.created_at, 'payment', p.id,
         'Payment (' || replace(p.method::text, '_', ' ') || coalesce(', ref ' || p.reference, '') || ')', 0, p.amount
  FROM payments p WHERE p.voided_at IS NULL
)
SELECT *, sum(debit - credit) OVER (PARTITION BY student_id ORDER BY entry_date, created_at, ref_id) AS running_balance
FROM entries;
--> statement-breakpoint
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('id');
--> statement-breakpoint
CREATE TRIGGER audit_invoice_lines AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('invoice_id');
--> statement-breakpoint
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('id');
--> statement-breakpoint
CREATE TRIGGER audit_payment_allocations AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('payment_id');
--> statement-breakpoint
CREATE TRIGGER audit_receipt_uploads AFTER INSERT OR UPDATE OR DELETE ON receipt_uploads
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('id');
