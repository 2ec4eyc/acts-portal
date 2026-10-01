import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { schoolYearId, syncEnrollments } from "./academics.js";
import { firebaseAuth } from "./auth.js";
import type { Db } from "./db.js";
import { HttpError } from "./http.js";
import { SelfProfileUpdate, writeProfileFields } from "./profiles.js";
import {
  auditLog, cohorts, courseOfferings, courses, enrollments, gradeChanges, materials, transcripts,
  studentRecords, studentYearLevels, users,
} from "../db/schema.js";

const schoolYearLabel = z.string().regex(/^\d{4}-\d{4}$/, "expected YYYY-YYYY");
const yearLevel = z.union([z.literal(1), z.literal(2)]);

export const StudentFields = z.strictObject({
  studentNo: z.string().trim().max(40).nullable(),
  schoolType: z.enum(["day", "night"]).nullable(),
  cohort: z.string().trim().max(100).nullable(),
  currentYearLevel: yearLevel.nullable(),
  /** School year for each year level, e.g. { "1": "2026-2027" }; null clears it. */
  schoolYears: z.strictObject({ 1: schoolYearLabel.nullable(), 2: schoolYearLabel.nullable() }).partial(),
}).partial();

export const AccountUpdate = SelfProfileUpdate.extend({
  email: z.email().trim().toLowerCase(),
  role: z.enum(["student", "teacher", "admin", "president", "vice_president"]),
  status: z.enum(["active", "pending"]),
  student: StudentFields,
}).partial();
export type AccountUpdate = z.infer<typeof AccountUpdate>;

export const AccountCreate = AccountUpdate.extend({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(6).max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: AccountUpdate.shape.role.unwrap().default("student"),
});
export type AccountCreate = z.infer<typeof AccountCreate>;

type UserRow = typeof users.$inferSelect;

export async function getUserRow(db: DbOrTx, id: string): Promise<UserRow> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw new HttpError(404, "User not found");
  return u;
}

async function assertEmailFree(db: DbOrTx, email: string, exceptId?: string) {
  const [taken] = await db.select({ id: users.id }).from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (taken && taken.id !== exceptId) throw new HttpError(409, "That email address is already used by another account");
}

async function writeStudentFields(db: DbOrTx, userId: string, s: z.infer<typeof StudentFields>) {
  const patch: Partial<typeof studentRecords.$inferInsert> = {};
  if (s.studentNo !== undefined) patch.studentNo = s.studentNo || null;
  if (s.schoolType !== undefined) patch.schoolType = s.schoolType;
  if (s.currentYearLevel !== undefined) patch.currentYearLevel = s.currentYearLevel;
  if (s.cohort !== undefined) {
    if (s.cohort) {
      await db.insert(cohorts).values({ name: s.cohort, schoolType: s.schoolType ?? "day" }).onConflictDoNothing();
      const [c] = await db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.name, s.cohort));
      patch.cohortId = c.id;
    } else {
      patch.cohortId = null;
    }
  }
  if (patch.studentNo) {
    const [dup] = await db.select({ userId: studentRecords.userId }).from(studentRecords)
      .where(eq(studentRecords.studentNo, patch.studentNo));
    if (dup && dup.userId !== userId) throw new HttpError(409, "That student number is already used");
  }
  await db.insert(studentRecords).values({ userId, ...patch })
    .onConflictDoUpdate({ target: studentRecords.userId, set: Object.keys(patch).length ? patch : { userId } });
  for (const [level, label] of Object.entries(s.schoolYears ?? {})) {
    const lvl = Number(level);
    if (label === null) {
      await db.delete(studentYearLevels).where(and(eq(studentYearLevels.studentId, userId), eq(studentYearLevels.yearLevel, lvl)));
    } else if (label !== undefined) {
      const syId = await schoolYearId(db, label);
      await db.insert(studentYearLevels).values({ studentId: userId, yearLevel: lvl, schoolYearId: syId })
        .onConflictDoUpdate({ target: [studentYearLevels.studentId, studentYearLevels.yearLevel], set: { schoolYearId: syId } });
    }
  }
}

