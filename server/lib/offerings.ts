import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { courseId, termId } from "./academics.js";
import { auditLog, courseOfferings, courses, enrollments, offeringMeetings, schoolYears, terms, users } from "../db/schema.js";
import { HttpError } from "./http.js";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");
export const OfferingInput = z.strictObject({
  name: z.string().trim().min(1).max(200),
  instructorId: z.uuid().nullable(),
  yearLevel: z.union([z.literal(1), z.literal(2)]),
  /** Day School or Night School: only students of that school are enrolled. */
  schoolType: z.enum(["day", "night"]),
  semester: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/, "expected YYYY-YYYY"),
  /** Credit units (transcript). Optional on create: defaults to 3. */
  units: z.number().positive().max(99).multipleOf(0.5).optional(),
  schedule: z.strictObject({
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
    startTime: time,
    endTime: time,
    frequency: z.enum(["once", "daily", "weekly", "biweekly", "monthly"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  }).refine((s) => s.endTime > s.startTime, { message: "endTime must be after startTime", path: ["endTime"] })
    .nullable(),
});
export type OfferingInput = z.infer<typeof OfferingInput>;

/** Offerings with course name, term, instructor and schedule. */
/** `forStudent`: only the offerings that student is enrolled in (what students may see). */
export async function listOfferings(db: DbOrTx, opts: { ids?: string[]; includeDeleted?: boolean; forStudent?: string } = {}) {
  const where = and(
    opts.includeDeleted ? undefined : isNull(courseOfferings.deletedAt),
    opts.ids ? inArray(courseOfferings.id, opts.ids) : undefined,
    opts.forStudent ? sql`EXISTS (SELECT 1 FROM enrollments e WHERE e.offering_id = ${courseOfferings.id} AND e.student_id = ${opts.forStudent})` : undefined,
  );
  const rows = await db
    .select({
      id: courseOfferings.id,
      legacyId: courseOfferings.legacyId,
      name: courses.name,
      courseId: courses.id,
      yearLevel: courseOfferings.yearLevel,
      schoolType: courseOfferings.schoolType,
      semester: terms.semester,
      schoolYear: schoolYears.label,
      instructorId: courseOfferings.instructorId,
      instructorLabel: courseOfferings.instructorLabel,
      units: courseOfferings.units,
      instructorFirstName: users.firstName,
      instructorLastName: users.lastName,
      deletedAt: courseOfferings.deletedAt,
      createdAt: courseOfferings.createdAt,
    })
    .from(courseOfferings)
    .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
    .innerJoin(terms, eq(terms.id, courseOfferings.termId))
    .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
    .leftJoin(users, eq(users.id, courseOfferings.instructorId))
    .where(where)
    .orderBy(asc(schoolYears.label), asc(courseOfferings.yearLevel), asc(terms.semester), asc(courses.name));
  if (!rows.length) return [];

  const meetings = await db.select().from(offeringMeetings)
    .where(inArray(offeringMeetings.offeringId, rows.map((r) => r.id)))
    .orderBy(asc(offeringMeetings.weekday));
  const byOffering = new Map<string, typeof meetings>();
  for (const m of meetings) byOffering.set(m.offeringId, [...(byOffering.get(m.offeringId) ?? []), m]);

  return rows.map(({ instructorFirstName, instructorLastName, ...r }) => {
    const m = byOffering.get(r.id) ?? [];
    return {
      ...r,
      units: Number(r.units),
      instructorFirstName: r.instructorId ? instructorFirstName : null,
      instructorLastName: r.instructorId ? instructorLastName : null,
      /** The instructor account's name, or the migrated display text when there's no account. */
      instructorName: r.instructorId ? `${instructorFirstName} ${instructorLastName}` : r.instructorLabel,
      schedule: m.length
        ? {
            startsOn: m[0].startsOn,
            startTime: m[0].startTime.slice(0, 5),
            endTime: m[0].endTime.slice(0, 5),
            frequency: m[0].frequency,
            weekdays: m.map((x) => x.weekday).filter((w): w is number => w !== null),
          }
        : null,
    };
  });
}
export type OfferingDto = Awaited<ReturnType<typeof listOfferings>>[number];

async function checkInstructor(db: DbOrTx, instructorId: string | null) {
  if (!instructorId) return;
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, instructorId));
  if (!u) throw new HttpError(400, "instructorId: no such user");
  if (u.role === "student") throw new HttpError(400, "instructorId: a student cannot teach a course");
}

async function writeMeetings(db: DbOrTx, offeringId: string, schedule: OfferingInput["schedule"]) {
  await db.delete(offeringMeetings).where(eq(offeringMeetings.offeringId, offeringId));
  if (!schedule) return;
  const weekdays: (number | null)[] = schedule.frequency === "once" || !schedule.weekdays.length
    ? [null] : [...new Set(schedule.weekdays)];
  await db.insert(offeringMeetings).values(weekdays.map((weekday) => ({
    offeringId, weekday, frequency: schedule.frequency,
    startsOn: schedule.startsOn, startTime: schedule.startTime, endTime: schedule.endTime,
  })));
}

export async function createOffering(db: DbOrTx, input: OfferingInput): Promise<string> {
  await checkInstructor(db, input.instructorId);
  const [row] = await db.insert(courseOfferings).values({
    courseId: await courseId(db, input.name),
    termId: await termId(db, input.schoolYear, input.semester),
    yearLevel: input.yearLevel,
    schoolType: input.schoolType,
    instructorId: input.instructorId,
    ...(input.units !== undefined && { units: String(input.units) }),
  }).returning({ id: courseOfferings.id });
  await writeMeetings(db, row.id, input.schedule);
  return row.id;
}

