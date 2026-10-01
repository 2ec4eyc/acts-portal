import { and, desc, eq, gte, inArray, lt, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import {
  attendanceSessions, auditLog, courseOfferings, courses, enrollments, users,
} from "../db/schema.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
export const AuditQuery = z.object({
  table: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  actorId: z.uuid().optional(),
  entityId: z.string().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Cursor: return entries older than this id. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type Row = Record<string, unknown> | null;
/** Columns that hold a user id; the API shows the person's name instead. */
const PERSON_FIELDS = new Set(["recorded_by", "instructor_id", "updated_by", "deleted_by", "uploaded_by", "issued_by", "revoked_by", "student_id", "user_id",
  "created_by", "reviewed_by", "voided_by", "file_deleted_by"]);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

const SETTING_NAMES: Record<string, string> = {
  features: "Feature switches", attendanceAlerts: "Absence alerts", billing: "Payment reminders", storage: "Storage limits",
};

/** Fields that differ between the old and new row (all of them for an add or a removal). */
function changes(oldRow: Row, newRow: Row) {
  const keys = [...new Set([...Object.keys(oldRow ?? {}), ...Object.keys(newRow ?? {})])];
  return keys
    .filter((k) => JSON.stringify(oldRow?.[k] ?? null) !== JSON.stringify(newRow?.[k] ?? null))
    .map((k) => ({ field: k, from: oldRow?.[k] ?? null, to: newRow?.[k] ?? null }));
}

/** Newest first, with who did it and a readable subject ("Sam Student · Old Testament Survey"). */
export async function listAudit(db: DbOrTx, q: z.infer<typeof AuditQuery>) {
  const where: SQL[] = [];
  if (q.table) where.push(eq(auditLog.entity, q.table));
  if (q.actorId) where.push(eq(auditLog.actorId, q.actorId));
  if (q.entityId) where.push(eq(auditLog.entityId, q.entityId));
  if (q.from) where.push(gte(auditLog.at, new Date(`${q.from}T00:00:00+08:00`)));
  if (q.to) where.push(lte(auditLog.at, new Date(`${q.to}T23:59:59.999+08:00`)));
  if (q.before) where.push(lt(auditLog.id, q.before));
  const rows = await db.select().from(auditLog).where(and(...where)).orderBy(desc(auditLog.id)).limit(q.limit + 1);
  const page = rows.slice(0, q.limit);

  // Look up the people, enrollments and class meetings the entries refer to, in a few batch queries.
  const userIds = new Set<string>();
  const enrollmentIds = new Set<string>();
  const sessionIds = new Set<string>();
  const courseIds = new Set<string>();
  for (const r of page) {
    if (r.actorId) userIds.add(r.actorId);
    for (const row of [r.old, r.new] as Row[]) {
      for (const f of PERSON_FIELDS) if (str(row?.[f])) userIds.add(str(row?.[f])!);
    }
    const row = (r.new ?? r.old) as Row;
    const t = r.tableName;
    if (t === "users" || t === "user_profiles" || t === "student_records" || t === "attendance_records") userIds.add(r.entityId);
    if (t === "grades") enrollmentIds.add(r.entityId);
    if (t === "attendance_records" && str(row?.session_id)) sessionIds.add(str(row?.session_id)!);
    if (t === "course_offerings" && str(row?.course_id)) courseIds.add(str(row?.course_id)!);
    if (t === "transcripts" && str(row?.student_id)) userIds.add(str(row?.student_id)!);
  }
  const people = new Map<string, { name: string; email: string }>();
  if (userIds.size) {
    for (const u of await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users).where(inArray(users.id, [...userIds]))) people.set(u.id, { name: `${u.firstName} ${u.lastName}`, email: u.email });
  }
  const enrollmentInfo = new Map<string, string>();
  if (enrollmentIds.size) {
    for (const e of await db.select({ id: enrollments.id, firstName: users.firstName, lastName: users.lastName, course: courses.name })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .innerJoin(courseOfferings, eq(courseOfferings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(inArray(enrollments.id, [...enrollmentIds]))) enrollmentInfo.set(e.id, `${e.firstName} ${e.lastName} · ${e.course}`);
  }
  const sessionInfo = new Map<string, string>();
  if (sessionIds.size) {
    for (const s of await db.select({ id: attendanceSessions.id, heldOn: attendanceSessions.heldOn, course: courses.name })
      .from(attendanceSessions)
      .innerJoin(courseOfferings, eq(courseOfferings.id, attendanceSessions.offeringId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(inArray(attendanceSessions.id, [...sessionIds]))) sessionInfo.set(s.id, `${s.course}, ${s.heldOn}`);
  }
  const courseNames = new Map<string, string>();
  if (courseIds.size) {
    for (const c of await db.select({ id: courses.id, name: courses.name }).from(courses).where(inArray(courses.id, [...courseIds]))) {
      courseNames.set(c.id, c.name);
    }
  }

  const student = (row: Row) => people.get(str(row?.student_id) ?? "")?.name;
  const peso = (v: unknown) => (v == null ? undefined : `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const subject = (r: (typeof page)[number]) => {
    const row = (r.new ?? r.old) as Row;
    const rowName = row?.first_name ? `${row.first_name} ${row.last_name}` : undefined;
    switch (r.tableName) {
      case "users": case "user_profiles": case "student_records":
        return people.get(r.entityId)?.name ?? rowName ?? "Deleted account";
      case "grades": return enrollmentInfo.get(r.entityId) ?? "Removed enrollment";
      case "attendance_records":
        return [people.get(r.entityId)?.name ?? "Deleted account", sessionInfo.get(str(row?.session_id) ?? "")].filter(Boolean).join(" · ");
      case "course_offerings": return courseNames.get(str(row?.course_id) ?? "") ?? "Course";
      case "transcripts": return `${people.get(str(row?.student_id) ?? "")?.name ?? "Student"} · ${str(row?.code) ?? ""}`;
      case "materials": return str(row?.file_name) ?? "File";
      case "app_settings": return SETTING_NAMES[r.entityId] ?? r.entityId;
      case "announcements": return str(row?.title) ?? "Announcement";
      case "conversations": return `Chat with ${student(row) ?? "a deleted account"}`;
      case "invoices": return [str(row?.number), student(row)].filter(Boolean).join(" · ");
      case "invoice_lines": return [str(row?.description), peso(row?.amount)].filter(Boolean).join(" · ");
      case "payments": return [student(row), peso(row?.amount)].filter(Boolean).join(" · ");
      case "payment_allocations": return `Payment applied · ${peso(row?.amount) ?? ""}`.trim();
      case "receipt_uploads": return [student(row), peso(row?.amount_claimed)].filter(Boolean).join(" · ") || "Receipt";
      default: return r.entityId;
    }
  };

  const personName = (v: unknown) => (typeof v === "string" ? people.get(v)?.name ?? "Deleted account" : v);

  return {
    entries: page.map((r) => ({
      id: r.id,
      at: r.at,
      action: r.action,
      table: r.tableName ?? r.entity,
      op: r.op,
      entityId: r.entityId,
      subject: subject(r),
      actor: r.actorId
        ? { id: r.actorId, ...(people.get(r.actorId) ?? { name: "Deleted account", email: null }) }
        : null,
      source: (r.data as { source?: string } | null)?.source ?? null,
      changes: r.tableName
        ? changes(r.old as Row, r.new as Row).map((c) => PERSON_FIELDS.has(c.field)
          ? { ...c, from: personName(c.from), to: personName(c.to) }
          : c)
        : [],
      data: r.tableName ? null : r.data,
    })),
    nextBefore: rows.length > q.limit ? page[page.length - 1].id : null,
  };
}
