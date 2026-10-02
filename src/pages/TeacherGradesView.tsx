import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Search,
  X,
  Edit2,
  ChevronDown,
  Check,
} from 'lucide-react';

import { StudentProfileViewModal } from '../components/modals/StudentProfileViewModal';
import { fetchAttendance, fetchMyStudents, fetchUser, setGrade, type MyStudent } from '../lib/data';
import { live } from '../lib/live';
import type { UserProfile } from '../types';
import { toast } from '../lib/toast';

const YEAR = ['', '1st Year', '2nd Year'];
const TERM = ['', '1st Semester', '2nd Semester', 'Summer'];

/** One student in one of the teacher's courses (from their actual enrollments). */
interface Row {
  student: { uid: string; name: string; yearLabel: string };
  course: { id: string; name: string; semester: string; yearLevel: string };
  grade: { gradeValue: number | ''; isIncomplete: boolean } | null;
}

const toRows = (students: MyStudent[]): Row[] => students.flatMap((s) => s.courses.map((c) => ({
  student: { uid: s.studentId, name: s.studentName, yearLabel: s.yearLevel ? YEAR[s.yearLevel] : '' },
  course: { id: c.offeringId, name: c.name, semester: `${TERM[c.semester] ?? ''} · SY ${c.schoolYear}`, yearLevel: YEAR[c.yearLevel] ?? '' },
  grade: c.grade === null && !c.isIncomplete ? null : { gradeValue: c.grade ?? '', isIncomplete: c.isIncomplete },
})));

