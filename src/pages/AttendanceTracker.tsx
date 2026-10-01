import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Save,
  ChevronDown,
  CheckSquare,
} from 'lucide-react';

import { fetchAttendance, fetchCourses, fetchUsers, saveAttendance } from '../lib/data';
import { live } from '../lib/live';
import { formatName } from '../lib/format';
import type { AttendanceRecord, Course, UserProfile } from '../types';
import { toast } from '../lib/toast';

export const AttendanceTracker = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [schoolYearFilter, setSchoolYearFilter] = useState('');
  const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCourseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  useEffect(() => {
    const stopCourses = live(fetchCourses, setCourses, (error) => console.error("Error fetching courses:", error));
    const stopStudents = live(() => fetchUsers({ role: 'student' }), setStudents, (error) => console.error("Error fetching students:", error));
    return () => {
      stopCourses();
      stopStudents();
    };
  }, []);

  useEffect(() => {
    if (selectedCourse && selectedDate) {
      setLoading(true);
      return live(() => fetchAttendance({ courseId: selectedCourse, date: selectedDate }), (list) => {
        const records: Record<string, AttendanceRecord> = {};
        list.forEach(data => { records[data.studentId] = data; });
        setAttendanceRecords(records);
        setLoading(false);
      }, (error) => {
        console.error("Error fetching attendance:", error);
        setLoading(false);
      });
    } else {
      setAttendanceRecords({});
    }
  }, [selectedCourse, selectedDate]);

  const course = courses.find(c => c.id === selectedCourse);
  const enrolledStudents = useMemo(() => {
    if (!course) return [];
    const syField = course.yearLevel === '1st Year' ? 'firstYearSchoolYear' : 'secondYearSchoolYear';
    return students.filter(s => 
      s.yearLevel === course.yearLevel && s[syField as keyof UserProfile] === course.schoolYear
    );
  }, [course, students]);

  const handleRecordChange = (studentId: string, field: keyof AttendanceRecord, value: any) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { studentId, courseId: selectedCourse, date: selectedDate, status: 'present', isExcused: false, notes: '' }),
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!selectedCourse || !selectedDate) return;
    setSaving(true);
    try {
      const finalRecords = enrolledStudents.map(student => {
        const existing = attendanceRecords[student.uid];
        return existing || {
          studentId: student.uid,
          courseId: selectedCourse,
          date: selectedDate,
          status: 'present',
          isExcused: false,
          notes: ''
        };
      });

      await saveAttendance(selectedCourse, selectedDate, finalRecords as AttendanceRecord[]);
      toast.success("Attendance saved successfully!");
    } catch (error: any) {
      toast.error("Error saving attendance: " + error.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-8 border border-fb-border shadow-sm">
        <h2 className="text-xl font-black italic uppercase text-fb-textPrimary mb-6 flex items-center gap-3"><CheckSquare className="text-fb-blue" size={24} /> Attendance Tracker</h2>
        
        <div className="space-y-4 mb-8 p-4 bg-fb-gray/50 rounded-2xl border border-fb-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Filter Semester</label>
              <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all appearance-none">
                <option value="">All Semesters</option>
                {Array.from(new Set(courses.map(c => c.semester))).filter(Boolean).sort().map(sem => (
                  <option key={sem} value={sem}>{sem}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Filter School Year</label>
              <select value={schoolYearFilter} onChange={(e) => setSchoolYearFilter(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all appearance-none">
                <option value="">All School Years</option>
                {Array.from(new Set(courses.map(c => c.schoolYear))).filter(Boolean).sort().reverse().map(sy => (
                  <option key={sy} value={sy}>{sy}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-fb-border">
            <div className="space-y-1.5" ref={dropdownRef}>
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Select Course</label>
              <div className="relative">
                <div 
                  className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all cursor-pointer flex justify-between items-center"
                  onClick={() => setIsCourseDropdownOpen(!isCourseDropdownOpen)}
                >
                  <span className={selectedCourse ? "text-fb-textPrimary" : "text-fb-textSecondary"}>
                    {selectedCourse ? (courses.find(c => c.id === selectedCourse)?.name + " (" + courses.find(c => c.id === selectedCourse)?.schoolYear + " - " + courses.find(c => c.id === selectedCourse)?.semester + ")") : "-- Choose Course --"}
                  </span>
                  <ChevronDown size={16} className={`text-fb-textSecondary transition-transform ${isCourseDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {isCourseDropdownOpen && (
                  <div className="absolute z-50 mt-2 w-full bg-white border border-fb-border rounded-xl shadow-xl overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-fb-border sticky top-0 bg-white">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={16} />
                        <input 
                          type="text" 
                          placeholder="Search course name..." 
                          value={courseSearch} 
                          onChange={(e) => setCourseSearch(e.target.value)} 
                          className="w-full pl-9 pr-3 py-2 bg-fb-gray/50 border border-fb-border rounded-lg text-sm font-semibold outline-none focus:border-fb-blue transition-all" 
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2">
                      {courses.filter(c => {
                        const matchSearch = c.name.toLowerCase().includes(courseSearch.toLowerCase());
                        const matchSem = semesterFilter === '' || c.semester === semesterFilter;
                        const matchSY = schoolYearFilter === '' || c.schoolYear === schoolYearFilter;
                        return matchSearch && matchSem && matchSY;
                      }).length === 0 ? (
                        <div className="p-3 text-sm text-fb-textSecondary text-center italic">No courses found</div>
                      ) : (
                        courses.filter(c => {
                          const matchSearch = c.name.toLowerCase().includes(courseSearch.toLowerCase());
                          const matchSem = semesterFilter === '' || c.semester === semesterFilter;
                          const matchSY = schoolYearFilter === '' || c.schoolYear === schoolYearFilter;
                          return matchSearch && matchSem && matchSY;
                        }).map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setSelectedCourse(c.id);
                              setIsCourseDropdownOpen(false);
                            }}
                            className={`px-3 py-2 text-sm font-semibold rounded-lg cursor-pointer transition-all ${selectedCourse === c.id ? 'bg-fb-blue text-white' : 'hover:bg-fb-gray text-fb-textPrimary'}`}
                          >
                            {c.name} ({c.schoolYear} - {c.semester})
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Select Date</label>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all" />
            </div>
          </div>
        </div>



        {selectedCourse && selectedDate && (
          <div>
            <h3 className="text-xs font-black uppercase text-fb-textSecondary tracking-widest mb-4 border-b border-fb-border pb-2">Enrolled Students ({enrolledStudents.length})</h3>
            {loading ? (
              <div className="py-8 flex justify-center"><RefreshCw className="animate-spin text-fb-blue" size={24} /></div>
            ) : enrolledStudents.length === 0 ? (
              <div className="text-center py-12 bg-fb-gray rounded-2xl">
                <p className="text-xs font-bold text-fb-textSecondary uppercase tracking-widest">No students enrolled in this course.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {enrolledStudents.map(student => {
                  const record = attendanceRecords[student.uid] || { status: 'present', isExcused: false, notes: '' };
                  const isAbsent = record.status === 'absent';
                  
                  return (
                    <div key={student.uid} className="bg-fb-gray/50 border border-fb-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
                      <div className="flex-1">
                        <p className="font-black text-sm capitalize italic">{formatName(student)}</p>
                        <p className="text-[10px] font-bold text-fb-textSecondary uppercase tracking-wider">{student.studentId || 'No ID'}</p>
                      </div>
                      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                        <div className="flex bg-white rounded-xl overflow-hidden border border-fb-border">
                          <button onClick={() => handleRecordChange(student.uid, 'status', 'present')} className={`px-6 py-2 text-xs font-black uppercase tracking-wider transition-all ${!isAbsent ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-fb-gray text-fb-textSecondary'}`}>Present</button>
                          <button onClick={() => handleRecordChange(student.uid, 'status', 'absent')} className={`px-6 py-2 text-xs font-black uppercase tracking-wider transition-all ${isAbsent ? 'bg-rose-100 text-rose-700' : 'hover:bg-fb-gray text-fb-textSecondary'}`}>Absent</button>
                        </div>
                        {isAbsent && (
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={record.isExcused} onChange={(e) => handleRecordChange(student.uid, 'isExcused', e.target.checked)} className="w-4 h-4 text-fb-blue rounded focus:ring-fb-blue" />
                              <span className="text-[10px] font-black uppercase text-fb-textSecondary tracking-wider">Excused</span>
                            </label>
                            <input type="text" placeholder="Reason / Notes" value={record.notes || ''} onChange={(e) => handleRecordChange(student.uid, 'notes', e.target.value)} className="bg-white border border-fb-border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:border-fb-blue" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {enrolledStudents.length > 0 && (
              <div className="mt-8 flex justify-end">
                <button onClick={handleSave} disabled={saving} className="px-8 py-3 bg-fb-blue text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-fb-blue/20 hover:shadow-fb-blue/40 transition-all disabled:opacity-50 flex items-center gap-2">
                  {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                  <span>Save Attendance</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
