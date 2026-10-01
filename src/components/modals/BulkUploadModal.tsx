import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  AlertCircle,
  RefreshCw,
  Filter,
  X,
  ChevronDown,
  Check,
  RotateCcw,
  Database,
} from 'lucide-react';

import { fetchCourses, setGradesBulk } from '../../lib/data';
import { live } from '../../lib/live';
import { formatName } from '../../lib/format';
import type { Course, UserProfile } from '../../types';
import { toast } from '../../lib/toast';

export const BulkUploadModal = ({ studentData, adminProfile, onClose }: { studentData: UserProfile[], adminProfile: UserProfile, onClose: () => void }) => {
  const [courses, setCourses] = useState([] as Course[]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filterYearLevel, setFilterYearLevel] = useState('All');
  const [filterSemester, setFilterSemester] = useState('All');
  const [filterSchoolYear, setFilterSchoolYear] = useState('All');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const schoolYears = Array.from(new Set(studentData.flatMap(s => [s.firstYearSchoolYear, s.secondYearSchoolYear]).filter(Boolean))) as string[];
  schoolYears.sort((a, b) => b.localeCompare(a));

  const enrolledStudentsList = studentData.filter(s => s.yearLevel === '1st Year' || s.yearLevel === '2nd Year');
  enrolledStudentsList.sort((a, b) => formatName(a).localeCompare(formatName(b)));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsStudentDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    return live(fetchCourses, setCourses);
  }, []);

  const generateTemplate = () => {
    const headers = ["Student ID", "Student Name", "Year Level", "Semester", "Course ID", "Course Name", "Grade", "Incomplete (TRUE/FALSE)"];
    let csvContent = headers.join(",") + "\n";
    
    let enrolledStudents = studentData.filter(s => s.yearLevel === '1st Year' || s.yearLevel === '2nd Year');

    if (selectedStudents.length > 0) {
      enrolledStudents = enrolledStudents.filter(s => selectedStudents.includes(s.uid));
    }

    enrolledStudents.forEach(student => {
      let studentCourses = [];
      if (student.yearLevel === '2nd Year') {
        studentCourses = courses.filter(c => c.yearLevel === '1st Year' || c.yearLevel === '2nd Year');
      } else {
        studentCourses = courses.filter(c => c.yearLevel === student.yearLevel);
      }

      if (filterYearLevel !== 'All') {
        studentCourses = studentCourses.filter(c => c.yearLevel === filterYearLevel);
      }
      if (filterSemester !== 'All') {
        studentCourses = studentCourses.filter(c => c.semester === filterSemester);
      }
      if (filterSchoolYear !== 'All') {
        studentCourses = studentCourses.filter(c => {
          if (c.yearLevel === '1st Year') return student.firstYearSchoolYear === filterSchoolYear;
          if (c.yearLevel === '2nd Year') return student.secondYearSchoolYear === filterSchoolYear;
          return false;
        });
      }

      studentCourses.forEach(course => {
          const row = [
            `"${student.studentId || ''}"`,
            `"${formatName(student)}"`,
            `"${course.yearLevel || ''}"`,
            `"${course.semester || ''}"`,
            `"${course.id}"`,
            `"${course.name}"`,
            '', // Grade placeholder
            'FALSE' // Incomplete placeholder
          ];
          csvContent += row.join(",") + "\n";
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `grades_template_${filterYearLevel.replace(' ', '_')}_${filterSemester.replace(' ', '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter(line => line.trim() !== "");
      if (lines.length <= 1) {
        toast.error("CSV file is empty or missing data.");
        return;
      }

      const rows = lines.slice(1);
      const updates: Record<string, Parameters<typeof setGradesBulk>[0][number]> = {};

      for (const row of rows) {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        if (values.length < 7) continue;

        const studentId = values[0];
        const studentName = values[1];
        // Columns 2, 3 and 5 (year level, semester, course name) are for the reader only.
        const courseId = values[4];
        const gradeStr = values[6];
        const gradeValue = gradeStr === '' ? '' : Number(gradeStr);
        const isIncomplete = values[7] ? values[7].toUpperCase() === 'TRUE' : false;

        if (gradeValue !== '' && isNaN(gradeValue as number) && !isIncomplete) continue;
        if (gradeValue === '' && !isIncomplete) continue; // Skip if no grade and not incomplete

        // Try to find student by ID first, then by name if ID is empty
        let student = null;
        if (studentId) {
          student = studentData.find(s => s.studentId === studentId);
        }
        if (!student && studentName) {
          student = studentData.find(s => formatName(s).toLowerCase() === studentName.toLowerCase());
        }
        
        if (!student) continue;

        // Templates made before the move to PostgreSQL carry the old Firestore course ids.
        const course = courses.find(c => c.id === courseId || c.legacyId === courseId);
        if (!course) continue;

        // A later row for the same student and course wins, as before.
        updates[`${student.uid}|${course.id}`] = {
          studentUid: student.uid,
          courseId: course.id,
          gradeValue: isIncomplete ? '' : gradeValue,
          isIncomplete,
        };
      }

      if (Object.keys(updates).length === 0) {
        toast.error("No valid grade updates found in the CSV. Make sure you entered grades or set Incomplete to TRUE.");
        return;
      }

      setIsProcessing(true);
      try {
        // All rows are saved together, or none are.
        await setGradesBulk(Object.values(updates));
        toast.success("Bulk grades updated successfully.");
        onClose();
      } catch (err) {
        toast.error("Failed to update bulk grades.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(selectedFile);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-fb-border p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div />
          <button onClick={onClose} className="p-2 hover:bg-fb-hover rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 bg-fb-gray/20 p-4 rounded-2xl border border-fb-border">
            <h3 className="text-[10px] font-black text-fb-textPrimary uppercase tracking-widest flex items-center gap-2">
              <Filter size={14} /> Template Filters
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <select 
                value={filterYearLevel} 
                onChange={e => setFilterYearLevel(e.target.value)}
                className="w-full p-2.5 bg-white border border-fb-border rounded-xl text-xs font-medium text-fb-textPrimary focus:ring-2 focus:ring-fb-blue outline-none"
              >
                <option value="All">All Year Levels</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
              </select>
              <select 
                value={filterSemester} 
                onChange={e => setFilterSemester(e.target.value)}
                className="w-full p-2.5 bg-white border border-fb-border rounded-xl text-xs font-medium text-fb-textPrimary focus:ring-2 focus:ring-fb-blue outline-none"
              >
                <option value="All">All Semesters</option>
                <option value="1st Semester">1st Semester</option>
                <option value="2nd Semester">2nd Semester</option>
                <option value="3rd Semester">3rd Semester</option>
              </select>
              <select 
                value={filterSchoolYear} 
                onChange={e => setFilterSchoolYear(e.target.value)}
                className="w-full p-2.5 bg-white border border-fb-border rounded-xl text-xs font-medium text-fb-textPrimary focus:ring-2 focus:ring-fb-blue outline-none"
              >
                <option value="All">All School Years</option>
                {schoolYears.map(sy => <option key={sy} value={sy}>{sy}</option>)}
              </select>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
                  className="w-full p-2.5 bg-white border border-fb-border rounded-xl text-xs font-medium text-fb-textPrimary focus:ring-2 focus:ring-fb-blue outline-none text-left flex justify-between items-center"
                >
                  <span className="truncate">
                    {selectedStudents.length === 0 
                      ? "All Students" 
                      : `${selectedStudents.length} Student${selectedStudents.length > 1 ? 's' : ''} Selected`}
                  </span>
                  <ChevronDown size={14} className="text-fb-textSecondary" />
                </button>
                {isStudentDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-fb-border rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    <div 
                      className="p-2.5 text-xs font-medium text-fb-textPrimary hover:bg-fb-gray cursor-pointer flex items-center gap-2"
                      onClick={() => setSelectedStudents([])}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedStudents.length === 0 ? 'bg-fb-blue border-fb-blue text-white' : 'border-fb-border'}`}>
                        {selectedStudents.length === 0 && <Check size={12} />}
                      </div>
                      All Students
                    </div>
                    {enrolledStudentsList.map(s => (
                      <div 
                        key={s.uid}
                        className="p-2.5 text-xs font-medium text-fb-textPrimary hover:bg-fb-gray cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          setSelectedStudents(prev => 
                            prev.includes(s.uid) ? prev.filter(id => id !== s.uid) : [...prev, s.uid]
                          );
                        }}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedStudents.includes(s.uid) ? 'bg-fb-blue border-fb-blue text-white' : 'border-fb-border'}`}>
                          {selectedStudents.includes(s.uid) && <Check size={12} />}
                        </div>
                        {formatName(s)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button 
              onClick={generateTemplate}
              className="w-full py-3 bg-fb-gray hover:bg-fb-hover text-fb-textPrimary rounded-xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} /> Download Filtered Template
            </button>
          </div>

          <div className="p-6 bg-fb-gray/30 rounded-2xl border-2 border-dashed border-fb-border flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-white rounded-full shadow-sm text-fb-blue">
              <Plus size={32} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-fb-textPrimary">Upload CSV File</p>
              <p className="text-[10px] font-medium text-fb-textSecondary uppercase tracking-widest">Max file size: 5MB</p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept=".csv" 
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-bold text-fb-blue">{selectedFile.name}</p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-fb-textSecondary hover:underline"
                >
                  Change File
                </button>
              </div>
            ) : (
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-6 py-2.5 bg-fb-blue text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center gap-2"
              >
                <Search size={14} />
                Select File
              </button>
            )}
          </div>

          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertCircle size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Instructions</span>
            </div>
            <p className="text-[10px] font-medium text-amber-800 leading-relaxed">
              1. Download the template below.<br />
              2. Fill in the grade values and set Incomplete to TRUE or FALSE.<br />
              3. Save as CSV and upload here.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          {selectedFile && (
            <button 
              onClick={handleUpload}
              disabled={isProcessing}
              className="w-full py-4 bg-fb-blue text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
            >
              {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
              {isProcessing ? 'Uploading...' : 'Upload Grades'}
            </button>
          )}
          <button 
            onClick={onClose} 
            className="w-full py-4 text-fb-textSecondary font-black uppercase text-[10px] tracking-[0.2em] hover:bg-fb-gray rounded-2xl transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
