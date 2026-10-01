import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { can, type User } from "./auth.js";
import { HttpError } from "./http.js";
import { getSetting } from "./settings.js";
import {
  announcementReads, announcements, cohorts, courseOfferings, courses, enrollments, studentRecords, userRole, users,
} from "../db/schema.js";

const isoDateTime = z.iso.datetime({ offset: true });
export const AnnouncementInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  audienceRoles: z.array(z.enum(userRole.enumValues)).min(1).max(5),
  /** Only students in this batch (by name, e.g. "Batch 2026-A"). Staff in the audience still see it. */
  cohort: z.string().trim().min(1).max(100).nullable().default(null),
  /** Only students in this course and its teacher. */
  offeringId: z.uuid().nullable().default(null),
  pinned: z.boolean().default(false),
  publishAt: isoDateTime.nullable().default(null),
  expiresAt: isoDateTime.nullable().default(null),
});
export type AnnouncementInput = z.infer<typeof AnnouncementInput>;

const STAFF_SEE_ALL = new Set(["admin", "president", "vice_president"]);

async function cohortId(db: DbOrTx, name: string | null) {
  if (!name) return null;
  const [c] = await db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.name, name));
  if (!c) throw new HttpError(400, `cohort: no batch named "${name}"`);
  return c.id;
}

function checkDates(publishAt: Date, expiresAt: Date | null) {
  if (expiresAt && expiresAt <= publishAt) throw new HttpError(400, "expiresAt: must be after publishAt");
}

const columns = {
  id: announcements.id, title: announcements.title, body: announcements.body,
  audienceRoles: announcements.audienceRoles, cohort: cohorts.name, offeringId: announcements.offeringId,
  courseName: courses.name, pinned: announcements.pinned, publishAt: announcements.publishAt,
  expiresAt: announcements.expiresAt, createdAt: announcements.createdAt, updatedAt: announcements.updatedAt,
  authorFirst: users.firstName, authorLast: users.lastName,
};
const base = (db: DbOrTx) => db.select(columns).from(announcements)
  .leftJoin(cohorts, eq(cohorts.id, announcements.cohortId))
  .leftJoin(courseOfferings, eq(courseOfferings.id, announcements.offeringId))
  .leftJoin(courses, eq(courses.id, courseOfferings.courseId))
  .leftJoin(users, eq(users.id, announcements.createdBy));
type Row = Awaited<ReturnType<ReturnType<typeof base>["execute"]>>[number];
const shape = ({ authorFirst, authorLast, ...r }: Row) => ({ ...r, author: authorFirst ? `${authorFirst} ${authorLast}` : null });

/**
 * What this person should see now: published, not expired, for their role. A batch or course
 * narrows it for students (their batch / courses they're enrolled in) and teachers (courses they
 * teach); admins, the president and the vice president in the audience see every one.
 */
export async function feed(db: DbOrTx, user: User) {
  if (!(await getSetting(db, "features")).announcements) return [];
  const [record] = user.role === "student"
    ? await db.select({ cohortId: studentRecords.cohortId }).from(studentRecords).where(eq(studentRecords.userId, user.id))
    : [];
  const seesAll = STAFF_SEE_ALL.has(user.role);
  const rows = await base(db)
    .where(and(
      sql`${announcements.publishAt} <= now()`,
      sql`(${announcements.expiresAt} IS NULL OR ${announcements.expiresAt} > now())`,
      sql`${user.role}::user_role = ANY(${announcements.audienceRoles})`,
      seesAll || user.role !== "student" ? undefined
        : sql`(${announcements.cohortId} IS NULL OR ${announcements.cohortId} = ${record?.cohortId ?? null})`,
      seesAll ? undefined
        : user.role === "student"
          ? sql`(${announcements.offeringId} IS NULL OR EXISTS (SELECT 1 FROM ${enrollments} e
              WHERE e.offering_id = ${announcements.offeringId} AND e.student_id = ${user.id} AND e.status = 'enrolled'))`
          : sql`(${announcements.offeringId} IS NULL OR ${courseOfferings.instructorId} = ${user.id})`,
    ))
    .orderBy(desc(announcements.pinned), desc(announcements.publishAt))
    .limit(50);
  if (!rows.length) return [];
  const read = new Set((await db.select({ id: announcementReads.announcementId }).from(announcementReads)
    .where(eq(announcementReads.userId, user.id))).map((r) => r.id));
  return rows.map((r) => ({ ...shape(r), read: read.has(r.id) }));
}

