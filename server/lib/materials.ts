import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { can, type User } from "./auth.js";
import type { Db } from "./db.js";
import { HttpError } from "./http.js";
import { courseOfferings, courses, enrollments, materialFiles, materials, users } from "../db/schema.js";

export const MAX_FILE_BYTES = 800 * 1024; // same limit as the app

export const MaterialUpload = z.strictObject({
  offeringId: z.uuid(),
  category: z.enum(["notes", "exams", "activity"]),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(100).regex(/^[\w.+-]+\/[\w.+-]+$/, "expected a MIME type"),
  /** File contents, base64-encoded (a data: URL prefix is accepted). */
  // Generous text cap (well under Vercel's 4.5 MB body limit); the real 800 KB check runs on the
  // decoded bytes so oversized files get a clear 413.
  data: z.string().min(1).max(2_000_000),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  instructions: z.string().trim().max(2000).nullable().default(null),
}).refine((m) => m.category === "notes" || m.eventDate, { message: "eventDate is required for exams and activities", path: ["eventDate"] });

type Filter = { category?: "notes" | "exams" | "activity"; offeringId?: string; mine?: boolean; archived?: boolean };

/** Material metadata (never the file bytes). Students only see active materials of their own courses. */
export async function listMaterials(db: DbOrTx, user: User, filter: Filter = {}, id?: string) {
  const isStudent = user.role === "student";
  const rows = await db
    .select({
      id: materials.id, offeringId: materials.offeringId, courseName: courses.name,
      uploadedBy: materials.uploadedBy, uploaderFirstName: users.firstName, uploaderLastName: users.lastName,
      category: materials.category, fileName: materials.fileName, contentType: materials.contentType,
      sizeBytes: materials.sizeBytes, eventDate: materials.eventDate, eventTime: materials.eventTime,
      instructions: materials.instructions, archivedAt: materials.archivedAt, createdAt: materials.createdAt,
    })
    .from(materials)
    .innerJoin(courseOfferings, eq(courseOfferings.id, materials.offeringId))
    .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
    .innerJoin(users, eq(users.id, materials.uploadedBy))
    .where(and(
      id ? eq(materials.id, id) : undefined,
      filter.category ? eq(materials.category, filter.category) : undefined,
      filter.offeringId ? eq(materials.offeringId, filter.offeringId) : undefined,
      filter.mine ? eq(materials.uploadedBy, user.id) : undefined,
      isStudent || filter.archived === false ? isNull(materials.archivedAt)
        : filter.archived === true ? isNotNull(materials.archivedAt) : undefined,
      isStudent
        ? sql`EXISTS (SELECT 1 FROM ${enrollments} WHERE ${enrollments.offeringId} = ${materials.offeringId} AND ${enrollments.studentId} = ${user.id})`
        : undefined,
    ))
    .orderBy(desc(materials.createdAt));
  return rows.map((r) => ({ ...r, uploaderName: `${r.uploaderFirstName} ${r.uploaderLastName}` }));
}

export async function getVisibleMaterial(db: DbOrTx, user: User, id: string) {
  const [m] = await listMaterials(db, user, {}, id);
  if (!m) throw new HttpError(404, "File not found");
  return m;
}

export async function uploadMaterial(db: Db, user: User, input: z.infer<typeof MaterialUpload>) {
  const [offering] = await db.select({ instructorId: courseOfferings.instructorId }).from(courseOfferings)
    .where(and(eq(courseOfferings.id, input.offeringId), isNull(courseOfferings.deletedAt)));
  if (!offering) throw new HttpError(404, "Offering not found");
  if (user.role !== "admin" && offering.instructorId !== user.id) throw new HttpError(403, "You can only upload to your own courses");
  const base64 = input.data.replace(/^data:[^;,]*;base64,/, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new HttpError(400, "data: not valid base64");
  const content = Buffer.from(base64, "base64");
  if (content.length === 0) throw new HttpError(400, "data: empty file");
  if (content.length > MAX_FILE_BYTES) throw new HttpError(413, "File must be under 800 KB");
  return db.transaction(async (tx) => {
    const [m] = await tx.insert(materials).values({
      offeringId: input.offeringId, uploadedBy: user.id, category: input.category,
      fileName: input.fileName, contentType: input.contentType, sizeBytes: content.length,
      eventDate: input.eventDate, eventTime: input.eventTime, instructions: input.instructions,
    }).returning({ id: materials.id });
    await tx.insert(materialFiles).values({ materialId: m.id, content });
    return m.id;
  });
}

/** Archive, restore or delete: the uploader or an admin. */
export async function assertCanManage(db: DbOrTx, user: User, id: string) {
  const [m] = await db.select({ uploadedBy: materials.uploadedBy }).from(materials).where(eq(materials.id, id));
  if (!m) throw new HttpError(404, "File not found");
  if (!(user.role === "admin" || (can(user, "materials:write_own") && m.uploadedBy === user.id))) {
    throw new HttpError(403, "Only the uploader or an admin can change this file");
  }
}

export async function fileContent(db: DbOrTx, id: string) {
  const [f] = await db.select({ content: materialFiles.content }).from(materialFiles).where(eq(materialFiles.materialId, id));
  if (!f) throw new HttpError(404, "File not found");
  return f.content;
}
