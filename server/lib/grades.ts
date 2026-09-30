import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { can, type User } from "./auth.js";
import type { Db } from "./db.js";
import { HttpError } from "./http.js";
import {
  courseOfferings, courses, enrollments, gradeChanges, grades, schoolYears, studentRecords, terms, users,
} from "../db/schema.js";

export const GradeInput = z.strictObject({
  offeringId: z.uuid(),
  studentId: z.uuid(),
  /** 0-100, or null for "pending". Ignored (stored as null) when isIncomplete is true. */
  value: z.number().min(0).max(100).nullable(),
  isIncomplete: z.boolean().default(false),
});
export type GradeInput = z.infer<typeof GradeInput>;

/** Grades per enrollment, for one student or one offering. */
export async function listGrades(db: DbOrTx, filter: { studentId?: string; studentIds?: string[]; offeringId?: string }) {
  if (filter.studentIds?.length === 0) return [];
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      offeringId: courseOfferings.id,
      courseName: courses.name,
      yearLevel: courseOfferings.yearLevel,
      semester: terms.semester,
      schoolYear: schoolYears.label,
      instructorId: courseOfferings.instructorId,
      offeringArchived: sql<boolean>`${courseOfferings.deletedAt} IS NOT NULL`,
      studentId: enrollments.studentId,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
      studentNo: studentRecords.studentNo,
      value: grades.value,
      isIncomplete: grades.isIncomplete,
      releasedAt: grades.releasedAt,
    })
    .from(enrollments)
    .innerJoin(courseOfferings, eq(courseOfferings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
    .innerJoin(terms, eq(terms.id, courseOfferings.termId))
    .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .leftJoin(studentRecords, eq(studentRecords.userId, enrollments.studentId))
    .leftJoin(grades, eq(grades.enrollmentId, enrollments.id))
    .where(and(
      filter.studentId ? eq(enrollments.studentId, filter.studentId) : undefined,
      filter.studentIds ? inArray(enrollments.studentId, filter.studentIds) : undefined,
      filter.offeringId ? eq(enrollments.offeringId, filter.offeringId) : undefined,
    ))
    .orderBy(asc(schoolYears.label), asc(courseOfferings.yearLevel), asc(terms.semester), asc(courses.name), asc(users.lastName));
  return rows.map(({ studentFirstName, studentLastName, value, isIncomplete, ...r }) => ({
    ...r,
    studentName: `${studentFirstName} ${studentLastName}`,
    value: value === null ? null : Number(value),
    isIncomplete: isIncomplete ?? false,
    status: isIncomplete ? "incomplete" : value === null ? "pending" : Number(value) >= 75 ? "passed" : "failed",
  }));
}

/** Throws unless the user may grade this offering (any offering, or their own as instructor). */
export async function assertCanGrade(db: DbOrTx, user: User, offeringId: string) {
  const [offering] = await db.select({ instructorId: courseOfferings.instructorId })
    .from(courseOfferings).where(eq(courseOfferings.id, offeringId));
  if (!offering) throw new HttpError(404, "Offering not found");
  if (can(user, "grades:write_any")) return;
  if (can(user, "grades:write_own_offerings") && offering.instructorId === user.id) return;
  throw new HttpError(403, "You can only grade your own courses");
}

async function enrollmentFor(db: DbOrTx, offeringId: string, studentId: string, create: boolean) {
  const [existing] = await db.select({ id: enrollments.id }).from(enrollments)
    .where(and(eq(enrollments.offeringId, offeringId), eq(enrollments.studentId, studentId)));
  if (existing || !create) return existing?.id ?? null;
  const [student] = await db.select({ role: users.role }).from(users).where(eq(users.id, studentId));
  if (student?.role !== "student") throw new HttpError(400, "studentId: not a student");
  const [created] = await db.insert(enrollments).values({ offeringId, studentId }).returning({ id: enrollments.id });
  return created.id;
}

/**
 * Sets (value/incomplete) or resets (reset=true) one grade inside a transaction, locking the row so
 * concurrent edits can't overwrite each other, and records the change. Like the app, setting a grade
 * for a student who isn't enrolled enrolls them.
 */
export async function writeGrade(tx: DbOrTx, actorId: string, input: GradeInput, reset = false) {
  const enrollmentId = await enrollmentFor(tx, input.offeringId, input.studentId, !reset);
  if (!enrollmentId) return false;
  const [prev] = await tx.select().from(grades).where(eq(grades.enrollmentId, enrollmentId)).for("update");
  const value = reset || input.isIncomplete || input.value === null ? null : input.value.toFixed(2);
  const isIncomplete = !reset && input.isIncomplete;
  if (reset) {
    if (!prev) return false;
    await tx.delete(grades).where(eq(grades.enrollmentId, enrollmentId));
  } else {
    await tx.insert(grades)
      .values({ enrollmentId, value, isIncomplete, recordedBy: actorId, releasedAt: new Date() })
      .onConflictDoUpdate({
        target: grades.enrollmentId,
        set: { value, isIncomplete, recordedBy: actorId, releasedAt: new Date(), updatedAt: new Date() },
      });
  }
  await tx.insert(gradeChanges).values({
    enrollmentId, changedBy: actorId,
    oldValue: prev?.value ?? null, newValue: value,
    oldIncomplete: prev?.isIncomplete ?? null, newIncomplete: isIncomplete,
  });
  return true;
}

/** Applies many grades in one all-or-nothing transaction (CSV bulk upload). */
export async function writeGrades(db: Db, user: User, items: GradeInput[]) {
  return db.transaction(async (tx) => {
    for (const offeringId of new Set(items.map((i) => i.offeringId))) await assertCanGrade(tx, user, offeringId);
    for (const item of items) await writeGrade(tx, user.id, item);
    return items.length;
  });
}
