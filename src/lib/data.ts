// Data access for the pages. Talks to /api (docs/API.md) and converts between the API's shapes and
// the ones the pages were built around when they read Firestore (UserProfile with embedded grades,
// Course, AttendanceRecord, uploaded-file objects), so the UI code keeps working unchanged.
import { api, downloadFile as download } from './api';
import { refreshAll } from './live';
import { formatName } from './format';
import type { AttendanceRecord, Course, EditHistoryEntry, Grade, UserProfile } from '../types';

// ---------- API response shapes (subset used here) ----------

type ApiRole = 'student' | 'teacher' | 'admin' | 'president' | 'vice_president';
type ApiStaffCategory = 'day_secretary' | 'night_secretary' | 'faculty' | 'admin';

interface ApiGrade {
  offeringId: string; courseName: string; yearLevel: number; semester: number; schoolYear: string;
  instructorId: string | null; offeringArchived: boolean; studentId: string;
  value: number | null; isIncomplete: boolean; releasedAt: string | null;
}
interface ApiProfile {
  id: string; email: string; firstName: string; middleName: string | null; lastName: string; fullName: string;
  photoUrl: string | null; contactNumber: string | null; role: ApiRole; staffCategory: ApiStaffCategory | null;
  status: 'active' | 'pending' | 'archived'; archivedAt: string | null; createdAt: string;
  profile: Record<string, string | null | undefined>;
  student: null | {
    studentNo: string | null; schoolType: 'day' | 'night' | null; cohort: string | null;
    currentYearLevel: number | null; yearLevels: { yearLevel: number; schoolYear: string }[];
  };
  grades?: ApiGrade[];
}
interface ApiOffering {
  id: string; legacyId: string | null; name: string; yearLevel: number; schoolType: 'day' | 'night' | null; semester: number; schoolYear: string;
  instructorId: string | null; instructorFirstName: string | null; instructorLastName: string | null;
  instructorName: string | null; units: number; deletedAt: string | null; createdAt: string;
  schedule: null | { startsOn: string; startTime: string; endTime: string; frequency: 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly'; weekdays: number[] };
}
interface ApiAttendance {
  offeringId: string; date: string; studentId: string; status: 'present' | 'absent' | 'late'; isExcused: boolean; notes: string | null;
}
interface ApiRoster {
  offeringId: string; date: string; taken: boolean;
  students: { studentId: string; status: 'present' | 'absent' | 'late' | null; isExcused: boolean; notes: string | null }[];
}
interface ApiMaterial {
  id: string; offeringId: string; courseName: string; uploadedBy: string; uploaderFirstName: string; uploaderLastName: string;
  category: 'notes' | 'exams' | 'activity'; fileName: string; contentType: string | null; sizeBytes: number | null;
  eventDate: string | null; eventTime: string | null; instructions: string | null; archivedAt: string | null; createdAt: string;
}

// ---------- vocabulary ----------

const YEAR = { 1: '1st Year', 2: '2nd Year' } as const;
const SEMESTER = { 1: '1st Semester', 2: '2nd Semester', 3: '3rd Semester' } as const;
const ROLE: Record<ApiRole, UserProfile['role']> = { student: 'student', teacher: 'teacher', admin: 'admin', president: 'president', vice_president: 'vice president' };
const CATEGORY: Record<ApiStaffCategory, NonNullable<UserProfile['adminCategory']>> = {
  day_secretary: 'Day Secretary', night_secretary: 'Night Secretary', faculty: 'Faculty', admin: 'Admin',
};
const FREQUENCY = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' } as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const invert = <K extends string, V extends string>(o: Record<K, V>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<V, K>;
const yearNumber = (y?: string) => (y === '2nd Year' ? 2 : y === '1st Year' ? 1 : undefined);
const semesterNumber = (s?: string) => (s ? Number(s[0]) : undefined);
/** Firestore-Timestamp-like value, so existing `new Date(x.seconds * 1000)` code keeps working. */
const stamp = (iso: string | null | undefined) => (iso ? { seconds: Math.floor(Date.parse(iso) / 1000), nanoseconds: 0 } : undefined);
const orUndefined = <T,>(v: T | null | undefined) => (v === null || v === '' ? undefined : v);

// ---------- API -> page shapes ----------

function toGrade(g: ApiGrade): Grade {
  return {
    id: g.offeringId,
    courseName: g.courseName,
    gradeValue: g.value === null ? '' : g.value,
    isIncomplete: g.isIncomplete,
    dateReleased: g.releasedAt ? g.releasedAt.slice(0, 10) : '',
    yearLevel: YEAR[g.yearLevel as 1 | 2],
    semester: SEMESTER[g.semester as 1 | 2 | 3],
  };
}

export function toUserProfile(u: ApiProfile): UserProfile {
  const p = u.profile ?? {};
  const levels = u.student?.yearLevels ?? [];
  return {
    uid: u.id,
    email: u.email,
    fullName: u.fullName,
    photoURL: orUndefined(u.photoUrl),
    firstName: u.firstName,
    middleName: orUndefined(u.middleName),
    lastName: u.lastName,
    contactNumber: orUndefined(u.contactNumber),
    role: ROLE[u.role],
    adminCategory: u.staffCategory ? CATEGORY[u.staffCategory] : undefined,
    status: u.status === 'active' ? 'Active' : u.status === 'pending' ? 'Pending' : 'Archived',
    studentId: orUndefined(u.student?.studentNo),
    batchName: orUndefined(u.student?.cohort),
    schoolType: u.student?.schoolType === 'night' ? 'Night School' : u.student?.schoolType === 'day' ? 'Day School' : undefined,
    yearLevel: u.student?.currentYearLevel ? YEAR[u.student.currentYearLevel as 1 | 2] : undefined,
    firstYearSchoolYear: levels.find((l) => l.yearLevel === 1)?.schoolYear,
    secondYearSchoolYear: levels.find((l) => l.yearLevel === 2)?.schoolYear,
    gender: orUndefined(p.gender) as UserProfile['gender'],
    birthDate: orUndefined(p.birthDate),
    address: orUndefined(p.address),
    city: orUndefined(p.city),
    province: orUndefined(p.province),
    postalCode: orUndefined(p.postalCode),
    church: orUndefined(p.church),
    pastorName: orUndefined(p.pastorName),
    holyGhostBaptismDate: orUndefined(p.holyGhostBaptismDate),
    holyGhostBaptismLocation: orUndefined(p.holyGhostBaptismLocation),
    waterBaptismDate: orUndefined(p.waterBaptismDate),
    waterBaptismLocation: orUndefined(p.waterBaptismLocation),
    emergencyFirstName: orUndefined(p.emergencyFirstName),
    emergencyLastName: orUndefined(p.emergencyLastName),
    emergencyRelationship: orUndefined(p.emergencyRelationship),
    emergencyContactNumber: orUndefined(p.emergencyContactNumber),
    grades: (u.grades ?? []).map(toGrade),
    archivedAt: stamp(u.archivedAt),
  };
}

export function toCourse(o: ApiOffering): Course {
  const s = o.schedule;
  const recurring = Boolean(s && s.frequency !== 'once');
  return {
    id: o.id,
    legacyId: o.legacyId ?? undefined,
    name: o.name,
    professor: o.instructorId
      ? formatName({ firstName: o.instructorFirstName ?? '', lastName: o.instructorLastName ?? '' })
      : o.instructorName ?? '',
    instructorId: o.instructorId ?? undefined,
    date: s?.startsOn ?? '',
    startTime: s?.startTime ?? '',
    endTime: s?.endTime ?? '',
    isRecurring: recurring,
    daysOfWeek: s ? s.weekdays.map((d) => WEEKDAYS[d]) : [],
    frequency: s && s.frequency !== 'once' ? FREQUENCY[s.frequency] : 'Weekly',
    yearLevel: YEAR[o.yearLevel as 1 | 2],
    schoolType: o.schoolType === 'night' ? 'Night School' : o.schoolType === 'day' ? 'Day School' : undefined,
    semester: SEMESTER[o.semester as 1 | 2 | 3],
    schoolYear: o.schoolYear === 'unknown' ? undefined : o.schoolYear,
    units: o.units,
    createdAt: stamp(o.createdAt),
    archivedAt: stamp(o.deletedAt),
    status: o.deletedAt ? 'archived' : 'active',
  };
}

const toAttendance = (a: ApiAttendance): AttendanceRecord => ({
  id: `${a.offeringId}_${a.date}_${a.studentId}`,
  courseId: a.offeringId,
  date: a.date,
  studentId: a.studentId,
  status: a.status as AttendanceRecord['status'],
  isExcused: a.isExcused,
  notes: a.notes ?? '',
  createdAt: undefined,
});

/** An uploaded file as the pages expect it (no contents: download with downloadMaterial). */
export interface UploadedFile {
  id: string; courseId: string; courseName: string; teacherName: string; teacherUid: string;
  category: 'notes' | 'exams' | 'activity'; fileName: string; fileType: string; sizeBytes: number | null;
  eventDate?: string; eventTime?: string; instructions?: string; archived: boolean; createdAt?: { seconds: number };
}
const toFile = (m: ApiMaterial): UploadedFile => ({
  id: m.id,
  courseId: m.offeringId,
  courseName: m.courseName,
  teacherName: formatName({ firstName: m.uploaderFirstName, lastName: m.uploaderLastName }),
  teacherUid: m.uploadedBy,
  category: m.category,
  fileName: m.fileName,
  fileType: m.contentType ?? 'application/octet-stream',
  sizeBytes: m.sizeBytes,
  eventDate: orUndefined(m.eventDate),
  eventTime: orUndefined(m.eventTime?.slice(0, 5)),
  instructions: orUndefined(m.instructions),
  archived: Boolean(m.archivedAt),
  createdAt: stamp(m.createdAt),
});

// ---------- page shapes -> API ----------

const PERSONAL = [
  'gender', 'birthDate', 'address', 'city', 'province', 'postalCode', 'church', 'pastorName',
  'holyGhostBaptismDate', 'holyGhostBaptismLocation', 'waterBaptismDate', 'waterBaptismLocation',
  'emergencyFirstName', 'emergencyLastName', 'emergencyRelationship', 'emergencyContactNumber',
] as const;
const blankToNull = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null);