const firebaseError = (err: unknown): never => {
  const code = (err as { code?: string }).code ?? "";
  if (code === "auth/email-already-exists") throw new HttpError(409, "That email address is already used by another login");
  if (code === "auth/invalid-password") throw new HttpError(400, "password: must be at least 6 characters");
  if (code === "auth/invalid-email") throw new HttpError(400, "email: invalid");
  throw err;
};

/** Creates the Firebase login and the portal account together; undoes the login if the database write fails. */
export async function createAccount(db: Db, input: AccountCreate): Promise<string> {
  await assertEmailFree(db, input.email);
  const { email, password, role, status, student, ...profile } = input;
  const login = await firebaseAuth()
    .createUser({ email, password, displayName: `${profile.firstName} ${profile.lastName}` })
    .catch(firebaseError);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(users).values({
        firebaseUid: login.uid, email, role, status: status ?? "active",
        firstName: profile.firstName, lastName: profile.lastName,
      }).returning({ id: users.id });
      await writeProfileFields(tx, row.id, profile);
      if (role === "student") {
        await writeStudentFields(tx, row.id, student ?? {});
        await syncEnrollments(tx, { studentIds: [row.id] });
      }
      return row.id;
    });
  } catch (err) {
    await firebaseAuth().deleteUser(login.uid).catch(() => {});
    throw err;
  }
}

/** Updates an account; the Firebase email changes in the same transaction (rolled back if it fails). */
export async function updateAccount(db: Db, target: UserRow, input: AccountUpdate) {
  const { email, role, status, student, ...profile } = input;
  if (email && email !== target.email.toLowerCase()) await assertEmailFree(db, email, target.id);
  await db.transaction(async (tx) => {
    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (email) patch.email = email;
    if (role) patch.role = role;
    if (status) patch.status = status;
    await tx.update(users).set(patch).where(eq(users.id, target.id));
    await writeProfileFields(tx, target.id, profile);
    const isStudent = (role ?? target.role) === "student";
    if (isStudent) {
      if (student) await writeStudentFields(tx, target.id, student);
      await syncEnrollments(tx, { studentIds: [target.id] });
    }
    if (email && email !== target.email.toLowerCase()) {
      await firebaseAuth().updateUser(target.firebaseUid, { email }).catch(firebaseError);
    }
  });
}

export async function setArchived(db: Db, ids: string[], archived: boolean) {
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.update(users)
      .set(archived
        ? { status: "archived", archivedAt: new Date(), updatedAt: new Date() }
        : { status: "active", archivedAt: null, updatedAt: new Date() })
      .where(inArray(users.id, ids))
      .returning({ id: users.id });
    if (!archived) await syncEnrollments(tx, { studentIds: ids });
    return rows;
  });
  if (updated.length !== ids.length) throw new HttpError(404, "Some users were not found");
}

/** Permanently deletes an archived account, its enrollments and grades, and its Firebase login. */
export async function deleteAccount(db: Db, target: UserRow) {
  if (target.status !== "archived") throw new HttpError(409, "Archive the account before deleting it");
  const [upload] = await db.select({ id: materials.id }).from(materials).where(eq(materials.uploadedBy, target.id)).limit(1);
  if (upload) throw new HttpError(409, "This account uploaded course materials; delete or reassign those first");
  const [issued] = await db.select({ id: transcripts.id }).from(transcripts).where(eq(transcripts.studentId, target.id)).limit(1);
  if (issued) throw new HttpError(409, "This student has issued transcripts, which are kept as official records");
  await db.transaction(async (tx) => {
    await tx.delete(enrollments).where(eq(enrollments.studentId, target.id));
    await tx.delete(users).where(eq(users.id, target.id));
    await firebaseAuth().deleteUser(target.firebaseUid).catch((err: { code?: string }) => {
      if (err.code !== "auth/user-not-found") throw err;
    });
  });
}

