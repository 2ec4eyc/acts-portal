// Step 2 (pure): Firestore JSON dump -> rows for every Postgres table, plus a problem report.
// No I/O besides reading migration-data/, so re-running always produces the same output.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type * as s from "../../server/db/schema.js";

type Row<T extends { $inferInsert: unknown }> = T["$inferInsert"];

// Deterministic UUID (v5-style) from a legacy key: re-running the migration yields the same ids.
export const legacyUuid = (ns: string, key: string) => {
  const h = createHash("sha1").update(`${ns}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const opt = z.string().optional();
const FsGrade = z.object({
  id: z.string(), courseName: opt,
  gradeValue: z.union([z.number(), z.string()]).optional(),
  isIncomplete: z.boolean().optional(), dateReleased: opt,
});
const FsHistory = z.object({ id: opt, editedBy: opt, action: opt, timestamp: opt, details: opt }).passthrough();
const FsUser = z.object({
  _id: z.string(), uid: opt, email: z.string().trim().email(),
  firstName: opt, middleName: opt, lastName: opt, fullName: opt, photoURL: opt, contactNumber: opt,
  role: z.enum(["student", "admin", "vice president", "president", "teacher"]),
  adminCategory: z.enum(["Day Secretary", "Night Secretary", "Faculty", "Admin"]).optional(),
  status: z.enum(["Active", "Pending", "Archived"]).default("Active"),
  studentId: opt, batchName: opt,
  schoolType: z.enum(["Day School", "Night School"]).optional(),
  yearLevel: z.enum(["1st Year", "2nd Year"]).optional(),
  firstYearSchoolYear: opt, secondYearSchoolYear: opt,
  gender: opt, birthDate: opt, address: opt, city: opt, province: opt, postalCode: opt,
  church: opt, pastorName: opt,
  holyGhostBaptismDate: opt, holyGhostBaptismLocation: opt, waterBaptismDate: opt, waterBaptismLocation: opt,
  emergencyFirstName: opt, emergencyLastName: opt, emergencyRelationship: opt, emergencyContactNumber: opt,
  grades: z.array(FsGrade).default([]),
  editHistory: z.array(FsHistory).default([]),
  archivedAt: opt, createdAt: opt,
});
const FsCourse = z.object({
  _id: z.string(), name: z.string().trim().min(1), professor: opt, instructorId: opt,
  date: opt, startTime: opt, endTime: opt,
  isRecurring: z.boolean().optional(), daysOfWeek: z.array(z.string()).optional(),
  frequency: z.enum(["Daily", "Weekly", "Bi-weekly", "Monthly"]).optional(),
  yearLevel: z.enum(["1st Year", "2nd Year"]),
  semester: z.enum(["1st Semester", "2nd Semester", "3rd Semester"]),
  schoolYear: opt, archivedAt: opt, createdAt: opt,
});
const FsAttendance = z.object({
  _id: z.string(), courseId: z.string(), date: z.string(), studentId: z.string(),
  status: z.enum(["present", "absent"]), isExcused: z.boolean().optional(), notes: opt,
});
const FsFile = z.object({
  _id: z.string(), courseId: z.string(), teacherUid: z.string(),
  category: z.enum(["notes", "exams", "activity"]), fileName: z.string().trim().min(1),
  fileData: z.string(), fileType: opt, eventDate: opt, eventTime: opt, instructions: opt,
  archived: z.boolean().optional(), createdAt: opt,
});
type FsUser = z.infer<typeof FsUser>;

const ROLE = { student: "student", admin: "admin", teacher: "teacher", president: "president", "vice president": "vice_president" } as const;
const CATEGORY = { "Day Secretary": "day_secretary", "Night Secretary": "night_secretary", Faculty: "faculty", Admin: "admin" } as const;
const STATUS = { Active: "active", Pending: "pending", Archived: "archived" } as const;
const FREQUENCY = { Daily: "daily", Weekly: "weekly", "Bi-weekly": "biweekly", Monthly: "monthly" } as const;
const WEEKDAY: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

const yearLevel = (y: string) => (y === "2nd Year" ? 2 : 1);
const semester = (sem: string) => Number(sem[0]);
const ts = (v?: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
// The app stored edit-history times as display text, e.g. "Wednesday, September 30, 2026 at 10:00 AM"
// (in the editor's local time, read here in the migration machine's time zone).
const legacyTs = (v?: string) => ts(v) ?? ts(v?.replace(/^[A-Za-z]+, /, "").replace(" at ", " "));
const blank = (v?: string) => (v && v.trim() ? v.trim() : null);

export function transform(dir = process.env.MIGRATION_DATA_DIR ?? "migration-data") {
  const problems: string[] = [];
  const read = <T>(name: string, schema: z.ZodType<T>): T[] => {
    let raw: unknown[];
    try { raw = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8")); } catch { problems.push(`${name}.json missing`); return []; }
    return raw.flatMap((doc) => {
      const r = schema.safeParse(doc);
      if (r.success) return [r.data];
      const issue = r.error.issues[0];
      problems.push(`${name}/${(doc as { _id: string })._id}: ${issue.path.join(".")} ${issue.message}`);
      return [];
    });
  };
  const isoDate = (v: string | undefined, where: string) => {
    if (!blank(v)) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v!.trim())) return v!.trim();
    problems.push(`${where}: unrecognised date "${v}" (left empty)`);
    return null;
  };

  const active = read("users", FsUser);
  const archived = read("archived_users", FsUser).map((u) => ({ ...u, status: "Archived" as const }));
  const courseDocs = [
    ...read("courses", FsCourse).map((c) => ({ ...c, trashed: false })),
    ...read("trash", FsCourse).map((c) => ({ ...c, trashed: true })),
  ];
  const attendance = read("attendance", FsAttendance);
  const files = read("uploaded_files", FsFile);

  const out = {
    users: [] as Row<typeof s.users>[],
    userProfiles: [] as Row<typeof s.userProfiles>[],
    studentRecords: [] as Row<typeof s.studentRecords>[],
    studentYearLevels: [] as Row<typeof s.studentYearLevels>[],
    schoolYears: new Map<string, number>(),                          // label -> id
    terms: new Map<string, Row<typeof s.terms> & { id: number }>(), // "label#semester" -> row
    cohorts: new Map<string, Row<typeof s.cohorts> & { id: number }>(),
    courses: new Map<string, Row<typeof s.courses> & { id: string }>(), // lower(name) -> row
    offerings: [] as Row<typeof s.courseOfferings>[],
    meetings: [] as Row<typeof s.offeringMeetings>[],
    enrollments: [] as Row<typeof s.enrollments>[],
    grades: [] as Row<typeof s.grades>[],
    sessions: new Map<string, Row<typeof s.attendanceSessions>>(),
    records: [] as Row<typeof s.attendanceRecords>[],
    auditLog: [] as Row<typeof s.auditLog>[],
    materials: [] as Row<typeof s.materials>[],
    materialFiles: [] as Row<typeof s.materialFiles>[],
    problems,
  };
  const schoolYearId = (label: string) => {
    if (!out.schoolYears.has(label)) out.schoolYears.set(label, out.schoolYears.size + 1);
    return out.schoolYears.get(label)!;
  };
  const termId = (sy: string, sem: number) => {
    const key = `${sy}#${sem}`;
    if (!out.terms.has(key)) out.terms.set(key, { id: out.terms.size + 1, schoolYearId: schoolYearId(sy), semester: sem });
    return out.terms.get(key)!.id;
  };

  // --- users + archived_users -> users, user_profiles, student_records, student_year_levels
  const userId = new Map<string, string>(); // firebase uid -> uuid
  const people: FsUser[] = [];
  for (const u of [...active, ...archived]) {
    const uid = u.uid ?? u._id;
    if (userId.has(uid)) { problems.push(`${uid}: in both users and archived_users (kept the active one)`); continue; }
    const id = legacyUuid("user", uid);
    userId.set(uid, id);
    people.push(u);
    const where = `users/${uid}`;
    const [first, ...rest] = (blank(u.fullName) ?? u.email.split("@")[0]).split(/\s+/);
    out.users.push({
      id, firebaseUid: uid, email: u.email,
      firstName: blank(u.firstName) ?? first, middleName: blank(u.middleName), lastName: blank(u.lastName) ?? (rest.join(" ") || "-"),
      photoUrl: blank(u.photoURL), contactNumber: blank(u.contactNumber),
      role: ROLE[u.role], staffCategory: u.adminCategory ? CATEGORY[u.adminCategory] : null,
      status: STATUS[u.status],
      archivedAt: u.status === "Archived" ? (ts(u.archivedAt) ?? new Date(0)) : null,
      ...(ts(u.createdAt) ? { createdAt: ts(u.createdAt)! } : {}),
    });
    out.userProfiles.push({
      userId: id,
      gender: blank(u.gender), birthDate: isoDate(u.birthDate, `${where}.birthDate`),
      address: blank(u.address), city: blank(u.city), province: blank(u.province), postalCode: blank(u.postalCode),
      church: blank(u.church), pastorName: blank(u.pastorName),
      holyGhostBaptismDate: isoDate(u.holyGhostBaptismDate, `${where}.holyGhostBaptismDate`),
      holyGhostBaptismLocation: blank(u.holyGhostBaptismLocation),
      waterBaptismDate: isoDate(u.waterBaptismDate, `${where}.waterBaptismDate`),
      waterBaptismLocation: blank(u.waterBaptismLocation),
      emergencyFirstName: blank(u.emergencyFirstName), emergencyLastName: blank(u.emergencyLastName),
      emergencyRelationship: blank(u.emergencyRelationship), emergencyContactNumber: blank(u.emergencyContactNumber),
    });
    for (const [i, h] of u.editHistory.entries()) {
      out.auditLog.push({
        action: "legacy.edit_history", entity: "user", entityId: id,
        data: h, at: legacyTs(h.timestamp) ?? new Date(0),
      });
      if (!legacyTs(h.timestamp)) problems.push(`${where}.editHistory[${i}]: unreadable timestamp "${h.timestamp ?? ""}"`);
    }
    if (u.role !== "student") continue;
    const cohortName = blank(u.batchName);
    const schoolType = u.schoolType === "Night School" ? "night" : u.schoolType === "Day School" ? "day" : null;
    if (cohortName && !out.cohorts.has(cohortName)) {
      out.cohorts.set(cohortName, { id: out.cohorts.size + 1, name: cohortName, schoolType: schoolType ?? "day" });
    }
    out.studentRecords.push({
      userId: id, studentNo: blank(u.studentId), schoolType,
      cohortId: cohortName ? out.cohorts.get(cohortName)!.id : null,
      currentYearLevel: u.yearLevel ? yearLevel(u.yearLevel) : null,
    });
    if (blank(u.firstYearSchoolYear)) out.studentYearLevels.push({ studentId: id, yearLevel: 1, schoolYearId: schoolYearId(u.firstYearSchoolYear!.trim()) });
    if (blank(u.secondYearSchoolYear)) out.studentYearLevels.push({ studentId: id, yearLevel: 2, schoolYearId: schoolYearId(u.secondYearSchoolYear!.trim()) });
  }
  const studentNos = new Map<string, string>();
  for (const r of out.studentRecords) {
    if (!r.studentNo) continue;
    if (studentNos.has(r.studentNo)) { problems.push(`student number ${r.studentNo} used twice (cleared on ${r.userId})`); r.studentNo = null; }
    else studentNos.set(r.studentNo, r.userId);
  }
  const emails = new Map<string, string>();
  for (const u of out.users) {
    const key = u.email.toLowerCase();
    if (emails.has(key)) problems.push(`BLOCKING: email ${u.email} used by two accounts (${emails.get(key)}, ${u.firebaseUid}); fix in Firestore first`);
    else emails.set(key, u.firebaseUid);
  }

  // --- courses + trash -> courses (catalog by name), course_offerings, offering_meetings
  const offeringId = new Map<string, string>(); // firestore course id -> uuid
  for (const c of courseDocs) {
    if (offeringId.has(c._id)) { problems.push(`courses/${c._id}: in both courses and trash (kept the first)`); continue; }
    const key = c.name.trim().toLowerCase();
    if (!out.courses.has(key)) out.courses.set(key, { id: legacyUuid("course", key), name: c.name.trim() });
    const id = legacyUuid("offering", c._id);
    offeringId.set(c._id, id);
    const sy = blank(c.schoolYear);
    if (!sy) problems.push(`courses/${c._id}: no school year (assigned to "unknown")`);
    let instructorId: string | null = null;
    if (c.instructorId) {
      instructorId = userId.get(c.instructorId) ?? null;
      if (!instructorId) problems.push(`courses/${c._id}: instructor ${c.instructorId} not found`);
    } else if (c.professor) {
      problems.push(`courses/${c._id}: instructor only given by name "${c.professor}" (assign manually)`);
    }
    out.offerings.push({
      id, legacyId: c._id, courseId: out.courses.get(key)!.id, termId: termId(sy ?? "unknown", semester(c.semester)),
      yearLevel: yearLevel(c.yearLevel), instructorId,
      deletedAt: c.trashed ? (ts(c.archivedAt) ?? new Date(0)) : null,
      ...(ts(c.createdAt) ? { createdAt: ts(c.createdAt)! } : {}),
    });
    const startsOn = isoDate(c.date, `courses/${c._id}.date`);
    if (startsOn && c.startTime && c.endTime) {
      const weekdays = c.isRecurring && c.daysOfWeek?.length ? c.daysOfWeek.map((d) => WEEKDAY[d] ?? null) : [null];
      for (const weekday of weekdays) {
        out.meetings.push({
          offeringId: id, weekday, startsOn, startTime: c.startTime, endTime: c.endTime,
          frequency: c.isRecurring ? FREQUENCY[c.frequency ?? "Weekly"] : "once",
        });
      }
    } else {
      problems.push(`courses/${c._id}: no complete schedule (date/start/end), no meetings created`);
    }
  }

  // --- users[].grades[] -> enrollments + grades (a grade entry's id is the course doc id)
  for (const u of people) {
    if (u.role !== "student") continue;
    const studentId = userId.get(u.uid ?? u._id)!;
    const seen = new Set<string>();
    for (const g of u.grades) {
      const off = offeringId.get(g.id);
      if (!off) { problems.push(`users/${u._id}: grade for missing course ${g.id} "${g.courseName ?? ""}" (skipped)`); continue; }
      if (seen.has(g.id)) { problems.push(`users/${u._id}: duplicate grade entry for course ${g.id} (kept the first)`); continue; }
      seen.add(g.id);
      const enrollmentId = legacyUuid("enrollment", `${g.id}:${u._id}`);
      out.enrollments.push({ id: enrollmentId, offeringId: off, studentId });
      const n = typeof g.gradeValue === "number" ? g.gradeValue : g.gradeValue?.trim() ? Number(g.gradeValue) : null;
      if (n !== null && (Number.isNaN(n) || n < 0 || n > 100)) {
        problems.push(`users/${u._id}: grade "${g.gradeValue}" for course ${g.id} is not 0-100 (left empty)`);
      }
      const value = n !== null && !Number.isNaN(n) && n >= 0 && n <= 100 ? n.toFixed(2) : null;
      if (value !== null || g.isIncomplete || blank(g.dateReleased)) {
        out.grades.push({ enrollmentId, value, isIncomplete: g.isIncomplete ?? false, releasedAt: ts(g.dateReleased) });
      }
    }
  }

  // --- attendance/{course_date_student} -> attendance_sessions + attendance_records
  for (const a of attendance) {
    const off = offeringId.get(a.courseId), student = userId.get(a.studentId);
    const heldOn = isoDate(a.date, `attendance/${a._id}.date`);
    if (!off || !student || !heldOn) { problems.push(`attendance/${a._id}: unknown course, student or date (skipped)`); continue; }
    const key = `${a.courseId}#${heldOn}`;
    const sessionId = legacyUuid("session", key);
    out.sessions.set(key, { id: sessionId, offeringId: off, heldOn });
    out.records.push({ sessionId, studentId: student, status: a.status, isExcused: a.isExcused ?? false, notes: blank(a.notes) });
  }

  // --- uploaded_files (base64 data URLs) -> materials + material_files
  for (const file of files) {
    const off = offeringId.get(file.courseId), uploader = userId.get(file.teacherUid);
    if (!off || !uploader) { problems.push(`uploaded_files/${file._id}: unknown course or uploader (skipped)`); continue; }
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(file.fileData);
    if (!match || !match[2]) { problems.push(`uploaded_files/${file._id}: file data is not a base64 data URL (skipped)`); continue; }
    const content = Buffer.from(match[3], "base64");
    const id = legacyUuid("material", file._id);
    const time = blank(file.eventTime);
    out.materials.push({
      id, legacyId: file._id, offeringId: off, uploadedBy: uploader, category: file.category,
      fileName: file.fileName, contentType: blank(file.fileType) ?? (match[1] || "application/octet-stream"),
      sizeBytes: content.length,
      eventDate: isoDate(file.eventDate, `uploaded_files/${file._id}.eventDate`),
      eventTime: time && /^([01]\d|2[0-3]):[0-5]\d/.test(time) ? time.slice(0, 5) : null,
      instructions: blank(file.instructions),
      archivedAt: file.archived ? new Date(0) : null,
      ...(ts(file.createdAt) ? { createdAt: ts(file.createdAt)! } : {}),
    });
    out.materialFiles.push({ materialId: id, content });
  }

  return out;
}
export type Transformed = ReturnType<typeof transform>;
