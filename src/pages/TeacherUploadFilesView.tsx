import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Trash2,
  RotateCcw,
  Archive,
  Clock,
  Upload,
  Download,
  FileText,
} from 'lucide-react';

import { ConfirmModal } from '../components/modals/ConfirmModal';
import { deleteFile, downloadMaterial, fetchCourses, fetchFiles, setFileArchived, uploadFile } from '../lib/data';
import { live } from '../lib/live';
import { formatName } from '../lib/format';
import type { Course, UserProfile } from '../types';
import { toast } from '../lib/toast';

export const TeacherUploadFilesView = ({ profile }: { profile: UserProfile }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [category, setCategory] = useState<'notes' | 'exams' | 'activity'>('notes');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState<string>('');
  const [fileType, setFileType] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
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
    return live(fetchCourses, (all) => {
      const list: Course[] = all.filter((data) => data.instructorId === profile.uid || data.professor === formatName(profile));
      setCourses(list);
      setCoursesLoading(false);
      if (list.length > 0 && !selectedCourseId) {
        setSelectedCourseId(list[0].id);
      }
    });
  }, [profile.uid, selectedCourseId]);

  useEffect(() => {
    return live(() => fetchFiles({ mine: true }), (files) => {
      const list: any[] = [...files];
      list.sort((a, b) => {
        const t1 = a.createdAt?.seconds || 0;
        const t2 = b.createdAt?.seconds || 0;
        return t2 - t1;
      });
      setUploadedFiles(list);
    });
  }, [profile.uid]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (file.size > 800 * 1024) {
      setErrorMsg("File size must be under 800KB for secure portal storage.");
      return;
    }
    setFileName(file.name);
    setFileType(file.type);
    
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      if (uploadEvent.target?.result) {
        setFileData(uploadEvent.target.result as string);
      }
    };
    reader.onerror = () => {
      setErrorMsg("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedCourseId) {
      setErrorMsg("Please select a course.");
      return;
    }
    if (!fileData) {
      setErrorMsg("Please upload a file.");
      return;
    }
    if ((category === 'exams' || category === 'activity') && !eventDate) {
      setErrorMsg("Please specify the date for the activity or exam.");
      return;
    }

    setLoading(true);
    try {
      const newFilePayload: Parameters<typeof uploadFile>[0] = {
        courseId: selectedCourseId,
        category: category as 'notes' | 'exams' | 'activity',
        fileName,
        fileData,
        fileType,
      };

      if (category === 'exams' || category === 'activity') {
        newFilePayload.eventDate = eventDate;
        if (instructions.trim()) {
          newFilePayload.instructions = instructions.trim();
        }
      }

      await uploadFile(newFilePayload);
      setSuccessMsg(`File "${fileName}" successfully uploaded under category "${category === 'notes' ? 'Notes' : category === 'exams' ? 'Exam' : 'Activity'}".`);
      
      setFileName('');
      setFileData('');
      setFileType('');
      setEventDate('');
      setInstructions('');
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMsg("Failed to upload file to the database: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = (fileId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Archive File?",
      message: `Are you sure you want to archive "${name}"? This will move it to the archive folder.`,
      confirmText: "Archive",
      variant: 'warning',
      onConfirm: async () => {
        try {
          await setFileArchived(fileId, true);
          setSuccessMsg(`File "${name}" has been successfully moved to the archive folder.`);
        } catch (err: any) {
          console.error("Archive error:", err);
          setErrorMsg("Failed to archive file: " + err.message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleRestore = (fileId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Restore File?",
      message: `Are you sure you want to restore "${name}" from the archive folder?`,
      confirmText: "Restore",
      variant: 'info',
      onConfirm: async () => {
        try {
          await setFileArchived(fileId, false);
          setSuccessMsg(`File "${name}" has been restored to active list.`);
        } catch (err: any) {
          console.error("Restore error:", err);
          setErrorMsg("Failed to restore file: " + err.message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handlePermanentDelete = (fileId: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Permanently Delete?",
      message: `Are you sure you want to PERMANENTLY delete "${name}" from the database? This action cannot be undone.`,
      confirmText: "Delete",
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteFile(fileId);
          setSuccessMsg(`File "${name}" has been permanently deleted from the database.`);
        } catch (err: any) {
          console.error("Delete error:", err);
          setErrorMsg("Failed to permanently delete file: " + err.message);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const displayedFiles = useMemo(() => {
    return uploadedFiles.filter(file => isViewTrash ? !!file.archived : !file.archived);
  }, [uploadedFiles, isViewTrash]);

  return (
    <div className="space-y-10 pb-10">
      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-fb-blue italic mb-1">Teacher Portal</h3>
        <h2 className="text-3xl font-black text-fb-textPrimary uppercase italic tracking-tighter">Upload Course Files</h2>
        <p className="text-fb-textSecondary text-sm font-medium">Upload notes for students, or activities and exams for administrative notification.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-[2.5rem] border border-fb-border shadow-xl space-y-6">
          <h3 className="text-lg font-black text-fb-textPrimary uppercase italic tracking-tight">New Upload</h3>
          {errorMsg && <div className="p-4 bg-rose-50 text-rose-700 rounded-2xl text-xs font-bold border border-rose-100">{errorMsg}</div>}
          {successMsg && <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl text-xs font-bold border border-emerald-100">{successMsg}</div>}

          {coursesLoading ? (
            <div className="py-10 text-center"><RefreshCw className="animate-spin text-fb-blue mx-auto" size={24} /></div>
          ) : courses.length === 0 ? (
            <div className="p-4 bg-amber-50 text-amber-700 rounded-2xl text-xs font-bold border border-amber-100">
              You are not assigned as an instructor to any active courses. You must be assigned to a course to upload files.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Assigned Course</label>
                <select 
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full px-4 py-3 border border-fb-border rounded-xl focus:border-fb-blue bg-fb-gray/30 text-sm font-semibold outline-none transition-all"
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.yearLevel})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['notes', 'exams', 'activity'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat);
                        setErrorMsg(null);
                      }}
                      className={`py-2 px-3 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${category === cat ? 'bg-fb-blue text-white border-fb-blue shadow-md' : 'bg-white hover:bg-fb-gray border-fb-border text-fb-textSecondary'}`}
                    >
                      {cat === 'notes' ? 'Notes' : cat === 'exams' ? 'Exam' : 'Activity'}
                    </button>
                  ))}
                </div>
              </div>

              {(category === 'exams' || category === 'activity') && (
                <div className="space-y-4 animate-in slide-in-from-top duration-200">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Event Date</label>
                    <input 
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full px-4 py-3 border border-fb-border rounded-xl focus:border-fb-blue bg-fb-gray/30 text-sm font-semibold outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Instructions / Notes (Optional)</label>
                    <textarea 
                      placeholder="Enter specific instructions or notes for students/administrators..."
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-fb-border rounded-xl focus:border-fb-blue bg-fb-gray/30 text-xs font-semibold outline-none transition-all resize-none custom-scrollbar"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-fb-textSecondary ml-1">Upload File</label>
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${dragActive ? 'border-fb-blue bg-fb-blue/5' : 'border-fb-border hover:border-fb-blue/40 bg-fb-gray/10'}`}
                  onClick={() => document.getElementById('file-upload-input')?.click()}
                >
                  <input 
                    id="file-upload-input"
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex flex-col items-center space-y-2">
                    <div className="p-3 bg-white rounded-full border border-fb-border shadow-sm text-fb-blue">
                      <Upload size={20} />
                    </div>
                    {fileName ? (
                      <div className="space-y-1 max-w-full">
                        <p className="text-xs font-bold text-fb-textPrimary truncate">{fileName}</p>
                        <p className="text-[8px] font-black uppercase text-fb-blue">Click or drag to replace</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-fb-textPrimary">Drag & drop files here</p>
                        <p className="text-[9px] font-black text-fb-textSecondary uppercase opacity-60">or click to browse</p>
                        <p className="text-[8px] text-fb-textSecondary opacity-40">Max 800KB</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !fileData}
                className="w-full py-4 bg-fb-blue text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                <span>{loading ? 'Uploading...' : 'Submit Document'}</span>
              </button>
            </form>
          )}
        </div>

        <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-fb-border shadow-xl space-y-6 flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-lg font-black text-fb-textPrimary uppercase italic tracking-tight">
              {isViewTrash ? 'Archived Materials' : 'Your Uploaded Materials'}
            </h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsViewTrash(!isViewTrash)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 border ${
                  isViewTrash 
                    ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm' 
                    : 'bg-white text-fb-textSecondary hover:bg-fb-gray border-fb-border'
                }`}
              >
                <Archive size={12} />
                <span>{isViewTrash ? 'Active Files' : 'Archive Folder'}</span>
              </button>
              <span className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-fb-gray border border-fb-border text-fb-textSecondary shadow-sm">
                {displayedFiles.length} {isViewTrash ? 'Archived' : 'Active'}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[500px] space-y-4 pr-1">
            {displayedFiles.length === 0 ? (
              <div className="py-24 text-center text-fb-textSecondary/40 flex flex-col items-center justify-center space-y-3">
                <FileText size={48} className="stroke-[1.5]" />
                <p className="font-black uppercase text-[10px] tracking-widest italic">
                  {isViewTrash ? 'Archive Folder is Empty' : 'No files uploaded yet'}
                </p>
              </div>
            ) : (
              displayedFiles.map(file => (
                <div key={file.id} className="p-5 rounded-2xl bg-fb-gray/30 border border-fb-border/60 hover:bg-white hover:shadow-lg transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1 min-w-0 flex-1 md:max-w-md">
                    <div className="flex items-center gap-2 min-w-0 w-full">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 ${file.category === 'notes' ? 'bg-blue-50 text-blue-600 border border-blue-100' : file.category === 'exams' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                        {file.category === 'notes' ? 'Notes' : file.category === 'exams' ? 'Exam' : 'Activity'}
                      </span>
                      <span className="text-[10px] font-black text-fb-textSecondary truncate min-w-0 flex-1">{file.courseName}</span>
                    </div>
                    <h4 className="font-bold text-fb-textPrimary text-sm break-all whitespace-normal">{file.fileName}</h4>
                    <p className="text-[9px] text-fb-textSecondary/60 font-semibold">
                      Uploaded on: {file.createdAt ? new Date(file.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </p>
                    {(file.category === 'exams' || file.category === 'activity') && (
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center gap-1.5 text-sm font-black text-fb-blue uppercase tracking-wider bg-fb-blue/5 px-3 py-1.5 rounded-full border border-fb-blue/10 w-fit">
                          <Clock size={14} /> <span>Event: {file.eventDate}{file.eventTime ? ` @ ${file.eventTime}` : ''}</span>
                        </div>
                        {file.instructions && (
                          <div className="text-sm text-fb-textSecondary bg-white/70 p-3 rounded-xl border border-fb-border/40 italic font-medium whitespace-pre-wrap max-w-sm md:max-w-md">
                            <span className="text-[10px] font-black uppercase tracking-wider block text-fb-blue not-italic mb-1">Instructions:</span>
                            {file.instructions}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <a 
                      href="#"
                      onClick={(e) => { e.preventDefault(); downloadMaterial(file).catch((err) => toast.error("Download failed: " + err.message)); }}
                      className="p-2.5 bg-white text-fb-blue hover:bg-fb-blue hover:text-white rounded-xl border border-fb-border transition-all shadow-sm flex items-center justify-center"
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                    {!isViewTrash ? (
                      <button 
                        onClick={() => handleArchive(file.id, file.fileName)}
                        className="p-2.5 bg-white text-amber-600 hover:bg-amber-50 rounded-xl border border-fb-border hover:border-amber-200 transition-all shadow-sm flex items-center justify-center"
                        title="Archive"
                      >
                        <Archive size={14} />
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleRestore(file.id, file.fileName)}
                          className="p-2.5 bg-white text-emerald-600 hover:bg-emerald-50 rounded-xl border border-fb-border hover:border-emerald-200 transition-all shadow-sm flex items-center justify-center"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button 
                          onClick={() => handlePermanentDelete(file.id, file.fileName)}
                          className="p-2.5 bg-white text-rose-600 hover:bg-rose-50 rounded-xl border border-fb-border hover:border-rose-200 transition-all shadow-sm flex items-center justify-center"
                          title="Permanently Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
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