/** Sets year level, cohort and school year for students, then enrolls them in matching offerings. */
export const EnrollInput = z.strictObject({
  studentIds: z.array(z.uuid()).min(1).max(1000),
  yearLevel,
  cohort: z.string().trim().min(1).max(100),
  schoolYear: schoolYearLabel,
});
export async function enrollStudents(db: Db, input: z.infer<typeof EnrollInput>) {
  const ids = [...new Set(input.studentIds)];
  return db.transaction(async (tx) => {
    const found = await tx.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, ids));
    if (found.length !== ids.length || found.some((u) => u.role !== "student")) {
      throw new HttpError(400, "studentIds: every id must be an existing student");
    }
    for (const id of ids) {
      await writeStudentFields(tx, id, {
        currentYearLevel: input.yearLevel, cohort: input.cohort,
        schoolYears: { [input.yearLevel]: input.schoolYear },
      });
    }
    return syncEnrollments(tx, { studentIds: ids });
  });
}

/** Removes students' enrollments (and grades) in archived offerings; logs what was removed. */
export async function cleanUpRecords(db: Db, studentIds: string[], actorId: string) {
  return db.transaction(async (tx) => {
    const removed = await tx.delete(enrollments)
      .where(and(
        inArray(enrollments.studentId, studentIds),
        inArray(enrollments.offeringId, tx.select({ id: courseOfferings.id }).from(courseOfferings).where(isNotNull(courseOfferings.deletedAt))),
      ))
      .returning({ studentId: enrollments.studentId, offeringId: enrollments.offeringId });
    if (removed.length) {
      await tx.insert(auditLog).values(removed.map((r) => ({
        actorId, action: "enrollment.cleaned_up", entity: "user", entityId: r.studentId, data: { offeringId: r.offeringId },
      })));
    }
    return removed.length;
  });
}

/** Grade changes and legacy edit-history entries for a student, newest first. */
export async function history(db: DbOrTx, userId: string) {
  const changes = await db
    .select({
      id: gradeChanges.id, at: gradeChanges.changedAt, courseName: courses.name,
      editorFirst: users.firstName, editorLast: users.lastName,
      newValue: gradeChanges.newValue, newIncomplete: gradeChanges.newIncomplete, reason: gradeChanges.reason,
    })
    .from(gradeChanges)
    .innerJoin(enrollments, eq(enrollments.id, gradeChanges.enrollmentId))
    .innerJoin(courseOfferings, eq(courseOfferings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
    .leftJoin(users, eq(users.id, gradeChanges.changedBy))
    .where(eq(enrollments.studentId, userId))
    .orderBy(desc(gradeChanges.changedAt));
  const legacy = await db.select().from(auditLog)
    .where(and(eq(auditLog.entity, "user"), eq(auditLog.entityId, userId), eq(auditLog.action, "legacy.edit_history")))
    .orderBy(desc(auditLog.at));

  const entries = [
    ...changes.map((c) => ({
      id: `change-${c.id}`,
      at: c.at.toISOString(),
      editedBy: c.editorFirst ? `${c.editorFirst} ${c.editorLast}` : "Unknown",
      action: c.newValue === null && !c.newIncomplete ? `Reset grade for ${c.courseName}` : `Updated grade for ${c.courseName}`,
      details: c.newIncomplete ? "Grade: Incomplete" : c.newValue === null ? "Grade reset to Pending" : `Grade: ${Number(c.newValue)}`,
    })),
    ...legacy.map((l) => {
      const d = (l.data ?? {}) as { editedBy?: string; action?: string; details?: string };
      return { id: `legacy-${l.id}`, at: l.at.toISOString(), editedBy: d.editedBy ?? "Unknown", action: d.action ?? "", details: d.details ?? "" };
    }),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
