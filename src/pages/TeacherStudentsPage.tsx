import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, Search, Users } from 'lucide-react';

import { StudentProfileViewModal } from '../components/modals/StudentProfileViewModal';
import { fetchMyStudents, fetchUser, type MyStudent, type MyStudentCourse } from '../lib/data';
import { live } from '../lib/live';
import { toast } from '../lib/toast';
import type { UserProfile } from '../types';

const input = 'w-full bg-white border-2 border-fb-gray rounded-xl px-3 py-2.5 text-sm outline-none focus:border-fb-blue';
const YEAR = ['', '1st Year', '2nd Year'];
const TERM = ['', '1st Term', '2nd Term', 'Summer'];
const courseLabel = (c: MyStudentCourse) => `${c.name} · ${TERM[c.semester] ?? ''} · SY ${c.schoolYear}`;

const gradeChip = (c: MyStudentCourse) =>
  c.isIncomplete ? { label: 'Incomplete', cls: 'bg-amber-100 text-amber-800' }
    : c.grade === null ? { label: 'No grade yet', cls: 'bg-fb-gray text-fb-textSecondary' }
      : c.grade >= 75 ? { label: `Passed · ${c.grade}`, cls: 'bg-emerald-100 text-emerald-800' }
        : { label: `Failed · ${c.grade}`, cls: 'bg-rose-100 text-rose-800' };

const attendanceText = (a: MyStudentCourse['attendance']) => {
  const held = a.present + a.late + a.absent;
  if (!held) return 'No attendance taken yet';
  return [`${a.present} present`, a.late && `${a.late} late`, `${a.absent} absent${a.absent ? ` (${a.excused} excused)` : ''}`].filter(Boolean).join(' · ');
};

/** One row per course the student takes with this teacher. */
const CourseLine = ({ c }: { c: MyStudentCourse; key?: string }) => {
  const g = gradeChip(c);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="font-bold text-sm text-fb-textPrimary">{c.name}</span>
      <span className="text-xs text-fb-textSecondary">{TERM[c.semester]} · SY {c.schoolYear}</span>
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${g.cls}`}>{g.label}</span>
      <span className={`text-xs ${c.attendance.absent - c.attendance.excused > 0 ? 'text-rose-700 font-bold' : 'text-fb-textSecondary'}`}>{attendanceText(c.attendance)}</span>
    </li>
  );
};

/** A teacher's students: everyone enrolled in their own courses, with each student's profile. */
export const TeacherStudentsPage = () => {
  const [rows, setRows] = useState<MyStudent[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('');
  const [open, setOpen] = useState<{ student: MyStudent; profile: UserProfile } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => live(fetchMyStudents, setRows, (e) => setError((e as Error).message)), []);

  const courses = useMemo(() => {
    const m = new Map<string, MyStudentCourse>();
    for (const s of rows ?? []) for (const c of s.courses) m.set(c.offeringId, c);
    return [...m.values()].sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || a.semester - b.semester || a.name.localeCompare(b.name));
  }, [rows]);
  const shown = (rows ?? []).filter((s) =>
    (!course || s.courses.some((c) => c.offeringId === course))
    && `${s.studentName} ${s.studentNo ?? ''} ${s.cohort ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  const viewProfile = async (s: MyStudent) => {
    setOpening(s.studentId);
    try { setOpen({ student: s, profile: await fetchUser(s.studentId) }); }
    catch (e) { toast.error(`Couldn't open the profile: ${(e as Error).message}`); }
    finally { setOpening(null); }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">My Students</h1>
        <p className="text-sm text-fb-textSecondary">Everyone enrolled in your courses. Open a student to see their profile, grades and attendance in your courses.</p>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <label className="relative flex-1">
          <span className="sr-only">Search students</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fb-textSecondary" aria-hidden="true" />
          <input type="search" className={`${input} pl-9`} placeholder="Search name, student no. or batch…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="md:w-80"><span className="sr-only">Course</span>
          <select className={input} value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">All my courses</option>
            {courses.map((c) => <option key={c.offeringId} value={c.offeringId}>{courseLabel(c)}</option>)}
          </select></label>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
      {!rows && !error && <p className="text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-fb-textSecondary">No students yet. Students appear here once they're enrolled in a course you teach.</p>}
      {rows && rows.length > 0 && (
        <section aria-label="Students" className="bg-white rounded-xl border border-fb-border shadow-sm">
          <p className="px-4 md:px-5 py-3 border-b border-fb-border text-xs font-black uppercase tracking-widest text-fb-textSecondary">
            {shown.length} student{shown.length === 1 ? '' : 's'}
          </p>
          {shown.length === 0 ? <p className="p-5 text-sm text-fb-textSecondary">No students match.</p> : (
            <ul className="divide-y divide-fb-border">
              {shown.map((s) => (
                <li key={s.studentId} className="px-4 md:px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 min-w-[12rem]">
                      <span className="block font-bold text-fb-textPrimary">{s.studentName}</span>
                      <span className="block text-xs text-fb-textSecondary">
                        {[s.studentNo, s.yearLevel ? YEAR[s.yearLevel] : null, s.schoolType === 'day' ? 'Day School' : s.schoolType === 'night' ? 'Night School' : null, s.cohort].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <button type="button" onClick={() => viewProfile(s)} disabled={opening === s.studentId} aria-label={`View profile of ${s.studentName}`}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-fb-blue/10 text-fb-blue text-[10px] font-black uppercase tracking-wider hover:bg-fb-blue hover:text-white disabled:opacity-50">
                      {opening === s.studentId ? <RefreshCw size={12} className="animate-spin" /> : <Users size={12} />} View profile
                    </button>
                  </div>
                  <ul className="mt-1">
                    {s.courses.filter((c) => !course || c.offeringId === course).map((c) => <CourseLine key={c.offeringId} c={c} />)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {open && (
        <StudentProfileViewModal student={open.profile} onClose={() => setOpen(null)} extra={(
          <section aria-label="In your courses" className="mb-8 rounded-2xl border border-fb-border bg-fb-gray/30 p-4">
            <h3 className="text-xs font-black text-fb-blue uppercase tracking-widest italic">In your courses</h3>
            <ul className="divide-y divide-fb-border">{open.student.courses.map((c) => <CourseLine key={c.offeringId} c={c} />)}</ul>
          </section>
        )} />
      )}
    </div>
  );
};