/** Fields a user may set on themselves (PATCH /api/me), from a partial UserProfile. */
function selfFields(f: Partial<UserProfile>) {
  const out: Record<string, unknown> = {};
  if (f.firstName !== undefined) out.firstName = f.firstName;
  if (f.middleName !== undefined) out.middleName = blankToNull(f.middleName);
  if (f.lastName !== undefined) out.lastName = f.lastName;
  if (f.photoURL !== undefined) out.photoUrl = blankToNull(f.photoURL);
  if (f.contactNumber !== undefined) out.contactNumber = blankToNull(f.contactNumber);
  for (const k of PERSONAL) if (f[k] !== undefined) out[k] = blankToNull(f[k]);
  if (f.adminCategory !== undefined) out.staffCategory = f.adminCategory ? invert(CATEGORY)[f.adminCategory] : null;
  return out;
}

/** All account fields (PATCH/POST /api/users), from a partial UserProfile. */
function accountFields(f: Partial<UserProfile>) {
  const out = selfFields(f);
  if (f.email !== undefined) out.email = f.email.trim();
  if (f.role !== undefined) out.role = invert(ROLE)[f.role];
  if (f.status === 'Active' || f.status === 'Pending') out.status = f.status.toLowerCase();
  const student: Record<string, unknown> = {};
  if (f.studentId !== undefined) student.studentNo = blankToNull(f.studentId);
  if (f.batchName !== undefined) student.cohort = blankToNull(f.batchName);
  if (f.schoolType !== undefined) student.schoolType = f.schoolType ? (f.schoolType === 'Night School' ? 'night' : 'day') : null;
  if (f.yearLevel !== undefined) student.currentYearLevel = yearNumber(f.yearLevel) ?? null;
  const years: Record<string, string | null> = {};
  if (f.firstYearSchoolYear !== undefined) years[1] = blankToNull(f.firstYearSchoolYear) as string | null;
  if (f.secondYearSchoolYear !== undefined) years[2] = blankToNull(f.secondYearSchoolYear) as string | null;
  if (Object.keys(years).length) student.schoolYears = years;
  if (Object.keys(student).length) out.student = student;
  return out;
}

