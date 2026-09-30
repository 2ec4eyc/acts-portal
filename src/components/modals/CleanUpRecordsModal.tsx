import { useState, useEffect } from 'react';
import { Search, CheckCircle, RefreshCw, X } from 'lucide-react';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';

import { db } from '../../lib/firebase';
import { formatName } from '../../lib/format';
import type { Course, UserProfile } from '../../types';

export const CleanUpRecordsModal = ({ students, onClose, onSuccess, onError }: { students: UserProfile[], onClose: () => void, onSuccess: (msg: string) => void, onError: (msg: string) => void }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const snap = await getDocs(collection(db, "courses"));
        const list: Course[] = [];
        snap.forEach(doc => {
          const data = doc.data() as Course;
          if (data.status !== 'archived') {
            list.push({ ...data, id: doc.id });
          }
        });
        setCourses(list);
      } catch (err) {
        console.error("Error fetching courses:", err);
      } finally {
        setLoadingCourses(false);
      }
    };
    fetchCourses();
  }, []);

  const handleCleanUp = async () => {
    if (selectedStudents.length === 0) return;
    setIsProcessing(true);
    try {
      const activeCourseIds = new Set(courses.map(c => c.id));
      const promises = selectedStudents.map(async (uid) => {
        const student = students.find(s => s.uid === uid);
        if (!student || !student.grades) return;
        
        const originalGrades = student.grades;
        const cleanedGrades = originalGrades.filter(g => activeCourseIds.has(g.id));
        
        if (originalGrades.length !== cleanedGrades.length) {
          await updateDoc(doc(db, "users", uid), { grades: cleanedGrades });
        }
      });
      await Promise.all(promises);
      onSuccess("Successfully cleaned up selected students' records.");
      onClose();
    } catch (err: any) {
      onError("Cleanup failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleStudent = (uid: string) => {
    setSelectedStudents(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const filteredStudents = students.filter(s => 
    s.role === 'student' && 
    formatName(s).toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => formatName(a).localeCompare(formatName(b)));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl border border-fb-border flex flex-col">
        <div className="p-6 border-b border-fb-border flex justify-between items-center bg-fb-gray/50">
          <h2 className="text-xl font-bold text-fb-textPrimary tracking-tight flex items-center gap-2">
            <RefreshCw className="text-fb-blue" size={20} />
            Clean Up Student Records
          </h2>
          <button onClick={onClose} className="p-2 bg-white hover:bg-gray-100 rounded-full transition-all text-fb-textPrimary shadow-sm">
            <X size={16} />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-4 flex-1 overflow-hidden">
          <p className="text-sm text-fb-textSecondary leading-relaxed font-medium">
            Select students to clean up their enrolled courses. This will remove any course from their records that is no longer active or does not exist in the course list.
          </p>
          
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={16} />
            <input 
              type="text" 
              placeholder="Search students..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-fb-gray border border-transparent rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-fb-blue text-sm font-semibold transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-fb-border rounded-xl custom-scrollbar">
            {loadingCourses ? (
              <div className="flex items-center justify-center h-full p-8">
                <RefreshCw className="animate-spin text-fb-blue" size={24} />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-8 text-center text-fb-textSecondary text-sm font-bold">No students found.</div>
            ) : (
              <div className="divide-y divide-fb-border">
                {filteredStudents.map(student => (
                  <label key={student.uid} className="flex items-center gap-3 p-4 hover:bg-fb-gray/50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      checked={selectedStudents.includes(student.uid)}
                      onChange={() => toggleStudent(student.uid)}
                      className="w-4 h-4 rounded border-gray-300 text-fb-blue focus:ring-fb-blue"
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-fb-textPrimary">{formatName(student)}</span>
                      <span className="text-xs text-fb-textSecondary">{student.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-fb-border bg-fb-gray/50 flex justify-between items-center">
          <span className="text-xs font-bold text-fb-textSecondary uppercase tracking-widest">
            {selectedStudents.length} Selected
          </span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2.5 bg-white text-fb-textPrimary border border-fb-border rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-fb-gray transition-all">
              Cancel
            </button>
            <button 
              onClick={handleCleanUp} 
              disabled={isProcessing || selectedStudents.length === 0 || loadingCourses}
              className="px-6 py-2.5 bg-fb-blue text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isProcessing ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
              {isProcessing ? 'Cleaning...' : 'Clean Up Records'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
