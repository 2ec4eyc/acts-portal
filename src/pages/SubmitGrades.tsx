import { useState, useEffect } from 'react';
import {
  GraduationCap,
  Search,
  ChevronRight,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Database,
} from 'lucide-react';

import { Card } from '../components/Card';
import { BulkUploadModal } from '../components/modals/BulkUploadModal';
import { GradesModal } from '../components/modals/GradesModal';
import { PermissionDeniedGate } from '../components/PermissionDeniedGate';
import { ApiError } from '../lib/api';
import { fetchUsers } from '../lib/data';
import { live } from '../lib/live';
import { formatName } from '../lib/format';
import type { UserProfile } from '../types';

export const SubmitGrades = ({ adminProfile }: { adminProfile: UserProfile }) => {
  const [studentData, setStudentData] = useState([] as UserProfile[]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [permissionError, setPermissionError] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [yearFilter, setYearFilter] = useState('All' as 'All' | '1st Year' | '2nd Year');
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [sortOrder, setSortOrder] = useState('none' as 'none' | 'asc' | 'desc');

  const toggleSort = () => {
    setSortOrder(prev => prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none');
  };

  useEffect(() => {
    return live(() => fetchUsers({ role: 'student' }), (list) => {
      setStudentData(list.filter((item) => item && (formatName(item) || item.email)));
      setPermissionError(false);
    }, (error) => {
      if (error instanceof ApiError && error.status === 403) {
        console.warn("Permission denied for student database.");
        setPermissionError(true);
      }
    });
  }, []);

  if (permissionError) return <PermissionDeniedGate message="Insufficient permissions to load student database" />;

  const filteredStudents = studentData.filter(s => {
    const term = studentSearchTerm.toLowerCase();
    const matchesSearch = formatName(s).toLowerCase().includes(term) || (s.email || '').toLowerCase().includes(term);
    const matchesYear = yearFilter === 'All' || s.yearLevel === yearFilter;
    return matchesSearch && matchesYear;
  }).sort((a, b) => {
    const nameA = formatName(a).toLowerCase();
    const nameB = formatName(b).toLowerCase();
    if (sortOrder === 'asc') return nameA.localeCompare(nameB);
    if (sortOrder === 'desc') return nameB.localeCompare(nameA);
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="space-y-8 pb-10">
      <Card noPadding>
        {/* Uniform Header Layout matching Course Page - 40/15/15/15/15 grid */}
        <div className="p-3 md:p-4 lg:p-5 flex flex-col md:flex-row gap-3 md:gap-4 border-b border-fb-border items-start">
          {/* Search Box - 40% */}
          <div className="w-full md:w-[40%] relative">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={14} />
            <input 
              type="text" 
              placeholder="Search student registry..." 
              className="w-full h-full bg-fb-gray border border-transparent rounded-full pl-9 md:pl-10 pr-9 md:pr-10 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[10px] md:text-xs font-semibold transition-all" 
              value={studentSearchTerm} 
              onChange={(e) => setStudentSearchTerm(e.target.value)} 
            />
            {studentSearchTerm && (
              <button 
                onClick={() => setStudentSearchTerm('')}
                className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white rounded-full text-fb-textSecondary transition-all"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Year Filter - 15% */}
          <div className="w-full md:w-[15%] relative">
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value as any)} className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer">
              <option value="All">All Years</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
            </select>
          </div>

          {/* Filler Spacer - 15% */}
          <div className="hidden md:block md:w-[15%]"></div>
          
          {/* Filler Spacer - 15% */}
          <div className="hidden md:block md:w-[15%]"></div>

          {/* Action Column - 15% */}
          {adminProfile.role === 'admin' ? (
            <div className="w-full md:w-[15%] flex flex-col gap-2">
              <button 
                onClick={() => setIsBulkUploading(true)}
                className="w-full bg-fb-blue text-white py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Database size={14} /><span>Upload Grades</span>
              </button>
            </div>
          ) : (
            <div className="hidden md:block md:w-[15%]"></div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-fb-gray/50 border-b text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">
              <tr>
                <th className="px-8 py-5">
                  <div className="flex items-center gap-2">
                    <span>Student</span>
                    <button onClick={toggleSort} className={`p-1 rounded transition-all ${sortOrder !== 'none' ? 'text-fb-blue' : 'hover:bg-fb-gray'}`}>
                      {sortOrder === 'none' ? <ArrowUpDown size={12}/> : sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                    </button>
                  </div>
                </th>
                <th className="px-8 py-5">Batch / Year</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredStudents.map((student) => (
                <tr key={student.uid} className="hover:bg-fb-hover transition-all">
                  <td className="px-8 py-5 font-bold capitalize italic text-sm">{formatName(student)}</td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="px-4 py-1.5 bg-fb-gray rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-sm">
                        {student.yearLevel || 'N/A'}
                      </span>
                      {student.batchName && (
                        <span className="text-[10px] font-bold text-fb-textSecondary capitalize italic">
                          Batch: {student.batchName}
                        </span>
                      )}
                      {student.schoolType && (
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                          student.schoolType === 'Day School' 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                            : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                        }`}>
                          {student.schoolType}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button onClick={() => setSelectedStudent(student)} className="px-3 md:px-4 py-1.5 md:py-2 bg-fb-blue/5 text-fb-blue hover:bg-fb-blue hover:text-white rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest transition-all">Records <ChevronRight className="inline" size={12} /></button>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-24 text-center opacity-30">
                    <div className="flex flex-col items-center">
                      <GraduationCap size={48} className="mb-4" />
                      <p className="font-black uppercase text-[10px] tracking-widest italic">No student records found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden flex flex-col divide-y">
          {filteredStudents.map((student) => (
            <div key={student.uid} className="p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <p className="font-bold text-fb-textPrimary text-sm capitalize italic">{formatName(student)}</p>
                  {student.studentId && <p className="text-[10px] font-black uppercase text-fb-blue tracking-tighter">ID: {student.studentId}</p>}
                  {student.batchName && <p className="text-[10px] font-bold text-fb-textSecondary capitalize italic">Batch: {student.batchName}</p>}
                  {student.schoolType && (
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border self-start mt-0.5 ${
                      student.schoolType === 'Day School' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                        : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                    }`}>
                      {student.schoolType}
                    </span>
                  )}
                </div>
                <span className="px-3 py-1 bg-fb-gray rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-sm">{student.yearLevel || 'N/A'}</span>
              </div>
              
              <div className="flex items-center justify-end pt-2 border-t border-dashed border-fb-border/50">
                <button onClick={() => setSelectedStudent(student)} className="flex items-center gap-1.5 px-3 py-1.5 bg-fb-blue/5 text-fb-blue hover:bg-fb-blue hover:text-white rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest transition-all">
                  Records <ChevronRight size={10} />
                </button>
              </div>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <div className="py-16 text-center opacity-30">
              <div className="flex flex-col items-center">
                <GraduationCap size={32} className="mb-3" />
                <p className="font-black uppercase text-[10px] tracking-widest italic">No student records found</p>
              </div>
            </div>
          )}
        </div>
      </Card>
      {selectedStudent && <GradesModal student={selectedStudent} adminProfile={adminProfile} onClose={() => setSelectedStudent(null)} />}
      {isBulkUploading && <BulkUploadModal studentData={studentData} adminProfile={adminProfile} onClose={() => setIsBulkUploading(false)} />}
    </div>
  );
};
