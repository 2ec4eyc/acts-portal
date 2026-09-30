import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./db.js";
import { courses, schoolYears, terms } from "../db/schema.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

/** Finds or creates a school year by its label, e.g. "2026-2027". */
export async function schoolYearId(db: DbOrTx, label: string): Promise<number> {
  await db.insert(schoolYears).values({ label }).onConflictDoNothing();
  const [row] = await db.select({ id: schoolYears.id }).from(schoolYears).where(eq(schoolYears.label, label));
  return row.id;
}

/** Finds or creates the term for a school year and semester (1-3). */
export async function termId(db: DbOrTx, schoolYearLabel: string, semester: number): Promise<number> {
  const syId = await schoolYearId(db, schoolYearLabel);
  await db.insert(terms).values({ schoolYearId: syId, semester }).onConflictDoNothing();
  const [row] = await db.select({ id: terms.id }).from(terms)
    .where(and(eq(terms.schoolYearId, syId), eq(terms.semester, semester)));
  return row.id;
}

/** Finds a catalog course by name (case-insensitive) or creates it. */
export async function courseId(db: DbOrTx, name: string): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await db.select({ id: courses.id }).from(courses)
    .where(sql`lower(${courses.name}) = lower(${trimmed})`).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(courses).values({ name: trimmed }).returning({ id: courses.id });
  return created.id;
}

/**
 * Enrolls students in every active offering that matches their current year level and the school
 * year recorded for that level (what the app did in syncStudentToCourses / syncCourseToStudents).
 * Never removes enrollments. Pass studentIds and/or offeringIds to limit the scope.
 * Returns the number of new enrollments.
 */
export async function syncEnrollments(db: DbOrTx, scope: { studentIds?: string[]; offeringIds?: string[] }) {
  if (scope.studentIds?.length === 0 || scope.offeringIds?.length === 0) return 0;
  const studentFilter = scope.studentIds ? sql`AND sr.user_id IN (${sql.join(scope.studentIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  const offeringFilter = scope.offeringIds ? sql`AND o.id IN (${sql.join(scope.offeringIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  const result = await db.execute(sql`
    INSERT INTO enrollments (offering_id, student_id)
    SELECT o.id, sr.user_id
    FROM student_records sr
    JOIN users u ON u.id = sr.user_id AND u.role = 'student' AND u.status <> 'archived'
    JOIN student_year_levels syl ON syl.student_id = sr.user_id AND syl.year_level = sr.current_year_level
    JOIN terms t ON t.school_year_id = syl.school_year_id
    JOIN course_offerings o ON o.term_id = t.id AND o.year_level = sr.current_year_level AND o.deleted_at IS NULL
    WHERE TRUE ${studentFilter} ${offeringFilter}
    ON CONFLICT (offering_id, student_id) DO NOTHING`);
  return result.rowCount ?? 0;
}