/** Every announcement, including scheduled and expired ones, with how many people have read it (managers). */
export async function listAll(db: DbOrTx) {
  const rows = await base(db).orderBy(desc(announcements.pinned), desc(announcements.publishAt));
  const reads = new Map((await db.select({ id: announcementReads.announcementId, n: count() })
    .from(announcementReads).groupBy(announcementReads.announcementId)).map((r) => [r.id, r.n]));
  const now = Date.now();
  return rows.map((r) => ({
    ...shape(r),
    readCount: reads.get(r.id) ?? 0,
    status: r.publishAt.getTime() > now ? "scheduled" : r.expiresAt && r.expiresAt.getTime() <= now ? "expired" : "live",
  }));
}

export async function getAnnouncement(db: DbOrTx, id: string) {
  const [row] = await base(db).where(eq(announcements.id, id));
  if (!row) throw new HttpError(404, "Announcement not found");
  return shape(row);
}

export async function createAnnouncement(db: DbOrTx, user: User, input: AnnouncementInput) {
  if (!(await getSetting(db, "features")).announcements) throw new HttpError(403, "Announcements are turned off");
  const publishAt = input.publishAt ? new Date(input.publishAt) : new Date();
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  checkDates(publishAt, expiresAt);
  if (input.offeringId) await assertOffering(db, input.offeringId);
  const [row] = await db.insert(announcements).values({
    title: input.title, body: input.body, audienceRoles: [...new Set(input.audienceRoles)],
    cohortId: await cohortId(db, input.cohort), offeringId: input.offeringId, pinned: input.pinned,
    publishAt, expiresAt, createdBy: user.id,
  }).returning({ id: announcements.id });
  return getAnnouncement(db, row.id);
}

export async function updateAnnouncement(db: DbOrTx, id: string, patch: Partial<AnnouncementInput>) {
  const [current] = await db.select().from(announcements).where(eq(announcements.id, id));
  if (!current) throw new HttpError(404, "Announcement not found");
  const set: Partial<typeof announcements.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.audienceRoles !== undefined) set.audienceRoles = [...new Set(patch.audienceRoles)];
  if (patch.cohort !== undefined) set.cohortId = await cohortId(db, patch.cohort);
  if (patch.offeringId !== undefined) {
    if (patch.offeringId) await assertOffering(db, patch.offeringId);
    set.offeringId = patch.offeringId;
  }
  if (patch.pinned !== undefined) set.pinned = patch.pinned;
  if (patch.publishAt !== undefined) set.publishAt = patch.publishAt ? new Date(patch.publishAt) : new Date();
  if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  checkDates(set.publishAt ?? current.publishAt, set.expiresAt !== undefined ? set.expiresAt : current.expiresAt);
  await db.update(announcements).set(set).where(eq(announcements.id, id));
  return getAnnouncement(db, id);
}

export async function deleteAnnouncement(db: DbOrTx, id: string) {
  const deleted = await db.delete(announcements).where(eq(announcements.id, id)).returning({ id: announcements.id });
  if (!deleted.length) throw new HttpError(404, "Announcement not found");
}

/** Marks read, only if the announcement is in this person's feed. */
export async function markAnnouncementRead(db: DbOrTx, user: User, id: string) {
  if (!can(user, "announcements:write") && !(await feed(db, user)).some((a) => a.id === id)) {
    throw new HttpError(404, "Announcement not found");
  }
  await db.insert(announcementReads).values({ announcementId: id, userId: user.id }).onConflictDoNothing();
}

async function assertOffering(db: DbOrTx, id: string) {
  const [o] = await db.select({ id: courseOfferings.id }).from(courseOfferings).where(eq(courseOfferings.id, id));
  if (!o) throw new HttpError(400, "offeringId: no such course");
}

