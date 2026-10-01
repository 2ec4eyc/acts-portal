import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import type { Db } from "./db.js";
import { HttpError } from "./http.js";
import { syncEnrollments } from "./academics.js";
import {
  attendanceRecords, attendanceSessions, courseOfferings, courses, enrollments, studentRecords, users,
} from "../db/schema.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const AttendanceSave = z.strictObject({
  offeringId: z.uuid(),
  date: isoDate,
  records: z.array(z.strictObject({
    studentId: z.uuid(),
    status: z.enum(["present", "absent", "late"]),
    isExcused: z.boolean().default(false),
    notes: z.string().trim().max(500).nullable().default(null),
  })).max(1000),
});

/** One day's roster for an offering: every enrolled student, with their record if taken. */
export async function roster(db: DbOrTx, offeringId: string, date: string) {
  const [session] = await db.select({ id: attendanceSessions.id }).from(attendanceSessions)
    .where(and(eq(attendanceSessions.offeringId, offeringId), eq(attendanceSessions.heldOn, date)));
  const students = await db
    .select({ studentId: users.id, firstName: users.firstName, lastName: users.lastName, studentNo: studentRecords.studentNo })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .leftJoin(studentRecords, eq(studentRecords.userId, users.id))
    .where(and(eq(enrollments.offeringId, offeringId), eq(enrollments.status, "enrolled")))
    .orderBy(asc(users.lastName), asc(users.firstName));
  const records = session
    ? await db.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, session.id))
    : [];
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  return {
    offeringId, date, taken: Boolean(session),
    students: students.map((s) => {
      const r = byStudent.get(s.studentId);
      return {
        studentId: s.studentId, studentName: `${s.firstName} ${s.lastName}`, studentNo: s.studentNo,
        status: r?.status ?? null, isExcused: r?.isExcused ?? false, notes: r?.notes ?? null,
      };
    }),
  };
}

/** All records, for one offering (every date) or one student (every offering). */
export async function listAttendance(db: DbOrTx, filter: { offeringId?: string; studentId?: string }) {
  return db
    .select({
      offeringId: attendanceSessions.offeringId, courseName: courses.name, date: attendanceSessions.heldOn,
      studentId: attendanceRecords.studentId, status: attendanceRecords.status,
      isExcused: attendanceRecords.isExcused, notes: attendanceRecords.notes,
    })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
    .innerJoin(courseOfferings, eq(courseOfferings.id, attendanceSessions.offeringId))
    .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
    .where(and(
      filter.offeringId ? eq(attendanceSessions.offeringId, filter.offeringId) : undefined,
      filter.studentId ? eq(attendanceRecords.studentId, filter.studentId) : undefined,
    ))
    .orderBy(asc(attendanceSessions.heldOn), asc(courses.name));
}

/** Saves a day's attendance; every student must be enrolled in the offering. */
export async function saveAttendance(db: Db, actorId: string, input: z.infer<typeof AttendanceSave>) {
  await db.transaction(async (tx) => {
    const [offering] = await tx.select({ id: courseOfferings.id }).from(courseOfferings).where(eq(courseOfferings.id, input.offeringId));
    if (!offering) throw new HttpError(404, "Offering not found");
    // The app's roster is every student matching the course's year level and school year; make sure
    // they're enrolled (as the course/account screens would) before checking.
    await syncEnrollments(tx, { offeringIds: [input.offeringId] });
    const ids = [...new Set(input.records.map((r) => r.studentId))];
    if (ids.length !== input.records.length) throw new HttpError(400, "records: each student may appear once");
    if (ids.length) {
      const enrolled = await tx.select({ id: enrollments.studentId }).from(enrollments)
        .where(and(eq(enrollments.offeringId, input.offeringId), inArray(enrollments.studentId, ids)));
      if (enrolled.length !== ids.length) throw new HttpError(400, "records: every student must be enrolled in this course");
    }
    const [session] = await tx.insert(attendanceSessions)
      .values({ offeringId: input.offeringId, heldOn: input.date, recordedBy: actorId })
      .onConflictDoUpdate({
        target: [attendanceSessions.offeringId, attendanceSessions.heldOn],
        set: { recordedBy: actorId, updatedAt: new Date() },
      })
      .returning({ id: attendanceSessions.id });
    for (const r of input.records) {
      await tx.insert(attendanceRecords).values({ sessionId: session.id, ...r })
        .onConflictDoUpdate({
          target: [attendanceRecords.sessionId, attendanceRecords.studentId],
          set: { status: r.status, isExcused: r.isExcused, notes: r.notes },
        });
    }
  });
}
