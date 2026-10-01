import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "./academics.js";
import { notify, type NewNotification } from "./notifications.js";
import { getSetting } from "./settings.js";
import { courseOfferings, courses, users } from "../db/schema.js";

/**
 * After a day's attendance is saved: for these students in this course, counts unexcused absences
 * and records each threshold crossed for the first time (2 = warning, 3 = escalation by default).
 * The primary key on attendance_alerts makes every alert go out exactly once, even when attendance
 * is edited or saved again; a backfill that jumps from 1 to 3 absences sends both. Each new alert
 * notifies the student, the course's teacher and every admin.
 */
export async function checkAbsenceAlerts(db: DbOrTx, offeringId: string, studentIds: string[]) {
  if (!studentIds.length) return [];
  const rules = await getSetting(db, "attendanceAlerts");
  const thresholds = [...new Set([rules.warnAt, rules.escalateAt])].sort((a, b) => a - b);
  const statuses = rules.countLate ? ["absent", "late"] : ["absent"];
  const ids = sql.join(studentIds.map((id) => sql`${id}::uuid`), sql`, `);
  const kinds = sql.join(statuses.map((s) => sql`${s}::attendance_status`), sql`, `);

  const crossed = (await db.execute(sql`
    WITH counts AS (
      SELECT r.student_id, s.offering_id, count(*)::smallint AS absences
      FROM attendance_records r
      JOIN attendance_sessions s ON s.id = r.session_id
      WHERE s.offering_id = ${offeringId} AND r.student_id IN (${ids})
        AND r.status IN (${kinds}) AND (NOT r.is_excused OR ${rules.countExcused})
      GROUP BY r.student_id, s.offering_id
    )
    INSERT INTO attendance_alerts (student_id, offering_id, threshold, absences)
    SELECT c.student_id, c.offering_id, t.threshold, c.absences
    FROM counts c CROSS JOIN (VALUES ${sql.join(thresholds.map((t) => sql`(${t}::smallint)`), sql`, `)}) AS t(threshold)
    WHERE c.absences >= t.threshold
    ON CONFLICT DO NOTHING
    RETURNING student_id, threshold, absences`)).rows as { student_id: string; threshold: number; absences: number }[];
  if (!crossed.length) return [];

  const [offering] = await db.select({ course: courses.name, instructorId: courseOfferings.instructorId })
    .from(courseOfferings).innerJoin(courses, eq(courses.id, courseOfferings.courseId))
    .where(eq(courseOfferings.id, offeringId));
  const admins = (await db.select({ id: users.id }).from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active")))).map((u) => u.id);
  const names = new Map((await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users).where(inArray(users.id, crossed.map((c) => c.student_id)))).map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const items: NewNotification[] = [];
  for (const c of crossed) {
    const escalated = c.threshold >= rules.escalateAt;
    const kind = escalated ? "attendance_escalation" : "attendance_warning";
    const n = `${c.threshold} unexcused absence${c.threshold === 1 ? "" : "s"}`;
    const data = { studentId: c.student_id, offeringId, threshold: c.threshold, absences: c.absences };
    const title = escalated ? `Attendance concern: ${offering.course}` : `Attendance warning: ${offering.course}`;
    items.push({
      userId: c.student_id, kind, title, link: "records", data,
      body: escalated
        ? `You now have ${n} in ${offering.course}. Please speak with your teacher or the school office as soon as possible.`
        : `You have ${n} in ${offering.course}. Please make sure to attend the next classes.`,
    });
    const staff = new Set([...(offering.instructorId ? [offering.instructorId] : []), ...admins]);
    staff.delete(c.student_id);
    for (const userId of staff) {
      items.push({
        userId, kind, title, data,
        link: admins.includes(userId) ? "attendance" : "grades",
        body: `${names.get(c.student_id) ?? "A student"} has ${n} in ${offering.course}.${escalated ? " This needs follow-up." : ""}`,
      });
    }
  }
  await notify(db, items);
  return crossed;
}
