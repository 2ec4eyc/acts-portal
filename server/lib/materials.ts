import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { can, type User } from "./auth.js";
import { HttpError } from "./http.js";
import { notify } from "./notifications.js";
import { assertRoom, checkAlerts } from "./receipt-storage.js";
import { bucket, r2DownloadUrl, r2ObjectSize, r2UploadUrl, storageMode } from "./storage.js";
import { courseOfferings, courses, enrollments, materialFiles, materials, users } from "../db/schema.js";

/** Files stored in the database (when R2 isn't set up) stay small: they travel through the API. */
export const MAX_FILE_BYTES = 800 * 1024;
/** Files uploaded straight to the R2 bucket. */
export const MAX_R2_FILE_BYTES = 20 * 1024 * 1024;
export const MATERIAL_TYPES = [
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "application/zip", "application/x-zip-compressed",
  "image/jpeg", "image/png", "image/webp", "image/gif",
] as const;

const httpUrl = z.string().trim().max(2000).refine((v) => {
  try { return ["http:", "https:"].includes(new URL(v).protocol); } catch { return false; }
}, "expected an http(s) link");

/**
 * A new material is one of: `data` (base64, stored in the database; only without R2), `key` (a file
 * already uploaded to R2 via upload-url) or `url` (a link, with fileName as its title).
 */
export const MaterialUpload = z.strictObject({
  offeringId: z.uuid(),
  category: z.enum(["notes", "exams", "activity"]),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(100).regex(/^[\w.+-]+\/[\w.+-]+$/, "expected a MIME type").optional(),
  // Generous text cap (well under Vercel's 4.5 MB body limit); the real 800 KB check runs on the
  // decoded bytes so oversized files get a clear 413.
  data: z.string().min(1).max(2_000_000).optional(),
  key: z.string().max(200).optional(),
  url: httpUrl.optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  instructions: z.string().trim().max(2000).nullable().default(null),
})
  .refine((m) => m.category === "notes" || m.eventDate, { message: "eventDate is required for exams and activities", path: ["eventDate"] })
  .refine((m) => [m.data, m.key, m.url].filter((v) => v !== undefined).length === 1, { message: "send exactly one of data, key or url", path: ["data"] })
  .refine((m) => m.url !== undefined || m.contentType, { message: "contentType is required for files", path: ["contentType"] });

export const UploadUrlInput = z.strictObject({
  offeringId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(MATERIAL_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_R2_FILE_BYTES),
});

type Filter = { category?: "notes" | "exams" | "activity"; offeringId?: string; mine?: boolean; archived?: boolean };

