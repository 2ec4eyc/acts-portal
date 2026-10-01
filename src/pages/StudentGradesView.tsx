import { useState, useEffect } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';

import { fetchAttendance, fetchCourses } from '../lib/data';
import { live } from '../lib/live';
import { formatName } from '../lib/format';
import { calculateGPA } from '../lib/gpa';
import type { Course, UserProfile } from '../types';

export const StudentGradesView = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState([] as Course[]);
  const [loading, setLoading] = useState(true);
  const [yearLevelFilter, setYearLevelFilter] = useState(profile.yearLevel || '1st Year' as '1st Year' | '2nd Year');
  const [attendanceRecords, setAttendanceRecords] = useState([] as any[]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  useEffect(() => {
    return live(() => fetchAttendance({ studentId: profile.uid }), setAttendanceRecords);
  }, [profile.uid]);

  useEffect(() => {
    return live(fetchCourses, (all) => {
      // Filter by student's school year history
      const relevantYear = yearLevelFilter === '1st Year' ? profile.firstYearSchoolYear : profile.secondYearSchoolYear;
      setCourses(all.filter((data) => relevantYear && data.schoolYear === relevantYear));
      setLoading(false);
    }, () => setLoading(false));
  }, [yearLevelFilter, profile.firstYearSchoolYear, profile.secondYearSchoolYear]);

  const getStatus = (gradeValue: number | '', isIncomplete: boolean) => {
    if (isIncomplete) return { label: 'Incomplete', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (gradeValue === '') return { label: 'Pending', color: 'bg-fb-gray text-fb-textSecondary' };
    if (gradeValue >= 75) return { label: `Passed - ${gradeValue}`, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    return { label: `Failed - ${gradeValue}`, color: 'bg-rose-100 text-rose-700 border-rose-200' };
  };

  const semesters = ['1st Semester', '2nd Semester', '3rd Semester'] as const;

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-fb-blue" size={32} /></div>;

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-fb-border overflow-hidden flex flex-col animate-in fade-in duration-500 mb-10">
      <div className="p-8 md:p-10 border-b border-fb-border bg-gradient-to-br from-fb-blue/5 to-white">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="w-28 h-28 md:w-32 md:h-32 rounded-[2rem] bg-white text-fb-blue flex items-center justify-center font-black text-4xl border-4 border-white shadow-xl overflow-hidden shrink-0">
            {profile.photoURL ? <img src={profile.photoURL} className="w-full h-full object-cover" alt="Profile" /> : <span className="opacity-40 uppercase">{profile.firstName?.charAt(0) || formatName(profile).charAt(0)}</span>}
          </div>
          <div className="flex-1 text-center md:text-left space-y-4 pt-2">
            <h2 className="text-3xl font-black text-fb-textPrimary capitalize italic tracking-tighter">{formatName(profile)}</h2>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <div className="px-5 py-2 bg-fb-blue text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-fb-blue/20">Current: {profile.yearLevel || 'N/A'}</div>
              <div className="px-5 py-2 bg-fb-gray text-fb-textSecondary rounded-xl text-[10px] font-black uppercase tracking-widest border border-fb-border">ID: {profile.studentId || 'N/A'}</div>
              <div className="px-5 py-2 bg-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-200 shadow-sm">GPA: {calculateGPA(profile)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-4 bg-fb-gray/30 border-b border-fb-border flex flex-col md:flex-row items-center justify-center gap-4">
        <div className="flex bg-white p-1 rounded-xl border border-fb-border shadow-sm">
          {(['1st Year', '2nd Year'] as const).filter(y => {
            if (profile.yearLevel === '1st Year') return y === '1st Year';
            return true;
          }).map(y => (
            <button 
              key={y}
              onClick={() => setYearLevelFilter(y)}
              className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${yearLevelFilter === y ? 'bg-fb-blue text-white shadow-md' : 'text-fb-textSecondary hover:bg-fb-gray'}`}
            >
              {y} Records
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white p-8 md:p-10 space-y-12">
        {semesters.map((semester) => {
          const activeCourses = courses.filter(c => c.yearLevel === yearLevelFilter && c.semester === semester);
          const studentGrades = (profile.grades || []).filter(g => g.yearLevel === yearLevelFilter && g.semester === semester);

          // Combine active courses and existing grades
          const combinedItems = [
            ...studentGrades.map(g => {
              const activeCourse = activeCourses.find(c => c.id === g.id);
              return {
                id: g.id,
                name: g.courseName,
                professor: activeCourse?.professor || 'N/A',
                grade: g,
                isOrphaned: !activeCourse
              };
            }),
            ...activeCourses.filter(c => !studentGrades.find(g => g.id === c.id)).map(c => ({
              id: c.id,
              name: c.name,
              professor: c.professor,
              grade: null,
              isOrphaned: false
            }))
          ];

          return (
            <div key={semester} className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="h-px flex-1 bg-fb-border"></span>
                <h4 className="text-xs font-black text-fb-blue uppercase tracking-[0.3em] bg-fb-blue/5 px-6 py-2 rounded-full border border-fb-blue/10 italic">{semester}</h4>
                <span className="h-px flex-1 bg-fb-border"></span>
              </div>
              {combinedItems.length === 0 ? (
                <div className="py-10 text-center opacity-20"><p className="text-[10px] font-black uppercase tracking-widest italic">No courses defined for this term</p></div>
              ) : (
                <div className="space-y-3">
                  {combinedItems.map((item) => {
                    const grade = item.grade;
                    const courseAbsences = attendanceRecords.filter(r => r.courseId === item.id && r.status === 'absent');
                    const excusedCount = courseAbsences.filter(r => r.isExcused).length;
                    const isExpanded = expandedCourseId === item.id;

                    return (
                      <div key={item.id} className="bg-fb-gray/20 rounded-2xl p-4 md:p-6 border border-transparent hover:border-fb-blue/10 hover:bg-fb-gray/40 transition-all">
                        <div className="grid grid-cols-12 items-center gap-2">
                          <div className="col-span-6 md:col-span-5 flex flex-col">
                            <span className="text-xs md:text-sm font-bold text-fb-textPrimary truncate capitalize italic leading-none">{item.name}</span>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              <span className="text-[8px] md:text-[9px] font-bold text-fb-textSecondary opacity-60 capitalize tracking-tight">{item.professor}</span>
                              {item.isOrphaned && <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter italic bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Archived/Deleted</span>}
                              
                              {courseAbsences.length > 0 && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setExpandedCourseId(isExpanded ? null : item.id); }}
                                  className="flex items-center gap-1 text-[8px] md:text-[9px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded transition-all cursor-pointer"
                                >
                                  <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Absence' : 'Absences'}</span>
                                  <span className="opacity-60 font-medium">({excusedCount} excused)</span>
                                  <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span className="text-xs md:text-sm font-black text-fb-textPrimary">
                              {grade ? (grade.isIncomplete ? "-" : grade.gradeValue) : "-"}
                            </span>
                          </div>
                          <div className="col-span-4 md:col-span-5 flex justify-end items-center">
                            <span className={`px-2 md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest border shadow-sm text-center ${grade ? getStatus(grade.gradeValue, grade.isIncomplete).color : 'bg-fb-gray text-fb-textSecondary'}`}>
                              {grade ? getStatus(grade.gradeValue, grade.isIncomplete).label : 'Pending'}
                            </span>
                          </div>
                        </div>

                        {isExpanded && courseAbsences.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-fb-border/40 space-y-2 animate-in slide-in-from-top-2 duration-200">
                            <p className="text-[8px] font-black uppercase tracking-widest text-fb-textSecondary">Absence History</p>
                            <div className="space-y-1.5">
                              {courseAbsences.map(abs => (
                                <div key={abs.id} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-2.5 rounded-xl border border-fb-border/60 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-fb-textPrimary font-semibold text-[11px]">{abs.date}</span>
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${abs.isExcused ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                      {abs.isExcused ? 'Excused' : 'Unexcused'}
                                    </span>
                                  </div>
                                  {abs.notes ? (
                                    <span className="text-fb-textSecondary font-medium italic mt-1 md:mt-0 max-w-md truncate">Reason: "{abs.notes}"</span>
                                  ) : (
                                    <span className="text-fb-textSecondary/40 italic mt-1 md:mt-0">No reason provided</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
