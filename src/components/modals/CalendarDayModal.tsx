import { useState, useEffect } from 'react';
import {
  User as UserIcon,
  RefreshCw,
  X,
  Edit2,
  Repeat,
  Clock,
  Download,
  FileText,
} from 'lucide-react';

import { downloadMaterial, fetchFiles } from '../../lib/data';
import { live } from '../../lib/live';
import type { Course } from '../../types';
import { toast } from '../../lib/toast';

export const CalendarDayModal = ({ 
  data, 
  onClose,
  onEditCourse
}: { 
  data: { date: string, courses: Course[] } | null, 
  onClose: () => void,
  onEditCourse?: (course: Course) => void
}) => {
  if (!data) return null;

  const formatProfessorName = (name: string) => {
    if (!name) return 'N/A';
    if (name.includes(',')) {
      const parts = name.split(',');
      return `${parts[1].trim()} ${parts[0].trim()}`;
    }
    return name;
  };

  const [courseNotes, setCourseNotes] = useState<{[courseId: string]: any[]}>({});
  const [notesLoading, setNotesLoading] = useState(false);

  useEffect(() => {
    if (!data || data.courses.length === 0) return;
    setNotesLoading(true);
    const courseIds = data.courses.map(c => c.id);
    return live(() => fetchFiles({ category: 'notes' }), (files) => {
      const notesMap: {[courseId: string]: any[]} = {};
      files.forEach(file => {
        if (file.archived) return;
        if (courseIds.includes(file.courseId)) {
          if (!notesMap[file.courseId]) {
            notesMap[file.courseId] = [];
          }
          notesMap[file.courseId].push(file);
        }
      });
      setCourseNotes(notesMap);
      setNotesLoading(false);
    }, (error) => {
      console.error("Error fetching notes for calendar modal:", error);
      setNotesLoading(false);
    });
  }, [data]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-fb-textPrimary/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden transform transition-all border border-fb-border">
        <div className="p-8 border-b bg-[#F0F2F5]/40 flex items-center justify-between">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-fb-blue italic mb-1">Academic Registry</h3>
            <h2 className="text-2xl font-black text-fb-textPrimary uppercase italic tracking-tighter">
              {new Date(data.date).toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
          </div>
          <button onClick={onClose} className="p-3 bg-white hover:bg-fb-gray border border-fb-border rounded-full transition-all text-fb-textPrimary shadow-sm">
            <X size={20} />
          </button>
        </div>
        <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
          {data.courses.length === 0 ? (
            <div className="py-16 text-center opacity-30">
              <p className="font-black uppercase text-[10px] tracking-widest italic">No classes scheduled for this date</p>
            </div>
          ) : (
            data.courses.map(c => (
              <div key={c.id} className="p-6 rounded-[2rem] bg-fb-gray/50 border border-fb-border hover:border-fb-blue/20 transition-all group hover:bg-white hover:shadow-xl hover:shadow-fb-blue/5">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="font-black text-fb-textPrimary uppercase italic tracking-tight text-lg leading-none break-words">{c.name}</h4>
                    <p className="text-[9px] font-black text-fb-blue uppercase tracking-widest opacity-60 break-all">Course Reference: {c.id}</p>
                  </div>
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shrink-0 self-start ${c.yearLevel === '1st Year' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                    {c.yearLevel}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                   <div className="flex items-center gap-3 text-xs font-bold text-fb-textSecondary">
                      <div className="p-2 bg-white rounded-xl shadow-sm"><Clock size={16} className="text-fb-blue" /></div>
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase opacity-40">Schedule</span>
                        <span>{c.startTime} - {c.endTime}</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-3 text-xs font-bold text-fb-textSecondary">
                      <div className="p-2 bg-white rounded-xl shadow-sm"><UserIcon size={16} className="text-fb-blue" /></div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[9px] uppercase opacity-40">Instructor</span>
                        <span className="italic capitalize break-words">{formatProfessorName(c.professor)}</span>
                      </div>
                   </div>
                </div>

                {/* Notes & Materials Download Section */}
                <div className="mt-4 pt-4 border-t border-fb-border/40 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-fb-blue italic">
                    <FileText size={12} />
                    <span>Shared Class Notes</span>
                  </div>
                  {notesLoading ? (
                    <div className="flex justify-center py-2"><RefreshCw className="animate-spin text-fb-blue" size={14} /></div>
                  ) : !courseNotes[c.id] || courseNotes[c.id].length === 0 ? (
                    <p className="text-[10px] font-semibold text-fb-textSecondary opacity-60 italic pl-1">No shared notes available for this course.</p>
                  ) : (
                    <div className="space-y-2">
                      {courseNotes[c.id].map(file => (
                        <div key={file.id} className="flex justify-between items-center bg-white p-3 rounded-2xl border border-fb-border/60 hover:border-fb-blue/20 hover:shadow-sm transition-all">
                          <span className="text-[11px] font-bold text-fb-textPrimary truncate max-w-[160px] md:max-w-[200px]" title={file.fileName}>{file.fileName}</span>
                          <a 
                            href="#"
                            onClick={(e) => { e.preventDefault(); downloadMaterial(file).catch((err) => toast.error("Download failed: " + err.message)); }}
                            className="flex items-center gap-1 py-2.5 px-3 min-h-9 bg-fb-blue hover:bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                          >
                            <Download size={10} />
                            <span>Download</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-fb-border/40 mt-4">
                  {c.isRecurring ? (
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-fb-blue uppercase tracking-widest italic bg-fb-blue/5 px-3 py-1.5 rounded-full border border-fb-blue/10">
                      <Repeat size={12} /> <span>{c.frequency}</span>
                    </div>
                  ) : <div />}
                  
                  {onEditCourse && (
                    <div className="flex flex-col items-center gap-1 group/btn">
                      <button 
                        onClick={() => { onClose(); onEditCourse(c); }}
                        className="p-2.5 bg-white text-fb-textSecondary hover:bg-fb-blue hover:text-white rounded-xl transition-all shadow-sm border border-fb-border"
                      >
                        <Edit2 size={16} />
                      </button>
                      <span className="text-[9px] font-black uppercase text-fb-textSecondary opacity-60">Edit</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-6 border-t bg-fb-gray/10 flex justify-end">
          <button onClick={onClose} className="px-12 py-4 bg-white hover:bg-fb-hover text-fb-textPrimary border-2 border-fb-border rounded-2xl font-black uppercase text-xs tracking-widest shadow-sm transition-all active:scale-95">Dismiss</button>
        </div>
      </div>
    </div>
  );
};