function courseFields(c: Partial<Course>) {
  const recurring = Boolean(c.isRecurring);
  return {
    name: c.name,
    instructorId: c.instructorId || null,
    yearLevel: yearNumber(c.yearLevel) ?? 1,
    ...(c.schoolType && { schoolType: c.schoolType === 'Night School' ? 'night' : 'day' }),
    semester: semesterNumber(c.semester) ?? 1,
    schoolYear: c.schoolYear,
    ...(c.units !== undefined && { units: c.units }),
    schedule: c.date && c.startTime && c.endTime
      ? {
          startsOn: c.date,
          startTime: c.startTime.slice(0, 5),
          endTime: c.endTime.slice(0, 5),
          frequency: recurring ? invert(FREQUENCY)[c.frequency ?? 'Weekly'] : 'once',
          weekdays: recurring ? (c.daysOfWeek ?? []).map((d) => WEEKDAYS.indexOf(d)).filter((d) => d >= 0) : [],
        }
      : null,
  };
}

/** Runs a write, then refreshes every live view. */
async function write<T>(fn: () => Promise<T>): Promise<T> {
  const result = await fn();
  refreshAll();
  return result;
}

// ---------- reads ----------

export const fetchMyProfile = async () => toUserProfile(await api<ApiProfile>('me', { query: { include: 'grades' } }));