export async function updateOffering(db: DbOrTx, id: string, input: Partial<OfferingInput>) {
  const [current] = await listOfferings(db, { ids: [id], includeDeleted: true });
  if (!current) throw new HttpError(404, "Offering not found");
  if (input.instructorId !== undefined) await checkInstructor(db, input.instructorId);
  const patch: Partial<typeof courseOfferings.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.courseId = await courseId(db, input.name);
  if (input.yearLevel !== undefined) patch.yearLevel = input.yearLevel;
  if (input.schoolType !== undefined) patch.schoolType = input.schoolType;
  if (input.units !== undefined) patch.units = String(input.units);
  if (input.instructorId !== undefined) {
    patch.instructorId = input.instructorId;
    if (input.instructorId) patch.instructorLabel = null; // an account replaces any migrated display name
  }
  if (input.schoolYear !== undefined || input.semester !== undefined) {
    patch.termId = await termId(db, input.schoolYear ?? current.schoolYear, input.semester ?? current.semester);
  }
  await db.update(courseOfferings).set(patch).where(eq(courseOfferings.id, id));
  if (input.schedule !== undefined) await writeMeetings(db, id, input.schedule);
}

export async function setOfferingDeleted(db: DbOrTx, id: string, deletedBy: string | null) {
  const updated = await db.update(courseOfferings)
    .set(deletedBy ? { deletedAt: sql`now()`, deletedBy } : { deletedAt: null, deletedBy: null })
    .where(eq(courseOfferings.id, id))
    .returning({ id: courseOfferings.id });
  if (!updated.length) throw new HttpError(404, "Offering not found");
}

/**
 * Students enrolled in an offering who don't belong to its school (Day/Night), e.g. from before the
 * course had one. Each says whether it can be removed: never when a grade or attendance is recorded.
 */
export async function mismatchedStudents(db: DbOrTx, offeringId: string) {
  const [o] = await db.select({ schoolType: courseOfferings.schoolType }).from(courseOfferings).where(eq(courseOfferings.id, offeringId));
  if (!o) throw new HttpError(404, "Offering not found");
  if (!o.schoolType) return [];
  const rows = (await db.execute(sql`
    SELECT u.id, u.first_name, u.last_name, sr.student_no, sr.school_type, c.name AS cohort,
           (g.value IS NOT NULL OR coalesce(g.is_incomplete, false)) AS has_grade,
           EXISTS (SELECT 1 FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
                   WHERE s.offering_id = e.offering_id AND ar.student_id = e.student_id) AS has_attendance
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    LEFT JOIN student_records sr ON sr.user_id = e.student_id
    LEFT JOIN cohorts c ON c.id = sr.cohort_id
    LEFT JOIN grades g ON g.enrollment_id = e.id
    WHERE e.offering_id = ${offeringId} AND sr.school_type IS DISTINCT FROM ${o.schoolType}::school_type
    ORDER BY u.last_name, u.first_name`)).rows as Record<string, unknown>[];
  return rows.map((r) => ({
    studentId: r.id as string, studentName: `${r.first_name} ${r.last_name}`, studentNo: (r.student_no as string) ?? null,
    schoolType: (r.school_type as "day" | "night" | null) ?? null, cohort: (r.cohort as string) ?? null,
    cannotRemove: r.has_grade ? "Has a grade" : r.has_attendance ? "Has attendance" : null,
  }));
}

export const UnenrollInput = z.strictObject({ studentIds: z.array(z.uuid()).min(1).max(500) });

/** Removes students from an offering, except those with a grade or attendance there. Audited. */
export async function unenroll(db: DbOrTx, actorId: string, offeringId: string, studentIds: string[]) {
  const all = await mismatchedOrAny(db, offeringId, studentIds);
  const removable = all.filter((s) => !s.cannotRemove).map((s) => s.studentId);
  const skipped = [
    ...all.filter((s) => s.cannotRemove).map((s) => ({ studentId: s.studentId, reason: s.cannotRemove! })),
    ...studentIds.filter((id) => !all.some((s) => s.studentId === id)).map((studentId) => ({ studentId, reason: "Not enrolled" })),
  ];
  if (removable.length) {
    await db.delete(enrollments).where(and(eq(enrollments.offeringId, offeringId), inArray(enrollments.studentId, removable)));
    await db.insert(auditLog).values(removable.map((studentId) => ({
      actorId, action: "enrollment.removed", entity: "user", entityId: studentId, data: { offeringId },
    })));
  }
  return { removed: removable.length, skipped };
}

/** Enrollment state of the given students in an offering (any school), with the same removal rule. */
async function mismatchedOrAny(db: DbOrTx, offeringId: string, studentIds: string[]) {
  const rows = (await db.execute(sql`
    SELECT e.student_id,
           (g.value IS NOT NULL OR coalesce(g.is_incomplete, false)) AS has_grade,
           EXISTS (SELECT 1 FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
                   WHERE s.offering_id = e.offering_id AND ar.student_id = e.student_id) AS has_attendance
    FROM enrollments e LEFT JOIN grades g ON g.enrollment_id = e.id
    WHERE e.offering_id = ${offeringId} AND e.student_id IN (${sql.join(studentIds.map((id) => sql`${id}::uuid`), sql`, `)})
    FOR UPDATE OF e`)).rows as Record<string, unknown>[];
  return rows.map((r) => ({
    studentId: r.student_id as string,
    cannotRemove: r.has_grade ? "Has a grade" : r.has_attendance ? "Has attendance" : null,
  }));
}
