CREATE TABLE "material_files" (
	"material_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_files" ADD CONSTRAINT "material_files_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "blob_url";