/** Material metadata (never the file bytes). Students only see active materials of their own courses. */
export async function listMaterials(db: DbOrTx, user: User, filter: Filter = {}, id?: string) {
  const isStudent = user.role === "student";
  const rows = await db
    .select({
      id: materials.id, offeringId: materials.offeringId, courseName: courses.name,
      uploadedBy: materials.uploadedBy, uploaderFirstName: users.firstName, uploaderLastName: users.lastName,
      category: materials.category, fileName: materials.fileName, contentType: materials.contentType, linkUrl: materials.linkUrl,
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

async function uploadableOffering(db: DbOrTx, user: User, offeringId: string) {
  const [offering] = await db.select({ instructorId: courseOfferings.instructorId, name: courses.name }).from(courseOfferings)
    .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
    .where(and(eq(courseOfferings.id, offeringId), isNull(courseOfferings.deletedAt)));
  if (!offering) throw new HttpError(404, "Offering not found");
  const allowed = can(user, "materials:write_any") || (can(user, "materials:write_own") && offering.instructorId === user.id);
  if (!allowed) throw new HttpError(403, "You can only upload to your own courses");
  return offering;
}

/** Step 1 of a file upload: where to send it (a 5-minute R2 link), or "db" when R2 isn't set up. */
export async function requestMaterialUpload(db: DbOrTx, user: User, input: z.infer<typeof UploadUrlInput>) {
  await uploadableOffering(db, user, input.offeringId);
  if (storageMode() === "db") return { mode: "db" as const, maxBytes: MAX_FILE_BYTES };
  await assertRoom(db, input.sizeBytes);
  const key = `materials/${input.offeringId}/${randomUUID()}`;
  return { mode: "r2" as const, key, url: await r2UploadUrl(key, input.contentType, input.sizeBytes), maxBytes: MAX_R2_FILE_BYTES };
}

const KIND_WORD = { notes: "notes", exams: "exam", activity: "activity" } as const;

export async function uploadMaterial(db: DbOrTx, user: User, input: z.infer<typeof MaterialUpload>) {
  const offering = await uploadableOffering(db, user, input.offeringId);
  let content: Buffer | null = null;
  let fileKey: string | null = null;
  let sizeBytes: number | null = null;
  if (input.data !== undefined) {
    const base64 = input.data.replace(/^data:[^;,]*;base64,/, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new HttpError(400, "data: not valid base64");
    content = Buffer.from(base64, "base64");
    if (content.length === 0) throw new HttpError(400, "data: empty file");
    if (content.length > MAX_FILE_BYTES) throw new HttpError(413, "File must be under 800 KB");
    sizeBytes = content.length;
  } else if (input.key !== undefined) {
    if (storageMode() !== "r2") throw new HttpError(400, "key: file storage isn't set up");
    if (!input.key.startsWith(`materials/${input.offeringId}/`)) throw new HttpError(400, "key: not an upload for this course");
    const size = await r2ObjectSize(input.key);
    if (size === null) throw new HttpError(400, "key: the upload didn't finish; please try again");
    if (size > MAX_R2_FILE_BYTES) throw new HttpError(413, "File must be under 20 MB");
    await assertRoom(db, size);
    fileKey = `r2:${input.key}`;
    sizeBytes = size;
  }
  const [m] = await db.insert(materials).values({
    offeringId: input.offeringId, uploadedBy: user.id, category: input.category,
    fileName: input.fileName, contentType: input.url !== undefined ? null : input.contentType, sizeBytes,
    fileKey, linkUrl: input.url ?? null,
    eventDate: input.eventDate, eventTime: input.eventTime, instructions: input.instructions,
  }).returning({ id: materials.id });
  if (content) await db.insert(materialFiles).values({ materialId: m.id, content });
  if (fileKey) await checkAlerts(db);

  // Tell the course's students.
  const students = await db.select({ id: enrollments.studentId }).from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(and(eq(enrollments.offeringId, input.offeringId), eq(users.status, "active"), eq(users.role, "student")));
  await notify(db, students.map((st) => ({
    userId: st.id, kind: "course_material" as const, link: "notes", data: { materialId: m.id, offeringId: input.offeringId },
    title: `New ${KIND_WORD[input.category]} in ${offering.name}`,
    body: input.category === "notes" ? input.fileName
      : `${input.fileName}${input.eventDate ? ` · ${input.eventDate}${input.eventTime ? ` ${input.eventTime}` : ""}` : ""}`,
  })));
  return { id: m.id, notified: students.length };
}

/** Archive, restore or delete: the uploader or an admin. */
export async function assertCanManage(db: DbOrTx, user: User, id: string) {
  const [m] = await db.select({ uploadedBy: materials.uploadedBy }).from(materials).where(eq(materials.id, id));
  if (!m) throw new HttpError(404, "File not found");
  if (!(user.role === "admin" || (can(user, "materials:write_own") && m.uploadedBy === user.id))) {
    throw new HttpError(403, "Only the uploader or an admin can change this file");
  }
}

/** What to send for a download: a link, a short-lived R2 link, or the stored bytes. */
export async function materialDownload(db: DbOrTx, id: string, fileName: string) {
  const [m] = await db.select({ fileKey: materials.fileKey, linkUrl: materials.linkUrl }).from(materials).where(eq(materials.id, id));
  if (!m) throw new HttpError(404, "File not found");
  if (m.linkUrl) return { kind: "link" as const, url: m.linkUrl };
  if (m.fileKey?.startsWith("r2:")) return { kind: "url" as const, url: await r2DownloadUrl(m.fileKey.slice(3), fileName) };
  const [f] = await db.select({ content: materialFiles.content }).from(materialFiles).where(eq(materialFiles.materialId, id));
  if (!f) throw new HttpError(404, "File not found");
  return { kind: "bytes" as const, content: f.content };
}

/** Deletes a material and, for R2 files, the stored object (left for the daily cleanup if R2 refuses). */
export async function deleteMaterial(db: DbOrTx, id: string) {
  const [m] = await db.delete(materials).where(eq(materials.id, id)).returning({ fileKey: materials.fileKey });
  if (m?.fileKey?.startsWith("r2:")) {
    await bucket.remove([m.fileKey.slice(3)]).catch((err) => console.error("R2 delete failed; the daily cleanup will retry", err));
  }
}