export const fetchUsers = async (opts: { role?: UserProfile['role']; status?: 'current' | 'archived' | 'all' } = {}) =>
  (await api<ApiProfile[]>('users', {
    query: { role: opts.role ? invert(ROLE)[opts.role] : undefined, status: opts.status, include: 'grades' },
  })).map(toUserProfile);

export const fetchUser = async (uid: string) =>
  toUserProfile(await api<ApiProfile>(`users/${uid}`, { query: { include: 'grades' } }));

const historyTime = (iso: string) => new Date(iso).toLocaleString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});
export const fetchHistory = async (uid: string): Promise<EditHistoryEntry[]> =>
  (await api<{ id: string; at: string; editedBy: string; action: string; details: string }[]>(`users/${uid}/history`))
    .map((h) => ({ id: h.id, editedBy: h.editedBy, action: h.action, details: h.details, timestamp: historyTime(h.at) }))
    .reverse(); // oldest first, as the app stored it

export const fetchCourses = async (opts: { includeArchived?: boolean } = {}) =>
  (await api<ApiOffering[]>('offerings', { query: { includeDeleted: opts.includeArchived ? 'true' : undefined } })).map(toCourse);

export async function fetchAttendance(filter: { studentId?: string; courseId?: string; date?: string }): Promise<AttendanceRecord[]> {
  if (filter.courseId && filter.date) {
    const roster = await api<ApiRoster>('attendance', { query: { offeringId: filter.courseId, date: filter.date } });
    return roster.students
      .filter((s) => s.status !== null)
      .map((s) => toAttendance({ offeringId: roster.offeringId, date: roster.date, studentId: s.studentId, status: s.status!, isExcused: s.isExcused, notes: s.notes }));
  }
  return (await api<ApiAttendance[]>('attendance', { query: { studentId: filter.studentId, offeringId: filter.courseId } })).map(toAttendance);
}

export const fetchFiles = async (filter: { category?: UploadedFile['category']; mine?: boolean; courseId?: string } = {}) =>
  (await api<ApiMaterial[]>('materials', {
    query: { category: filter.category, mine: filter.mine ? 'true' : undefined, offeringId: filter.courseId, archived: 'all' },
  })).map(toFile);

export const downloadMaterial = (file: Pick<UploadedFile, 'id' | 'fileName'>) => download(`materials/${file.id}/file`, file.fileName);

// ---------- writes ----------

export const updateMyProfile = (fields: Partial<UserProfile>) => write(() => api('me', { method: 'PATCH', body: selfFields(fields) }));

export const createAccount = (fields: Partial<UserProfile> & { tempPassword: string }) =>
  write(async () => toUserProfile(await api<ApiProfile>('users', {
    method: 'POST',
    body: { ...accountFields({ role: 'student', ...fields }), password: fields.tempPassword },
  })));

export const updateAccount = (uid: string, fields: Partial<UserProfile>) =>
  write(async () => toUserProfile(await api<ApiProfile>(`users/${uid}`, { method: 'PATCH', body: accountFields(fields) })));

export const archiveAccounts = (uids: string[]) => write(() => api('users/archive', { method: 'POST', body: { ids: uids } }));
export const restoreAccounts = (uids: string[]) => write(() => api('users/restore', { method: 'POST', body: { ids: uids } }));
export const deleteAccount = (uid: string) => write(() => api(`users/${uid}`, { method: 'DELETE' }));

export const enrollStudents = (uids: string[], yearLevel: string, batchName: string, schoolYear: string) =>
  write(() => api('users/enroll', { method: 'POST', body: { studentIds: uids, yearLevel: yearNumber(yearLevel), cohort: batchName, schoolYear } }));

