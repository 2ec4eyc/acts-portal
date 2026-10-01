import { useState, useEffect } from 'react';
import {
  User as UserIcon,
  X,
  Edit2,
  ChevronDown,
  Check,
  RotateCcw,
  Clock,
  ArrowDown,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { HistoryModal } from './HistoryModal';
import { StudentProfileViewModal } from './StudentProfileViewModal';
import { PermissionDeniedGate } from '../PermissionDeniedGate';
import { ApiError } from '../../lib/api';
import { fetchAttendance, fetchCourses, fetchHistory, fetchUser, resetGrade, setGrade } from '../../lib/data';
import { live } from '../../lib/live';
import { formatName } from '../../lib/format';
import { calculateGPA } from '../../lib/gpa';
import type { Course, EditHistoryEntry, UserProfile } from '../../types';

export const GradesModal = ({ student: propStudent, adminProfile, onClose }: { student: UserProfile, adminProfile: UserProfile, onClose: () => void }) => {
  const [student, setStudent] = useState<UserProfile>(propStudent);
  const [courses, setCourses] = useState([] as Course[]);
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [yearLevelFilter, setYearLevelFilter] = useState(propStudent.yearLevel || '1st Year' as '1st Year' | '2nd Year');
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([] as any[]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  useEffect(() => {
    return live(() => fetchAttendance({ studentId: propStudent.uid }), setAttendanceRecords);
  }, [propStudent.uid]);

  const [editFormData, setEditFormData] = useState<{gradeValue: number | '', isIncomplete: boolean}>({
    gradeValue: '',
    isIncomplete: false
  });

  // Keep the student's record current (refreshes after every save)
  useEffect(() => {
    return live(() => fetchUser(propStudent.uid), setStudent);
  }, [propStudent.uid]);

  // Edit history is loaded when the history panel is opened
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  useEffect(() => {
    if (!showHistory) return;
    return live(() => fetchHistory(propStudent.uid), setHistory);
  }, [showHistory, propStudent.uid]);

  useEffect(() => {
    return live(fetchCourses, (list) => {
      setCourses(list);
      setPermissionError(false);
    }, (error) => {
      if (error instanceof ApiError && error.status === 403) {
        console.warn("Permission denied for courses registry.");
        setPermissionError(true);
      }
    });
  }, []);

  const getStatus = (gradeValue: number | '', isIncomplete: boolean) => {
    if (isIncomplete) return { label: 'Incomplete', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (gradeValue === '') return { label: 'Pending', color: 'bg-fb-gray text-fb-textSecondary' };
    if (gradeValue >= 75) return { label: `Passed - ${gradeValue}`, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    return { label: `Failed - ${gradeValue}`, color: 'bg-rose-100 text-rose-700 border-rose-200' };
  };


  const handleUpdateGrade = async (courseId: string, courseName: string, courseYear?: string, courseSem?: string) => {
    setLoading(true);
    try {
      // The server records the change (with the editor) in the student's history.
      await setGrade(student.uid, courseId, editFormData.isIncomplete ? '' : (editFormData.gradeValue === '' ? '' : Number(editFormData.gradeValue)), editFormData.isIncomplete);
      setEditingGradeId(null);
    } catch (err) {
      alert("Failed to update records.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetGrade = async (courseId: string, courseName: string) => {
    setLoading(true);
    try {
      await resetGrade(student.uid, courseId);
    } catch (err) {
      alert("Failed to reset grade.");
    } finally {
      setLoading(false);
    }
  };

  const semesters = ['1st Semester', '2nd Semester', '3rd Semester'] as const;

  const handleDownloadPDF = async () => {
    const container = document.getElementById('student-records-pdf-container');
    if (!container) return;
    
    try {
      const pages = container.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < pages.length; i++) {
        const pageElement = pages[i] as HTMLElement;
        const canvas = await html2canvas(pageElement, { 
          scale: 2,
          windowWidth: pageElement.scrollWidth,
          windowHeight: pageElement.scrollHeight
        });
        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        if (i > 0) {
          pdf.addPage();
        }
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
      }

      pdf.save(`${formatName(student)}_records.pdf`);
    } catch (err) {
      console.error("PDF generation failed", err);
      alert("Failed to generate PDF.");
    }
  };

  const pagesData: { yearLevel: string, semester: string, items: any[] }[] = [];

  // 1st Year
  semesters.forEach(sem => {
    const activeSemCourses = student.firstYearSchoolYear ? courses.filter(c => c.yearLevel === '1st Year' && c.semester === sem && c.schoolYear === student.firstYearSchoolYear) : [];
    const studentSemGrades = (student.grades || []).filter(g => g.yearLevel === '1st Year' && g.semester === sem);
    
    const combinedSemItems = [
      ...studentSemGrades.map(g => ({
        id: g.id,
        name: g.courseName,
        grade: g
      })),
      ...activeSemCourses.filter(c => !studentSemGrades.find(g => g.id === c.id)).map(c => ({
        id: c.id,
        name: c.name,
        grade: null
      }))
    ].sort((a, b) => a.name.localeCompare(b.name));

    if (combinedSemItems.length > 0) {
      pagesData.push({
        yearLevel: '1st Year',
        semester: sem,
        items: combinedSemItems
      });
    }
  });

  // 2nd Year
  if (student.yearLevel !== '1st Year') {
    semesters.forEach(sem => {
      const activeSemCourses = student.secondYearSchoolYear ? courses.filter(c => c.yearLevel === '2nd Year' && c.semester === sem && c.schoolYear === student.secondYearSchoolYear) : [];
      const studentSemGrades = (student.grades || []).filter(g => g.yearLevel === '2nd Year' && g.semester === sem);
      
      const combinedSemItems = [
        ...studentSemGrades.map(g => ({
          id: g.id,
          name: g.courseName,
          grade: g
        })),
        ...activeSemCourses.filter(c => !studentSemGrades.find(g => g.id === c.id)).map(c => ({
          id: c.id,
          name: c.name,
          grade: null
        }))
      ].sort((a, b) => a.name.localeCompare(b.name));

      if (combinedSemItems.length > 0) {
        pagesData.push({
          yearLevel: '2nd Year',
          semester: sem,
          items: combinedSemItems
        });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl max-h-[95vh] overflow-hidden rounded-[2.5rem] shadow-2xl border border-fb-border flex flex-col">
        <div className="p-5 md:p-6 border-b border-fb-border bg-gradient-to-br from-fb-blue/5 to-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white hover:bg-fb-gray rounded-full transition-all border border-fb-border text-fb-textPrimary"><X size={20} /></button>
          <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] bg-white text-fb-blue flex items-center justify-center font-black text-2xl border-4 border-white shadow-xl overflow-hidden shrink-0">
              {student.photoURL ? <img src={student.photoURL} className="w-full h-full object-cover" alt="Profile" /> : <span className="opacity-40 uppercase">{student.firstName?.charAt(0) || formatName(student).charAt(0)}</span>}
            </div>
            <div className="flex-1 text-center md:text-left space-y-2 pt-1">
              <h2 className="text-xl md:text-2xl font-black text-fb-textPrimary capitalize italic tracking-tighter">{formatName(student)}</h2>
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                <div className="px-3 py-1.5 bg-fb-blue text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-fb-blue/20">Current: {student.yearLevel || 'N/A'}</div>
                <div className="px-3 py-1.5 bg-fb-gray text-fb-textSecondary rounded-lg text-[9px] font-black uppercase tracking-widest border border-fb-border">ID: {student.studentId || 'N/A'}</div>
                <div className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-[9px] font-black uppercase tracking-widest border border-red-200 shadow-sm">GPA: {calculateGPA(student)}</div>
                <button 
                  onClick={() => setShowHistory(true)}
                  className="px-3 py-1.5 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-fb-blue/20 shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Clock size={10} /> Edit history
                </button>
                <button 
                  onClick={() => setShowProfile(true)}
                  className="px-3 py-1.5 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-fb-blue/20 shadow-sm transition-all flex items-center gap-1.5"
                >
                  <UserIcon size={10} /> Profile
                </button>
                <button 
                  onClick={handleDownloadPDF}
                  className="px-3 py-1.5 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-fb-blue/20 shadow-sm transition-all flex items-center gap-1.5"
                >
                  <ArrowDown size={10} /> Download
                </button>
              </div>
            </div>
          </div>
        </div>

        {permissionError ? (
          <PermissionDeniedGate message="Insufficient permissions to load course registry for grading" />
        ) : (
          <>
            <div className="px-4 md:px-8 py-3 md:py-4 bg-fb-gray/30 border-b border-fb-border flex flex-col md:flex-row items-center justify-center gap-4">
              <div className="flex bg-white p-1 rounded-xl border border-fb-border shadow-sm w-full md:w-auto">
                {(['1st Year', '2nd Year'] as const).filter(y => {
                  if (student.yearLevel === '1st Year') return y === '1st Year';
                  return true;
                }).map(y => (
                  <button 
                    key={y}
                    onClick={() => setYearLevelFilter(y)}
                    className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${yearLevelFilter === y ? 'bg-fb-blue text-white shadow-md' : 'text-fb-textSecondary hover:bg-fb-gray'}`}
                  >
                    {y} Records
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white p-4 md:p-10 space-y-8 md:space-y-12">
              {semesters.map((semester) => {
                const relevantYear = yearLevelFilter === '1st Year' ? student.firstYearSchoolYear : student.secondYearSchoolYear;
                const activeCourses = relevantYear ? courses.filter(c => c.yearLevel === yearLevelFilter && c.semester === semester && c.schoolYear === relevantYear) : [];
                const studentGrades = (student.grades || []).filter(g => g.yearLevel === yearLevelFilter && g.semester === semester);
                
                // Combine active courses and existing grades
                const combinedItems = [
                  ...studentGrades.map(g => {
                    const activeCourse = activeCourses.find(c => c.id === g.id);
                    return {
                      id: g.id,
                      name: g.courseName,
                      professor: activeCourse?.professor || 'N/A',
                      instructorId: activeCourse?.instructorId,
                      grade: g,
                      isOrphaned: !activeCourse,
                      yearLevel: g.yearLevel,
                      semester: g.semester
                    };
                  }),
                  ...activeCourses.filter(c => !studentGrades.find(g => g.id === c.id)).map(c => ({
                    id: c.id,
                    name: c.name,
                    professor: c.professor,
                    instructorId: c.instructorId,
                    grade: null,
                    isOrphaned: false,
                    yearLevel: c.yearLevel,
                    semester: c.semester
                  }))
                ].sort((a, b) => a.name.localeCompare(b.name));

                return (
                  <div key={semester} className="space-y-4 md:space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="h-px flex-1 bg-fb-border"></span>
                      <h4 className="text-[10px] md:text-xs font-black text-fb-blue uppercase tracking-[0.3em] bg-fb-blue/5 px-4 md:px-6 py-2 rounded-full border border-fb-blue/10 italic">{semester}</h4>
                      <span className="h-px flex-1 bg-fb-border"></span>
                    </div>
                    {combinedItems.length === 0 ? (
                      <div className="py-10 text-center opacity-20"><p className="text-[10px] font-black uppercase tracking-widest italic">No courses defined for this term</p></div>
                    ) : (
                      <div className="space-y-3">
                        {combinedItems.map((item) => {
                          const grade = item.grade;
                          const isEditing = editingGradeId === item.id;
                          const canEditGrade = adminProfile.role !== 'teacher' || item.instructorId === adminProfile.uid || item.professor === formatName(adminProfile);
                          const courseAbsences = attendanceRecords.filter(r => r.courseId === item.id && r.status === 'absent');
                          const excusedCount = courseAbsences.filter(r => r.isExcused).length;
                          const isExpanded = expandedCourseId === item.id;

                          return (
                            <div key={item.id} className="bg-fb-gray/20 rounded-2xl p-4 md:px-6 md:py-4 border border-transparent hover:border-fb-blue/10 hover:bg-fb-gray/40 transition-all group">
                              
                              {/* Mobile View */}
                              <div className="md:hidden flex flex-col gap-1">
                                <div className="flex justify-between items-start">
                                  <div className="flex flex-col flex-1 mr-3">
                                    <span className="text-xs font-bold text-fb-textPrimary truncate capitalize italic leading-tight">{item.name}</span>
                                    {item.isOrphaned && <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter italic">Course Archived/Deleted</span>}
                                  </div>
                                  <div className="shrink-0 text-right">
                                    {isEditing ? (
                                      <input 
                                        type="number" 
                                        min="0"
                                        max="100"
                                        disabled={editFormData.isIncomplete}
                                        value={editFormData.isIncomplete ? '' : editFormData.gradeValue}
                                        onChange={(e) => {
                                          let val = Number(e.target.value);
                                          if (val > 100) val = 100;
                                          if (val < 0) val = 0;
                                          setEditFormData({...editFormData, gradeValue: val});
                                        }}
                                        className="w-12 text-center bg-white border border-fb-blue rounded-lg py-1 text-xs font-black outline-none disabled:bg-fb-gray"
                                        placeholder={editFormData.isIncomplete ? "-" : ""}
                                      />
                                    ) : (
                                      <span className="text-xs font-black text-fb-textPrimary">
                                        {grade ? (grade.isIncomplete ? "-" : grade.gradeValue) : "-"}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex justify-between items-start">
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                    <span className="text-[8px] font-bold text-fb-textSecondary opacity-60 capitalize tracking-tight">Prof. {item.professor}</span>
                                    {courseAbsences.length > 0 && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setExpandedCourseId(isExpanded ? null : item.id); }}
                                        className="flex items-center gap-1 text-[8px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                                      >
                                        <span>{courseAbsences.length} {courseAbsences.length === 1 ? 'Abs' : 'Absences'}</span>
                                        <span className="opacity-60 font-medium">({excusedCount} exc)</span>
                                        <ChevronDown size={8} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border shadow-sm">
                                        <span className="text-[8px] font-black text-fb-textSecondary uppercase tracking-tighter">Inc?</span>
                                        <input 
                                          type="checkbox" 
                                          checked={editFormData.isIncomplete}
                                          onChange={(e) => setEditFormData({...editFormData, isIncomplete: e.target.checked})}
                                          className="w-3 h-3 accent-fb-blue cursor-pointer"
                                        />
                                      </div>
                                    ) : (
                                      <span className={`text-[8px] font-black uppercase tracking-widest ${grade ? (grade.isIncomplete ? 'text-amber-600' : grade.gradeValue === '' ? 'text-fb-textSecondary' : grade.gradeValue >= 75 ? 'text-emerald-600' : 'text-rose-600') : 'text-fb-textSecondary'}`}>
                                        {grade ? getStatus(grade.gradeValue, grade.isIncomplete).label : 'Pending'}
                                      </span>
                                    )}
                                    
                                    <div className="flex justify-end gap-2 mt-1">
                                      {canEditGrade && (
                                        isEditing ? (
                                          <>
                                            <button onClick={() => handleUpdateGrade(item.id!, item.name, item.yearLevel, item.semester)} className="p-1.5 bg-fb-blue text-white rounded-lg shadow-md hover:bg-blue-600 transition-all"><Check size={12} /></button>
                                            <button onClick={() => setEditingGradeId(null)} className="p-1.5 bg-white text-fb-textSecondary rounded-lg border hover:bg-fb-gray transition-all"><X size={12} /></button>
                                          </>
                                        ) : (
                                          confirmResetId === item.id ? (
                                            <>
                                              <button 
                                                onClick={() => {
                                                  handleResetGrade(item.id!, item.name);
                                                  setConfirmResetId(null);
                                                }} 
                                                className="p-1.5 bg-emerald-500 text-white rounded-lg shadow-md hover:bg-emerald-600 transition-all"
                                                title="Confirm Reset"
                                              >
                                                <Check size={12} />
                                              </button>
                                              <button 
                                                onClick={() => setConfirmResetId(null)} 
                                                className="p-1.5 bg-rose-500 text-white rounded-lg shadow-md hover:bg-rose-600 transition-all"
                                                title="Cancel"
                                              >
                                                <X size={12} />
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <button 
                                                onClick={() => {
                                                  setEditingGradeId(item.id!);
                                                  setEditFormData({ gradeValue: grade?.gradeValue !== undefined ? grade.gradeValue : '', isIncomplete: grade?.isIncomplete || false });
                                                }}
                                                className="p-1.5 text-fb-textSecondary hover:bg-fb-blue hover:text-white rounded-lg transition-all bg-white border border-transparent shadow-sm"
                                                title="Edit Grade"
                                              >
                                                <Edit2 size={12} />
                                              </button>
                                              {grade && (adminProfile.role !== 'teacher' || canEditGrade) && (
                                                <button 
                                                  onClick={() => setConfirmResetId(item.id!)}
                                                  className="p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all bg-white border border-transparent shadow-sm"
                                                  title="Reset Grade to Pending"
                                                >
                                                  <RotateCcw size={12} />
                                                </button>
                                              )}
                                            </>
                                          )
                                        )
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Desktop View */}
                              <div className="hidden md:grid grid-cols-12 items-center gap-0 w-full">
                                <div className="col-span-5 flex flex-col w-full">
                                  <span className="text-sm font-bold text-fb-textPrimary truncate capitalize italic leading-tight">{item.name}</span>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="text-[9px] font-bold text-fb-textSecondary opacity-60 capitalize tracking-tight">Prof. {item.professor}</span>
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
                                  {isEditing ? (
                                    <input 
                                      type="number" 
                                      min="0"
                                      max="100"
                                      disabled={editFormData.isIncomplete}
                                      value={editFormData.isIncomplete ? '' : editFormData.gradeValue}
                                      onChange={(e) => {
                                        let val = Number(e.target.value);
                                        if (val > 100) val = 100;
                                        if (val < 0) val = 0;
                                        setEditFormData({...editFormData, gradeValue: val});
                                      }}
                                      className="w-20 text-center bg-white border-2 border-fb-blue rounded-xl py-1.5 text-sm font-black outline-none disabled:bg-fb-gray"
                                      placeholder={editFormData.isIncomplete ? "-" : ""}
                                    />
                                  ) : (
                                    <span className="text-sm font-black text-fb-textPrimary">
                                      {grade ? (grade.isIncomplete ? "-" : grade.gradeValue) : "-"}
                                    </span>
                                  )}
                                </div>
                                <div className="col-span-3 flex flex-col items-center">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border shadow-sm">
                                      <span className="text-[10px] font-black text-fb-textSecondary uppercase tracking-tighter">Incomplete?</span>
                                      <input 
                                        type="checkbox" 
                                        checked={editFormData.isIncomplete}
                                        onChange={(e) => setEditFormData({...editFormData, isIncomplete: e.target.checked})}
                                        className="w-4 h-4 accent-fb-blue cursor-pointer"
                                      />
                                    </div>
                                  ) : (
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${grade ? getStatus(grade.gradeValue, grade.isIncomplete).color : 'bg-fb-gray text-fb-textSecondary'}`}>
                                      {grade ? getStatus(grade.gradeValue, grade.isIncomplete).label : 'Pending'}
                                    </span>
                                  )}
                                </div>
                                <div className="col-span-2 flex justify-end gap-2">
                                  {canEditGrade && (
                                    isEditing ? (
                                      <>
                                        <button onClick={() => handleUpdateGrade(item.id!, item.name, item.yearLevel, item.semester)} className="p-2.5 bg-fb-blue text-white rounded-xl shadow-md hover:bg-blue-600 transition-all"><Check size={16} /></button>
                                        <button onClick={() => setEditingGradeId(null)} className="p-2.5 bg-white text-fb-textSecondary rounded-xl border hover:bg-fb-gray transition-all"><X size={16} /></button>
                                      </>
                                    ) : (
                                      confirmResetId === item.id ? (
                                        <div className="flex items-center gap-1.5 bg-rose-50/50 border border-rose-100 p-1 rounded-xl">
                                          <span className="text-[9px] font-black uppercase text-rose-700 px-1">Reset?</span>
                                          <button 
                                            onClick={() => {
                                              handleResetGrade(item.id!, item.name);
                                              setConfirmResetId(null);
                                            }} 
                                            className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all"
                                            title="Confirm Reset"
                                          >
                                            <Check size={12} />
                                          </button>
                                          <button 
                                            onClick={() => setConfirmResetId(null)} 
                                            className="p-1.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all"
                                            title="Cancel"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <button 
                                            onClick={() => {
                                              setEditingGradeId(item.id!);
                                              setEditFormData({ gradeValue: grade?.gradeValue !== undefined ? grade.gradeValue : '', isIncomplete: grade?.isIncomplete || false });
                                            }}
                                            className="p-2.5 text-fb-textSecondary hover:bg-fb-blue hover:text-white rounded-xl transition-all"
                                            title="Edit Grade"
                                          >
                                            <Edit2 size={16} />
                                          </button>
                                          {grade && (adminProfile.role !== 'teacher' || canEditGrade) && (
                                            <button 
                                              onClick={() => setConfirmResetId(item.id!)}
                                              className="p-2.5 text-rose-600 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                                              title="Reset Grade to Pending"
                                            >
                                              <RotateCcw size={16} />
                                            </button>
                                          )}
                                        </>
                                      )
                                    )
                                  )}
                                </div>
                              </div>

                              {/* Expanded Absences Details */}
                              {isExpanded && courseAbsences.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-fb-border/40 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-fb-textSecondary">Absence History</p>
                                  <div className="space-y-1.5">
                                    {courseAbsences.map(abs => (
                                      <div key={abs.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-2 rounded-xl border border-fb-border/60 text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-fb-textPrimary font-semibold text-[10px]">{abs.date}</span>
                                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${abs.isExcused ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                            {abs.isExcused ? 'Excused' : 'Unexcused'}
                                          </span>
                                        </div>
                                        {abs.notes ? (
                                          <span className="text-fb-textSecondary font-medium italic mt-1 sm:mt-0 max-w-md truncate text-[11px]">Reason: "{abs.notes}"</span>
                                        ) : (
                                          <span className="text-fb-textSecondary/40 italic mt-1 sm:mt-0 text-[11px]">No reason provided</span>
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
          </>
        )}
        <div className="hidden md:flex p-6 border-t border-fb-border bg-fb-gray/5 justify-end">
          <button onClick={onClose} className="px-10 py-4 bg-white hover:bg-fb-hover text-fb-textPrimary border-2 border-fb-border rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all active:scale-95">Exit Records</button>
        </div>
      </div>
      {showHistory && <HistoryModal history={history} onClose={() => setShowHistory(false)} />}
      {showProfile && <StudentProfileViewModal student={student} onClose={() => setShowProfile(false)} />}

      {/* Hidden PDF Template */}
      <div id="student-records-pdf-container" style={{ position: 'absolute', top: 0, left: '-9999px' }}>
        {pagesData.map((page, index) => (
          <div key={`${page.yearLevel}-${page.semester}`} className="pdf-page" style={{ width: '210mm', minHeight: '297mm', padding: '20mm', background: 'white', color: 'black', fontFamily: 'sans-serif' }}>
            {index === 0 ? (
              <div className="flex items-center gap-6 mb-8 border-b pb-6">
                <div className="w-24 h-24 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
                   {student.photoURL ? <img src={student.photoURL} className="w-full h-full object-cover" /> : <span className="text-2xl font-bold">{student.firstName?.charAt(0) || formatName(student).charAt(0)}</span>}
                </div>
                <div>
                  <h1 className="text-2xl font-bold uppercase">{formatName(student)}</h1>
                  <p className="text-sm text-gray-600 uppercase tracking-widest mt-1">ID: {student.studentId || 'N/A'}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Generated on {new Date().toLocaleDateString()}</p>
                </div>
              </div>
            ) : (
              <div className="mb-8 border-b pb-6">
                <h1 className="text-xl font-bold uppercase">{formatName(student)} - Continued</h1>
                <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">ID: {student.studentId || 'N/A'}</p>
              </div>
            )}

            <div className="mb-8">
              <h3 className="text-sm font-black uppercase tracking-widest border-b pb-2 mb-4">{page.yearLevel} Records</h3>
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">{page.semester}</h4>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300 text-left">
                      <th className="py-2 font-bold">Course</th>
                      <th className="py-2 font-bold text-right">Grade</th>
                      <th className="py-2 font-bold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map(item => {
                      const g = item.grade;
                      const status = g ? getStatus(g.gradeValue, g.isIncomplete) : { label: 'Pending', color: '' };
                      return (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="py-2">{item.name}</td>
                          <td className="py-2 text-right font-mono">{g ? (g.isIncomplete ? '-' : g.gradeValue) : '-'}</td>
                          <td className="py-2 text-right">{status.label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