export const TeacherGradesView = ({ profile }: { profile: UserProfile }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [attendanceRecords, setAttendanceRecords] = useState([] as any[]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ gradeValue: '' as number | string, isIncomplete: false });
  const [loading, setLoading] = useState(false);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // The students actually enrolled in the teacher's own courses, and attendance for just those courses.
    return live(async () => {
      const list = toRows(await fetchMyStudents());
      const courseIds = [...new Set(list.map((r) => r.course.id))];
      const attendance = (await Promise.all(courseIds.map((id) => fetchAttendance({ courseId: id })))).flat();
      return { list, attendance };
    }, ({ list, attendance }) => {
      setRows(list);
      setAttendanceRecords(attendance);
    });
  }, [profile.uid]);

  const courses = [...new Map<string, Row['course']>(rows.map((r) => [r.course.id, r.course])).values()].sort((a, b) => a.name.localeCompare(b.name));

  const filteredRows = rows.filter(row => {
    const matchSearch = row.student.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCourse = courseFilter === 'All' || row.course.id === courseFilter;
    const matchYear = yearFilter === 'All' || row.course.yearLevel === yearFilter;
    return matchSearch && matchCourse && matchYear;
  });

  const openProfile = async (uid: string) => {
    try { setSelectedStudentForProfile(await fetchUser(uid)); }
    catch (err: any) { toast.error(`Couldn't open the profile: ${err.message}`); }
  };

  const getStatus = (gradeValue: number | '', isIncomplete: boolean) => {
    if (isIncomplete) return { label: 'Incomplete', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (gradeValue === '') return { label: 'Pending', color: 'bg-fb-gray text-fb-textSecondary' };
    if (gradeValue >= 75) return { label: `Passed - ${gradeValue}`, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    return { label: `Failed - ${gradeValue}`, color: 'bg-rose-100 text-rose-700 border-rose-200' };
  };

  const handleUpdateGrade = async (studentId: string, courseId: string, courseName: string, yearLevel: string, semester: string) => {
    if (editFormData.gradeValue === '' && !editFormData.isIncomplete) {
      toast.error("Please enter a valid grade or mark as incomplete.");
      return;
    }
    setLoading(true);
    try {
      // Saved with the teacher as editor; the server records the change in the student's history.
      await setGrade(studentId, courseId, editFormData.isIncomplete ? '' : Number(editFormData.gradeValue), editFormData.isIncomplete);
      setEditingId(null);
    } catch (err: any) {
      console.error("Error updating grade:", err);
      toast.error("Failed to update grade. " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-fb-gray relative">
      <div className="flex items-center justify-between px-8 md:px-12 py-8 bg-white border-b border-fb-border sticky top-0 z-20 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black text-fb-textPrimary italic uppercase tracking-tighter flex items-center gap-3">
            <GraduationCap className="text-fb-blue" size={28} /> Grades
          </h2>
          <p className="text-fb-textSecondary text-xs font-bold capitalize tracking-tight">Manage your assigned students</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={16} />
              <input 
                type="text" 
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border-2 border-transparent rounded-full pl-10 pr-4 py-3 outline-none focus:border-fb-blue text-sm font-bold shadow-sm transition-all"
              />
            </div>
            <div className="w-full md:w-48 relative">
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-full bg-white border-2 border-transparent rounded-full px-4 py-3 outline-none focus:border-fb-blue text-xs font-bold shadow-sm transition-all appearance-none cursor-pointer">
                <option value="All">All Courses</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-48 relative">
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-full bg-white border-2 border-transparent rounded-full px-4 py-3 outline-none focus:border-fb-blue text-xs font-bold shadow-sm transition-all appearance-none cursor-pointer">
                <option value="All">All Years</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-fb-border overflow-hidden hidden md:block">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[800px]">
                <thead className="bg-fb-gray/50 border-b border-fb-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-fb-textSecondary uppercase tracking-widest w-[30%]">Student</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-fb-textSecondary uppercase tracking-widest w-[30%]">Course</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-fb-textSecondary uppercase tracking-widest w-[20%]">Grade</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-fb-textSecondary uppercase tracking-widest w-[20%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-fb-border">
                  {filteredRows.map((row, i) => {
                    const rowId = `${row.student.uid}_${row.course.id}`;
                    const isEditing = editingId === rowId;
                    const courseAbsences = attendanceRecords.filter(r => r.studentId === row.student.uid && r.courseId === row.course.id && r.status === 'absent');
                    const excusedCount = courseAbsences.filter(r => r.isExcused).length;
                    const isExpanded = expandedRowId === rowId;

                    return (
                      <React.Fragment key={rowId}>
                        <tr className="hover:bg-fb-hover transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-sm text-fb-textPrimary capitalize italic">{row.student.name}</div>
                            <div className="flex flex-col gap-1 mt-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">{row.student.yearLabel}</span>
                                {courseAbsences.length > 0 && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setExpandedRowId(isExpanded ? null : rowId); }}
                                    className="flex items-center gap-1 text-[8px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded transition-all cursor-pointer animate-bounce-once"
                                  >
                                    <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Absence' : 'Absences'}</span>
                                    <span className="opacity-60 font-medium">({excusedCount} excused)</span>
                                    <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </div>
                              <button 
                                onClick={() => openProfile(row.student.uid)}
                                className="text-[10px] font-black text-fb-blue hover:text-fb-blue/80 hover:underline uppercase tracking-widest cursor-pointer text-left self-start mt-0.5"
                              >
                                View Profile
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-sm text-fb-textPrimary capitalize">{row.course.name}</div>
                            <div className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest mt-1">{row.course.semester}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="0" max="100"
                                    disabled={editFormData.isIncomplete}
                                    value={editFormData.isIncomplete ? '' : editFormData.gradeValue}
                                    onChange={(e) => setEditFormData({ ...editFormData, gradeValue: Math.max(0, Math.min(100, Number(e.target.value))) })}
                                    className="w-16 text-center border-2 border-fb-blue rounded-lg py-1.5 text-xs font-bold outline-none disabled:bg-fb-gray disabled:border-transparent"
                                    placeholder={editFormData.isIncomplete ? "-" : "Score"}
                                  />
                                  <label className="flex items-center gap-1.5 cursor-pointer bg-fb-gray px-2 py-1.5 rounded-lg border border-transparent hover:border-fb-border">
                                    <input 
                                      type="checkbox" 
                                      checked={editFormData.isIncomplete}
                                      onChange={(e) => setEditFormData({ ...editFormData, isIncomplete: e.target.checked })}
                                      className="w-3.5 h-3.5 accent-fb-blue"
                                    />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary mt-0.5">Inc</span>
                                  </label>
                                </div>
                              ) : (
                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${row.grade ? getStatus(row.grade.gradeValue, row.grade.isIncomplete).color : 'bg-fb-gray text-fb-textSecondary'}`}>
                                  {row.grade ? getStatus(row.grade.gradeValue, row.grade.isIncomplete).label : 'Pending'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <button disabled={loading} onClick={() => handleUpdateGrade(row.student.uid, row.course.id, row.course.name, row.course.yearLevel, row.course.semester)} className="p-2 bg-fb-blue text-white rounded-lg shadow-sm hover:bg-blue-600 transition-all disabled:opacity-50"><Check size={14} /></button>
                                  <button disabled={loading} onClick={() => setEditingId(null)} className="p-2 bg-fb-gray text-fb-textSecondary rounded-lg border border-transparent hover:border-fb-border transition-all disabled:opacity-50"><X size={14} /></button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingId(rowId);
                                    setEditFormData({ 
                                      gradeValue: row.grade?.gradeValue !== undefined ? row.grade.gradeValue : '', 
                                      isIncomplete: row.grade?.isIncomplete || false 
                                    });
                                  }}
                                  className="p-2 bg-fb-blue/5 text-fb-blue rounded-lg hover:bg-fb-blue hover:text-white transition-all shadow-sm"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && courseAbsences.length > 0 && (
                          <tr className="bg-fb-gray/10">
                            <td colSpan={4} className="px-6 py-4">
                              <div className="space-y-2 py-2 border-l-2 border-rose-300 pl-4 animate-in slide-in-from-top-1 duration-200">
                                <p className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary">Absence History</p>
                                <div className="space-y-1.5">
                                  {courseAbsences.map(abs => (
                                    <div key={abs.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-2.5 rounded-xl border border-fb-border/60 text-xs shadow-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-fb-textPrimary font-semibold text-[11px]">{abs.date}</span>
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${abs.isExcused ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                          {abs.isExcused ? 'Excused' : 'Unexcused'}
                                        </span>
                                      </div>
                                      {abs.notes ? (
                                        <span className="text-fb-textSecondary font-medium italic mt-1 sm:mt-0 max-w-md truncate">Reason: "{abs.notes}"</span>
                                      ) : (
                                        <span className="text-fb-textSecondary/40 italic mt-1 sm:mt-0">No reason provided</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-fb-textSecondary">
                        <div className="flex flex-col items-center gap-3 opacity-50">
                          <GraduationCap size={32} />
                          <p className="text-xs font-black uppercase tracking-widest">No assigned students found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile view: Responsive card list */}
          <div className="block md:hidden space-y-4">
            {filteredRows.map((row, i) => {
              const rowId = `${row.student.uid}_${row.course.id}`;
              const isEditing = editingId === rowId;
              const courseAbsences = attendanceRecords.filter(r => r.studentId === row.student.uid && r.courseId === row.course.id && r.status === 'absent');
              const excusedCount = courseAbsences.filter(r => r.isExcused).length;
              const isExpanded = expandedRowId === rowId;

              return (
                <div key={`mobile_${rowId}`} className="bg-white rounded-3xl p-5 border border-fb-border shadow-sm space-y-4">
                  {/* Student Details and Actions */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="font-bold text-base text-fb-textPrimary capitalize italic leading-tight">{row.student.name}</div>
                      <div className="flex flex-col gap-1.5 mt-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest bg-fb-gray px-2 py-0.5 rounded-md">{row.student.yearLabel}</span>
                          {courseAbsences.length > 0 && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setExpandedRowId(isExpanded ? null : rowId); }}
                              className="flex items-center gap-1 text-[8px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                            >
                              <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Absence' : 'Absences'}</span>
                              <span className="opacity-60 font-medium">({excusedCount} excused)</span>
                              <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                        <button 
                          onClick={() => openProfile(row.student.uid)}
                          className="text-[10px] font-black text-fb-blue hover:text-fb-blue/80 hover:underline uppercase tracking-widest cursor-pointer text-left self-start"
                        >
                          View Profile
                        </button>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex-shrink-0">
                      {isEditing ? (
                        <div className="flex gap-1.5">
                          <button disabled={loading} onClick={() => handleUpdateGrade(row.student.uid, row.course.id, row.course.name, row.course.yearLevel, row.course.semester)} className="p-2.5 bg-fb-blue text-white rounded-xl shadow-sm hover:bg-blue-600 transition-all disabled:opacity-50"><Check size={14} /></button>
                          <button disabled={loading} onClick={() => setEditingId(null)} className="p-2.5 bg-fb-gray text-fb-textSecondary rounded-xl border border-transparent hover:border-fb-border transition-all disabled:opacity-50"><X size={14} /></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(rowId);
                            setEditFormData({ 
                              gradeValue: row.grade?.gradeValue !== undefined ? row.grade.gradeValue : '', 
                              isIncomplete: row.grade?.isIncomplete || false 
                            });
                          }}
                          className="p-2.5 bg-fb-blue/5 text-fb-blue rounded-xl hover:bg-fb-blue hover:text-white transition-all shadow-sm"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Course Details */}
                  <div className="border-t border-fb-border pt-3">
                    <span className="text-[9px] font-black text-fb-textSecondary uppercase tracking-widest block mb-0.5">Course</span>
                    <div className="font-bold text-sm text-fb-textPrimary capitalize leading-snug">{row.course.name}</div>
                    <div className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest mt-0.5">{row.course.semester}</div>
                  </div>

                  {/* Grade Details */}
                  <div className="border-t border-fb-border pt-3 flex justify-between items-center gap-4">
                    <div>
                      <span className="text-[9px] font-black text-fb-textSecondary uppercase tracking-widest block">Grade Status</span>
                    </div>
                    <div className="flex-1 flex justify-end">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 w-full max-w-[180px] justify-end">
                          <input
                            type="number"
                            min="0" max="100"
                            disabled={editFormData.isIncomplete}
                            value={editFormData.isIncomplete ? '' : editFormData.gradeValue}
                            onChange={(e) => setEditFormData({ ...editFormData, gradeValue: Math.max(0, Math.min(100, Number(e.target.value))) })}
                            className="w-16 text-center border-2 border-fb-blue rounded-lg py-1.5 text-xs font-bold outline-none disabled:bg-fb-gray disabled:border-transparent"
                            placeholder={editFormData.isIncomplete ? "-" : "Score"}
                          />
                          <label className="flex items-center gap-1.5 cursor-pointer bg-fb-gray px-2 py-1.5 rounded-lg border border-transparent hover:border-fb-border select-none flex-shrink-0">
                            <input 
                              type="checkbox" 
                              checked={editFormData.isIncomplete}
                              onChange={(e) => setEditFormData({ ...editFormData, isIncomplete: e.target.checked })}
                              className="w-3.5 h-3.5 accent-fb-blue"
                            />
                            <span className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary mt-0.5">Inc</span>
                          </label>
                        </div>
                      ) : (
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${row.grade ? getStatus(row.grade.gradeValue, row.grade.isIncomplete).color : 'bg-fb-gray text-fb-textSecondary'}`}>
                          {row.grade ? getStatus(row.grade.gradeValue, row.grade.isIncomplete).label : 'Pending'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Absences History List */}
                  {isExpanded && courseAbsences.length > 0 && (
                    <div className="border-t border-fb-border pt-3 space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary">Absence History</p>
                      <div className="space-y-1.5">
                        {courseAbsences.map(abs => (
                          <div key={abs.id} className="flex flex-col bg-fb-gray/50 p-2.5 rounded-xl border border-fb-border/60 text-xs shadow-sm space-y-1">
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-mono text-fb-textPrimary font-semibold text-[11px]">{abs.date}</span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${abs.isExcused ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                {abs.isExcused ? 'Excused' : 'Unexcused'}
                              </span>
                            </div>
                            {abs.notes ? (
                              <span className="text-fb-textSecondary font-medium italic truncate">Reason: "{abs.notes}"</span>
                            ) : (
                              <span className="text-fb-textSecondary/40 italic">No reason provided</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredRows.length === 0 && (
              <div className="bg-white rounded-3xl p-12 border border-fb-border shadow-sm text-center text-fb-textSecondary">
                <div className="flex flex-col items-center gap-3 opacity-50">
                  <GraduationCap size={32} />
                  <p className="text-xs font-black uppercase tracking-widest">No assigned students found</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedStudentForProfile && (
        <StudentProfileViewModal 
          student={selectedStudentForProfile} 
          onClose={() => setSelectedStudentForProfile(null)} 
        />
      )}
    </div>
  );
};
