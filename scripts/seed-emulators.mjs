// Seeds the local Firebase emulators with one account per role (password: password123)
// plus courses, grades, attendance and uploaded files. Wipes emulator data first.
// Usage: npm run emulators (in one terminal), then npm run seed:emulators
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
const PROJECT = 'acts-bible-school-portal';
initializeApp({ projectId: PROJECT });
const auth = getAuth(), db = getFirestore();
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const T = (s) => Timestamp.fromDate(new Date(s));
const people = [
  ['admin1', 'admin@acts.test', 'admin', { firstName: 'Ada', lastName: 'Admin', adminCategory: 'Day Secretary' }],
  ['pres1', 'president@acts.test', 'president', { firstName: 'Paul', lastName: 'President' }],
  ['teach1', 'teacher@acts.test', 'teacher', { firstName: 'Tess', lastName: 'Teacher' }],
  ['stu1', 'student@acts.test', 'student', { firstName: 'Sam', lastName: 'Student', studentId: 'S-001', yearLevel: '1st Year', firstYearSchoolYear: '2026-2027', batchName: 'Batch 2026-A', schoolType: 'Night School', contactNumber: '0917', church: 'Grace Church',
    grades: [{ id: 'c1', courseName: 'Old Testament Survey', gradeValue: 91, isIncomplete: false, dateReleased: '2026-09-15', yearLevel: '1st Year', semester: '1st Semester' },
             { id: 'c2', courseName: 'Hermeneutics', gradeValue: '', isIncomplete: true, dateReleased: '', yearLevel: '1st Year', semester: '1st Semester' }],
    editHistory: [{ id: 'h1', editedBy: 'Ada Admin', action: 'Grade updated', timestamp: '2026-09-15T08:00:00.000Z', details: 'OT Survey: 91' },
                  { id: 'h2', editedBy: 'Admin, Ada', action: 'Updated grade for Hermeneutics', timestamp: 'Wednesday, September 16, 2026 at 10:00 AM', details: 'Grade: Incomplete' }] }],
  ['stu2', 'student2@acts.test', 'student', { firstName: 'Rita', lastName: 'Reyes', studentId: 'S-002', yearLevel: '1st Year', firstYearSchoolYear: '2026-2027', batchName: 'Batch 2026-A', grades: [{ id: 'c1', courseName: 'Old Testament Survey', gradeValue: 85, isIncomplete: false, dateReleased: '2026-09-15' }] }],
];
for (const [uid, email, role, extra] of people) {
  await auth.createUser({ uid, email, password: 'password123' });
  await db.doc(`users/${uid}`).set({ uid, email, role, status: 'Active', fullName: `${extra.firstName} ${extra.lastName}`, grades: [], createdAt: T('2026-01-05'), ...extra });
}
await db.doc('archived_users/old1').set({ uid: 'old1', email: 'old@acts.test', role: 'student', status: 'Archived', fullName: 'Olga Old', firstName: 'Olga', lastName: 'Old', grades: [], archivedAt: T('2026-06-01') });
const course = (id, name, extra) => db.doc(`courses/${id}`).set({ id, name, professor: 'Teacher, Tess', instructorId: 'teach1', date: '2026-09-07', startTime: '18:00', endTime: '20:00', isRecurring: true, daysOfWeek: ['Monday', 'Wednesday'], frequency: 'Weekly', yearLevel: '1st Year', semester: '1st Semester', schoolYear: '2026-2027', status: 'active', createdAt: T('2026-08-01'), ...extra });
await course('c1', 'Old Testament Survey', {});
await course('c2', 'Hermeneutics', { date: '2026-09-08', daysOfWeek: ['Tuesday'], professor: 'Other Prof', instructorId: 'nobody' });
await db.doc('trash/c9').set({ id: 'c9', name: 'Deleted Course', professor: 'X', date: '2026-01-01', startTime: '08:00', endTime: '09:00', isRecurring: false, frequency: 'Weekly', yearLevel: '2nd Year', semester: '2nd Semester', schoolYear: '2025-2026', archivedAt: T('2026-02-01'), createdAt: T('2025-08-01') });
await db.doc('attendance/c1_2026-09-07_stu1').set({ id: 'c1_2026-09-07_stu1', courseId: 'c1', date: '2026-09-07', studentId: 'stu1', status: 'present', isExcused: false, notes: '', createdAt: '2026-09-07T20:00:00.000Z' });
await db.doc('attendance/c1_2026-09-07_stu2').set({ id: 'c1_2026-09-07_stu2', courseId: 'c1', date: '2026-09-07', studentId: 'stu2', status: 'absent', isExcused: true, notes: 'Sick', createdAt: '2026-09-07T20:00:00.000Z' });
await db.doc('uploaded_files/f1').set({ id: 'f1', courseId: 'c1', courseName: 'Old Testament Survey', teacherName: 'Teacher, Tess', teacherUid: 'teach1', category: 'notes', fileName: 'week1.pdf', fileData: 'data:application/pdf;base64,JVBERi0=', fileType: 'application/pdf', createdAt: T('2026-09-01') });
await db.doc('uploaded_files/f2').set({ id: 'f2', courseId: 'c1', courseName: 'Old Testament Survey', teacherName: 'Teacher, Tess', teacherUid: 'teach1', category: 'exams', fileName: 'midterm.pdf', fileData: 'data:application/pdf;base64,JVBERi0=', fileType: 'application/pdf', eventDate: '2026-10-12', instructions: 'Bring a pen', createdAt: T('2026-09-02') });
await db.doc('uploaded_files/f3').set({ id: 'f3', courseId: 'c1', courseName: 'Old Testament Survey', teacherName: 'Teacher, Tess', teacherUid: 'teach1', category: 'activity', fileName: 'old-quiz.txt', fileData: 'data:text/plain;base64,T2xkIHF1aXo=', fileType: 'text/plain', eventDate: '2026-09-20', archived: true, createdAt: T('2026-09-03') });
console.log('seeded');
process.exit(0);
