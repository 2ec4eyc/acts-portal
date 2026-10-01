import { useEffect, useState } from 'react';

import { AttendanceTracker } from './AttendanceTracker';
import { CourseManagementPage } from './CourseManagementPage';
import { CourseMaterialsPage } from './CourseMaterialsPage';
import { StudentCalendarView } from './StudentCalendarView';
import { SubmitGrades } from './SubmitGrades';
import { TeacherGradesView } from './TeacherGradesView';
import type { UserProfile } from '../types';

export type ClassTab = 'courses' | 'schedule' | 'materials' | 'attendance' | 'grades';
const LABELS: Record<ClassTab, string> = {
  courses: 'Courses', schedule: 'Schedule', materials: 'Materials', attendance: 'Attendance', grades: 'Grades',
};

/** The tabs a staff role can use (same access as the separate pages had). */
export function classTabs(role: UserProfile['role'] | undefined): ClassTab[] {
  if (role === 'admin') return ['courses', 'schedule', 'materials', 'attendance', 'grades'];
  if (role === 'teacher' || role === 'president' || role === 'vice president') return ['schedule', 'materials', 'grades'];
  return [];
}

/** Class Management: courses, schedule, course materials, attendance and grades for staff, as tabs. */
export const ClassManagementPage = ({ profile, tab }: { profile: UserProfile; tab?: ClassTab }) => {
  const tabs = classTabs(profile.role);
  const pick = (t?: ClassTab) => (t && tabs.includes(t) ? t : tabs[0]);
  const [active, setActive] = useState<ClassTab>(pick(tab));
  useEffect(() => setActive(pick(tab)), [tab, profile.role]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Class Management</h1>
        <div role="tablist" aria-label="Class Management sections" className="flex flex-wrap gap-2">
          {tabs.map((id) => (
            <button key={id} role="tab" aria-selected={active === id} type="button" onClick={() => setActive(id)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${active === id ? 'bg-fb-blue text-white' : 'bg-white border border-fb-border text-fb-textSecondary'}`}>
              {LABELS[id]}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" aria-label={LABELS[active]}>
        {active === 'courses' && <CourseManagementPage profile={profile} />}
        {active === 'schedule' && <StudentCalendarView profile={profile} />}
        {active === 'materials' && <CourseMaterialsPage profile={profile} />}
        {active === 'attendance' && <AttendanceTracker profile={profile} />}
        {active === 'grades' && (profile.role === 'teacher' ? <TeacherGradesView profile={profile} /> : <SubmitGrades adminProfile={profile} />)}
      </div>
    </div>
  );
};