export const cleanUpRecords = (uids: string[]) =>
  write(async () => (await api<{ removed: number }>('users/cleanup', { method: 'POST', body: { studentIds: uids } })).removed);

export const saveCourse = (course: Partial<Course>, id?: string) =>
  write(async () => toCourse(await api<ApiOffering>(id ? `offerings/${id}` : 'offerings', {
    method: id ? 'PATCH' : 'POST', body: courseFields(course),
  })));

export const archiveCourses = (ids: string[]) =>
  write(() => Promise.all(ids.map((id) => api(`offerings/${id}`, { method: 'DELETE' }))));
export const restoreCourses = (ids: string[]) =>
  write(() => Promise.all(ids.map((id) => api(`offerings/${id}/restore`, { method: 'POST' }))));

export const setGrade = (studentUid: string, courseId: string, gradeValue: number | '', isIncomplete: boolean) =>
  write(() => api('grades', {
    method: 'PUT',
    body: { offeringId: courseId, studentId: studentUid, value: isIncomplete || gradeValue === '' ? null : Number(gradeValue), isIncomplete },
  }));

export const resetGrade = (studentUid: string, courseId: string) =>
  write(() => api('grades', { method: 'DELETE', query: { offeringId: courseId, studentId: studentUid } }));

export const setGradesBulk = (items: { studentUid: string; courseId: string; gradeValue: number | ''; isIncomplete: boolean }[]) =>
  write(async () => (await api<{ updated: number }>('grades/bulk', {
    method: 'POST',
    body: {
      items: items.map((i) => ({
        offeringId: i.courseId, studentId: i.studentUid,
        value: i.isIncomplete || i.gradeValue === '' ? null : Number(i.gradeValue), isIncomplete: i.isIncomplete,
      })),
    },
  })).updated);

export const saveAttendance = (courseId: string, date: string, records: Pick<AttendanceRecord, 'studentId' | 'status' | 'isExcused' | 'notes'>[]) =>
  write(() => api('attendance', {
    method: 'PUT',
    body: {
      offeringId: courseId, date,
      records: records.map((r) => ({ studentId: r.studentId, status: r.status, isExcused: Boolean(r.isExcused), notes: blankToNull(r.notes) })),
    },
  }));

export const uploadFile = (f: {
  courseId: string; category: UploadedFile['category']; fileName: string; fileType: string; fileData: string;
  eventDate?: string; eventTime?: string; instructions?: string;
}) =>
  write(async () => toFile(await api<ApiMaterial>('materials', {
    method: 'POST',
    body: {
      offeringId: f.courseId, category: f.category, fileName: f.fileName,
      contentType: f.fileType || 'application/octet-stream', data: f.fileData,
      eventDate: f.eventDate || null, eventTime: f.eventTime || null, instructions: blankToNull(f.instructions),
    },
  })));

export const setFileArchived = (id: string, archived: boolean) =>
  write(() => api(`materials/${id}`, { method: 'PATCH', body: { archived } }));
export const deleteFile = (id: string) => write(() => api(`materials/${id}`, { method: 'DELETE' }));

export interface CourseStudent {
  studentId: string; studentName: string; studentNo: string | null; schoolType: 'day' | 'night' | null;
  yearLevel: number | null; cohort: string | null;
  /** Added by an admin as an exception, rather than by the automatic Day/Night + year matching. */
  manual: boolean;
  /** Enrolled automatically from the other Day/Night school (e.g. before the course had one). */
  wrongSchool: boolean;
  /** Why the student can't be removed from the course (a grade or attendance is recorded), or null. */
  cannotRemove: string | null;
}
/** Everyone enrolled in a course (admins). */
export const fetchCourseStudents = (courseId: string) =>
  api<{ schoolType: 'day' | 'night' | null; students: CourseStudent[] }>(`offerings/${courseId}/students`);
/** Adds students to a course by hand, whatever their school or year. */
export const addStudentsToCourse = (courseId: string, studentIds: string[]) =>
  write(() => api<{ added: number; skipped: { studentId: string; reason: string }[] }>(`offerings/${courseId}/enroll`, { method: 'POST', body: { studentIds } }));
export const unenrollStudents = (courseId: string, studentIds: string[]) =>
  write(() => api<{ removed: number; skipped: { studentId: string; reason: string }[] }>(`offerings/${courseId}/unenroll`, { method: 'POST', body: { studentIds } }));
