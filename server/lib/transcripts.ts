import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { can, type User } from "./auth.js";
import type { Db } from "./db.js";
import { listGrades } from "./grades.js";
import { HttpError } from "./http.js";
import { listProfiles } from "./profiles.js";
import { auditLog, transcripts, users } from "../db/schema.js";

export const SCHOOL_NAME = "ACTS Bible School";
export const PASSING_GRADE = 75;

export type TranscriptCourse = { name: string; units: number; grade: number | null; remark: "Passed" | "Failed" | "Incomplete" };
export type TranscriptTerm = {
  schoolYear: string; yearLevel: number; semester: number;
  courses: TranscriptCourse[]; unitsEarned: number;
};
export type TranscriptContent = {
  version: 1;
  school: string;
  student: {
    fullName: string; firstName: string; middleName: string | null; lastName: string;
    studentNo: string | null; schoolType: string | null; cohort: string | null; birthDate: string | null;
  };
  terms: TranscriptTerm[];
  totals: { unitsAttempted: number; unitsEarned: number; generalAverage: number | null };
  passingGrade: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds a student's transcript from their current grades. Only finished courses count: a grade or
 * Incomplete in an active (not archived) offering. Pending courses are left off. The general
 * average is weighted by units over graded courses (Incomplete excluded).
 */
export async function buildTranscript(db: DbOrTx, studentId: string): Promise<TranscriptContent> {
  const [student] = await listProfiles(db, { ids: [studentId] });
  if (!student) throw new HttpError(404, "Student not found");
  if (!student.student) throw new HttpError(400, "Transcripts are for student accounts only");

  const rows = (await listGrades(db, { studentId }))
    .filter((g) => !g.offeringArchived && g.status !== "pending");
  const terms: TranscriptTerm[] = [];
  for (const g of rows) {
    let term = terms.find((t) => t.schoolYear === g.schoolYear && t.yearLevel === g.yearLevel && t.semester === g.semester);
    if (!term) terms.push(term = { schoolYear: g.schoolYear, yearLevel: g.yearLevel, semester: g.semester, courses: [], unitsEarned: 0 });
    const remark = g.status === "incomplete" ? "Incomplete" : g.status === "passed" ? "Passed" : "Failed";
    term.courses.push({ name: g.courseName, units: g.units, grade: g.isIncomplete ? null : g.value, remark });
    if (remark === "Passed") term.unitsEarned += g.units;
  }
  const all = terms.flatMap((t) => t.courses);
  const graded = all.filter((c) => c.grade !== null);
  const gradedUnits = graded.reduce((n, c) => n + c.units, 0);
  return {
    version: 1,
    school: SCHOOL_NAME,
    student: {
      fullName: student.fullName, firstName: student.firstName, middleName: student.middleName, lastName: student.lastName,
      studentNo: student.student.studentNo, schoolType: student.student.schoolType, cohort: student.student.cohort,
      birthDate: (student.profile as { birthDate?: string | null }).birthDate ?? null,
    },
    terms,
    totals: {
      unitsAttempted: all.reduce((n, c) => n + c.units, 0),
      unitsEarned: terms.reduce((n, t) => n + t.unitsEarned, 0),
      generalAverage: gradedUnits ? round2(graded.reduce((n, c) => n + c.grade! * c.units, 0) / gradedUnits) : null,
    },
    passingGrade: PASSING_GRADE,
  };
}

/** 12 characters from an unambiguous alphabet (~60 bits), shown as XXXX-XXXX-XXXX. */
function newCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, (b) => alphabet[b % 32]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export const IssueInput = z.strictObject({
  studentId: z.uuid(),
  purpose: z.string().trim().max(200).nullish(),
});

export async function issueTranscript(db: Db, actor: User, input: z.infer<typeof IssueInput>) {
  return db.transaction(async (tx) => {
    const content = await buildTranscript(tx, input.studentId);
    if (!content.terms.length) throw new HttpError(409, "This student has no finished courses yet");
    const [row] = await tx.insert(transcripts).values({
      studentId: input.studentId, code: newCode(), purpose: input.purpose || null, content, issuedBy: actor.id,
    }).returning({ id: transcripts.id, code: transcripts.code });
    await tx.insert(auditLog).values({
      actorId: actor.id, action: "transcript.issued", entity: "transcript", entityId: row.id,
      data: { studentId: input.studentId, code: row.code },
    });
    return row.id;
  });
}

const issuer = alias(users, "issuer");
const revoker = alias(users, "revoker");

const transcriptColumns = {
  id: transcripts.id,
  studentId: transcripts.studentId,
  code: transcripts.code,
  purpose: transcripts.purpose,
  issuedAt: transcripts.issuedAt,
  issuedByFirst: issuer.firstName,
  issuedByLast: issuer.lastName,
  revokedAt: transcripts.revokedAt,
  revokedByFirst: revoker.firstName,
  revokedByLast: revoker.lastName,
  revokeReason: transcripts.revokeReason,
};
type Row = { [K in keyof typeof transcriptColumns]: unknown } & Record<string, unknown>;
const name = (first: unknown, last: unknown) => (first ? `${first} ${last}` : null);
function summary(r: Row) {
  return {
    id: r.id as string, studentId: r.studentId as string, code: r.code as string, purpose: r.purpose as string | null,
    issuedAt: r.issuedAt as Date, issuedBy: name(r.issuedByFirst, r.issuedByLast),
    revokedAt: r.revokedAt as Date | null, revokedBy: name(r.revokedByFirst, r.revokedByLast),
    revokeReason: r.revokeReason as string | null,
  };
}

function select(db: DbOrTx, withContent: boolean) {
  return db.select(withContent ? { ...transcriptColumns, content: transcripts.content } : transcriptColumns)
    .from(transcripts)
    .leftJoin(issuer, eq(issuer.id, transcripts.issuedBy))
    .leftJoin(revoker, eq(revoker.id, transcripts.revokedBy));
}

/** Office staff can read any student's transcripts; a student only their own (teachers can't). */
function assertCanRead(user: User, studentId: string) {
  if (user.id !== studentId && !can(user, "users:read")) throw new HttpError(403, "Forbidden");
}

export async function listTranscripts(db: DbOrTx, user: User, studentId: string) {
  assertCanRead(user, studentId);
  const rows = await select(db, false).where(eq(transcripts.studentId, studentId)).orderBy(desc(transcripts.issuedAt));
  return rows.map((r) => summary(r as Row));
}

export async function getTranscript(db: DbOrTx, user: User, id: string) {
  const [r] = await select(db, true).where(eq(transcripts.id, id));
  if (!r) throw new HttpError(404, "Transcript not found");
  assertCanRead(user, r.studentId);
  return { ...summary(r as Row), content: (r as { content: TranscriptContent }).content };
}

export const RevokeInput = z.strictObject({ reason: z.string().trim().min(1).max(500) });

export async function revokeTranscript(db: Db, actor: User, id: string, reason: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.update(transcripts)
      .set({ revokedAt: new Date(), revokedBy: actor.id, revokeReason: reason })
      .where(and(eq(transcripts.id, id), isNull(transcripts.revokedAt)))
      .returning({ id: transcripts.id });
    if (!row) {
      const [exists] = await tx.select({ id: transcripts.id }).from(transcripts).where(eq(transcripts.id, id));
      throw new HttpError(exists ? 409 : 404, exists ? "Already revoked" : "Transcript not found");
    }
    await tx.insert(auditLog).values({
      actorId: actor.id, action: "transcript.revoked", entity: "transcript", entityId: id, data: { reason },
    });
  });
}

/** Public check for the code printed on a transcript. Deliberately no grades. */
export async function verifyCode(db: DbOrTx, code: string) {
  const normalized = code.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (normalized.length !== 12) return null;
  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8)}`;
  const [r] = await select(db, true).where(eq(transcripts.code, formatted));
  if (!r) return null;
  const s = summary(r as Row);
  const content = (r as { content: TranscriptContent }).content;
  return {
    status: s.revokedAt ? "revoked" : "valid",
    school: content.school,
    studentName: content.student.fullName,
    studentNo: content.student.studentNo,
    issuedAt: s.issuedAt,
    issuedBy: s.issuedBy,
    revokedAt: s.revokedAt,
  };
}
