import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Trash2,
  RotateCcw,
  Archive,
  Clock,
  Download,
  FileText,
  Bell,
} from 'lucide-react';
import {
  doc,
  updateDoc,
  collection,
  onSnapshot,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';

import { ActsLogo } from '../components/ActsLogo';
import { ConfirmModal } from '../components/modals/ConfirmModal';
import { db } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';
import { formatName } from '../lib/format';
import type { UserProfile } from '../types';

export const StudentDashboard = ({ profile }: { profile: UserProfile | null }) => {
  const isAdminOrExec = profile?.role === 'admin' || profile?.role === 'president' || profile?.role === 'vice president';
  
  if (!isAdminOrExec) {
    return (
      <div className="space-y-8 text-center flex flex-col items-center justify-center min-h-[50vh]">
        <ActsLogo className="w-32 h-32 mb-6 animate-pulse" />
        <h2 className="text-4xl md:text-5xl font-black text-fb-textPrimary tracking-tighter italic uppercase leading-none">Welcome to the <br />ACTS Portal</h2>
        <p className="text-fb-textSecondary font-semibold text-lg max-w-xl leading-relaxed mt-4">Signed in as: <span className="text-fb-blue">{formatName(profile)} ({profile?.role})</span></p>
      </div>
    );
  }

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'exams' | 'activity'>('all');
  const [isViewTrash, setIsViewTrash] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    variant: 'info',
    onConfirm: () => {}
  });

  useEffect(() => {
    const q = query(collection(db, "uploaded_files"), where("category", "in", ["exams", "activity"]));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({ ...data, id: docSnap.id });
      });
      list.sort((a, b) => {
        const t1 = a.createdAt?.seconds || 0;
        const t2 = b.createdAt?.seconds || 0;
        return t2 - t1;
      });
      setSubmissions(list);
      setLoading(false);
    }, (error) => {
      console.error("Error loading submissions for admin dashboard:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, "uploaded_files");
    });

    return () => unsub();
  }, []);

  const filteredSubmissions = submissions.filter(item => {
    const matchesArchive = isViewTrash ? !!item.archived : !item.archived;
    if (!matchesArchive) return false;

    const matchesSearch = 
      item.courseName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.teacherName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.fileName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const handleArchiveFile = (fileId: string, fileName: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Submission?",
      message: `Are you sure you want to archive "${fileName}"? This will remove it from active submissions and move it to the archive folder.`,
      confirmText: "Archive",
      variant: 'warning',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "uploaded_files", fileId), { archived: true });
        } catch (error) {
          console.error("Error archiving file:", error);
          alert("Failed to archive the file: " + (error as any).message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleRestoreFile = (fileId: string, fileName: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Restore Submission?",
      message: `Are you sure you want to restore "${fileName}" to the active dashboard list?`,
      confirmText: "Restore",
      variant: 'info',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "uploaded_files", fileId), { archived: false });
        } catch (error) {
          console.error("Error restoring file:", error);
          alert("Failed to restore the file: " + (error as any).message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handlePermanentDeleteFile = (fileId: string, fileName: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Permanently Delete?",
      message: `Are you sure you want to PERMANENTLY delete "${fileName}"? This action cannot be undone and will delete it completely.`,
      confirmText: "Delete",
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "uploaded_files", fileId));
        } catch (error) {
          console.error("Error permanently deleting file:", error);
          alert("Failed to permanently delete the file: " + (error as any).message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      {/* Hero Welcome Card */}
      <div className="p-8 md:p-10 rounded-[2.5rem] bg-gradient-to-br from-fb-blue via-blue-600 to-indigo-700 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="space-y-3 max-w-xl text-center md:text-left z-10">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200 italic">Administrative Dashboard</h3>
          <h2 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter leading-none">Welcome back, <br />{formatName(profile)}</h2>
          <p className="text-blue-100/80 text-sm font-semibold max-w-md leading-relaxed">
            Monitor educational operations, class notes publication, and upcoming academic events uploaded by instructors.
          </p>
        </div>
        <div className="p-4 bg-white/10 backdrop-blur-md rounded-[2rem] border border-white/10 z-10 animate-pulse">
          <ActsLogo className="w-24 h-24 stroke-white filter brightness-0 invert" />
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full filter blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/20 rounded-full filter blur-3xl -ml-20 -mb-20 pointer-events-none" />
      </div>

      {/* Notifications and Submissions Section */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-fb-border shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-rose-50 text-rose-500 rounded-lg"><Bell size={16} className="animate-bounce" /></div>
              <h3 className="text-lg font-black text-fb-textPrimary uppercase italic tracking-tight">
                {isViewTrash ? 'Archived Event Submissions' : 'Academic Event Submissions'}
              </h3>
            </div>
            <p className="text-fb-textSecondary text-xs font-semibold">
              {isViewTrash ? 'All archived activities and exams submitted by instructors.' : 'Real-time notifications of tests, exams, and activities scheduled by course teachers.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setIsViewTrash(!isViewTrash)}
              className={`px-3.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 border ${
                isViewTrash 
                  ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm' 
                  : 'bg-white text-fb-textSecondary hover:bg-fb-gray border-fb-border'
              }`}
            >
              <Archive size={12} />
              <span>{isViewTrash ? 'Active Submissions' : 'Archive Folder'}</span>
            </button>

            <div className="flex bg-fb-gray p-1 rounded-xl border border-fb-border">
              {(['all', 'exams', 'activity'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${categoryFilter === cat ? 'bg-white text-fb-blue shadow-sm' : 'text-fb-textSecondary hover:text-fb-textPrimary'}`}
                >
                  {cat === 'all' ? 'All' : cat === 'exams' ? 'Exams' : 'Activities'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search and stats bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3">
            <input 
              type="text"
              placeholder="Search by course, teacher, or file name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-5 py-3.5 border border-fb-border rounded-2xl focus:border-fb-blue bg-fb-gray/30 text-sm font-semibold outline-none transition-all shadow-inner"
            />
          </div>
          <div className="bg-fb-gray/30 px-5 py-3.5 rounded-2xl border border-fb-border/60 flex items-center justify-between text-fb-textSecondary">
            <span className="text-[10px] font-black uppercase tracking-wider">Filtered:</span>
            <span className="font-mono text-xs font-black text-fb-blue">{filteredSubmissions.length} of {submissions.length}</span>
          </div>
        </div>

        {/* Notification feed */}
        {loading ? (
          <div className="py-24 text-center"><RefreshCw className="animate-spin text-fb-blue mx-auto" size={32} /></div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="py-24 text-center text-fb-textSecondary/40 flex flex-col items-center justify-center space-y-3">
            <FileText size={56} className="stroke-[1.2] text-fb-textSecondary/20" />
            <p className="font-black uppercase text-xs tracking-widest italic">No events or activities found</p>
            <p className="text-[10px] font-medium max-w-xs leading-normal">When teachers upload activities or exams, they will appear here as notifications immediately.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredSubmissions.map(item => (
              <div key={item.id} className="p-6 rounded-[2rem] bg-fb-gray/30 border border-fb-border/60 hover:bg-white hover:shadow-2xl hover:shadow-fb-blue/5 transition-all group flex flex-col justify-between relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.category === 'exams' ? 'bg-rose-500' : 'bg-amber-500'}`} />

                <div className="space-y-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-fb-textSecondary/80 uppercase tracking-wider">{item.courseName}</span>
                      <h4 className="font-black text-fb-textPrimary capitalize italic tracking-tight text-lg leading-tight group-hover:text-fb-blue transition-colors">{item.fileName}</h4>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${item.category === 'exams' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {item.category === 'exams' ? 'Exam' : 'Activity'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-white/50 p-3 rounded-xl border border-fb-border/40 text-xs font-bold text-fb-textSecondary">
                    <div>
                      <span className="text-[8px] uppercase opacity-40 block">Instructor</span>
                      <span className="truncate italic text-fb-textPrimary">{item.teacherName}</span>
                    </div>
                    <div>
                      <span className="text-[8px] uppercase opacity-40 block">Submitted</span>
                      <span className="truncate font-mono text-[10px] text-fb-textPrimary">{item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-fb-blue/5 border border-fb-blue/10 rounded-xl p-3 text-fb-blue">
                    <Clock size={16} className="shrink-0" />
                    <div className="text-xs">
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Scheduled Date</p>
                      <p className="font-bold">{item.eventDate}{item.eventTime ? ` at ${item.eventTime}` : ''}</p>
                    </div>
                  </div>

                  {item.instructions && (
                    <div className="bg-white/60 p-3.5 rounded-xl border border-fb-border/40 text-xs font-semibold text-fb-textSecondary animate-in fade-in duration-200">
                      <span className="text-[8px] font-black uppercase tracking-widest block text-fb-blue mb-1">Instructions / Notes</span>
                      <p className="italic whitespace-pre-wrap leading-relaxed">{item.instructions}</p>
                    </div>
                  )}
                </div>

                 <div className="mt-5 pt-4 border-t border-fb-border/40 flex justify-between items-center gap-2">
                  <span className="text-[9px] text-fb-textSecondary/60 font-semibold truncate max-w-[120px]">ID: {item.id}</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={item.fileData}
                      download={item.fileName}
                      className="flex items-center gap-1.5 py-2 px-3.5 bg-fb-blue hover:bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer"
                    >
                      <Download size={11} />
                      <span>Download</span>
                    </a>
                    {!isViewTrash ? (
                      <button
                        onClick={() => handleArchiveFile(item.id, item.fileName)}
                        className="flex items-center gap-1.5 py-2 px-3.5 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 text-amber-700 border border-amber-200/80 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        <Archive size={11} className="transition-transform group-hover:rotate-12" />
                        <span>Archive</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRestoreFile(item.id, item.fileName)}
                          className="flex items-center gap-1.5 py-2 px-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <RotateCcw size={11} />
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => handlePermanentDeleteFile(item.id, item.fileName)}
                          className="flex items-center gap-1.5 py-2 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Trash2 size={11} />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
