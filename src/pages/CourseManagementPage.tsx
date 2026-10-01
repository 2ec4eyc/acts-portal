import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle,
  RefreshCw,
  X,
  Edit2,
  ChevronDown,
  Repeat,
  List,
  RotateCcw,
  Archive,
  Clock,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Database,
  BookOpen,
  Copy,
} from 'lucide-react';

import { Card } from '../components/Card';
import { CourseCalendar } from '../components/CourseCalendar';
import { FormField } from '../components/FormField';
import { CalendarDayModal } from '../components/modals/CalendarDayModal';
import { PermissionDeniedGate } from '../components/PermissionDeniedGate';
import { ApiError } from '../lib/api';
import { archiveCourses, fetchCourses, fetchUsers, restoreCourses, saveCourse } from '../lib/data';
import { live } from '../lib/live';
import { formatName } from '../lib/format';
import type { Course, UserProfile } from '../types';
import { toast } from '../lib/toast';

export const CourseManagementPage = ({ profile }: { profile: UserProfile | null }) => {
  const [courses, setCourses] = useState([] as Course[]);
  const [trashedCourses, setTrashedCourses] = useState([] as Course[]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isViewTrash, setIsViewTrash] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list' as 'list' | 'calendar');
  const [yearLevelFilter, setYearLevelFilter] = useState('All' as 'All' | '1st Year' | '2nd Year');
  const [semesterFilter, setSemesterFilter] = useState('All' as 'All' | '1st Semester' | '2nd Semester' | '3rd Semester');
  const [schoolYearFilter, setSchoolYearFilter] = useState('All');
  const [permissionError, setPermissionError] = useState(false);
  const [trashPermissionError, setTrashPermissionError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedToRestore, setSelectedToRestore] = useState([] as string[]);
  const [selectedToArchive, setSelectedToArchive] = useState([] as string[]);
  const [sortOrder, setSortOrder] = useState('none' as 'none' | 'asc' | 'desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  
  const [dayDetailData, setDayDetailData] = useState(null as { date: string, courses: Course[] } | null);
  const [teachers, setTeachers] = useState([] as UserProfile[]);
  
  const initialFormState: Partial<Course> = { 
    name: '', professor: '', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '10:30', isRecurring: false, frequency: 'Weekly', daysOfWeek: [], yearLevel: '1st Year', semester: '1st Semester', status: 'active', schoolYear: '', units: 3 
  };
  const [formData, setFormData] = useState(initialFormState);

  const profileUid = profile?.uid;
  const profileRole = profile?.role;

  useEffect(() => {
    if (!profileUid) return;

    const stopActive = live(fetchCourses, (list) => {
      setCourses(list);
      setPermissionError(false);
    }, (error) => {
      if (error instanceof ApiError && error.status === 403) {
        console.warn("Permission denied for active course registry.");
        setPermissionError(true);
      }
    });

    const stopTeachers = live(() => fetchUsers({ role: 'teacher' }), setTeachers);
    let stopTrash = () => {};
    if (profileRole === 'admin') {
      stopTrash = live(async () => (await fetchCourses({ includeArchived: true })).filter((c) => c.status === 'archived'), (list) => {
        setTrashedCourses(list);
        setTrashPermissionError(false);
      }, (error) => {
        if (error instanceof ApiError && error.status === 403) setTrashPermissionError(true);
      });
    }

    return () => { stopActive(); stopTrash(); stopTeachers(); };
  }, [profileUid, profileRole]);

  const handleBatchRestore = async () => {
    if (selectedToRestore.length === 0) return;
    setIsProcessing(true);
    try {
      await restoreCourses(selectedToRestore);
      setSelectedToRestore([]);
      toast.success("Selected courses restored to Academic Registry.");
    } catch (err: any) {
      toast.error("Batch restore failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchArchive = async () => {
    if (selectedToArchive.length === 0) return;
    setIsProcessing(true);
    try {
      await archiveCourses(selectedToArchive);
      setSelectedToArchive([]);
      toast.success("Selected courses moved to Archive.");
    } catch (err: any) {
      toast.error("Batch archive failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Saving a course enrolls matching students on the server.

  const handleDuplicate = (course: Course) => {
    const { id, createdAt, archivedAt, archivedBy, ...cleanData } = course as any;
    setFormData({
      ...cleanData,
      name: `${cleanData.name} (Copy)`,
      status: 'active'
    });
    setEditingId(null);
    setIsAdding(true);
  };

  const toggleRestoreSelection = (id: string) => {
    setSelectedToRestore(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleArchiveSelection = (id: string) => {
    setSelectedToArchive(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSort = () => {
    setSortOrder(prev => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const dataToSave = { ...formData, status: formData.status || 'active' };
      delete (dataToSave as any).id;
      await saveCourse(dataToSave, editingId || undefined);
      
      setIsAdding(false); setEditingId(null); setFormData(initialFormState);
      toast.success("Records successfully published and synced to students.");
    } catch (err: any) { toast.error(err.message); }
    finally { setIsProcessing(false); }
  };

  const toggleDayOfWeek = (day: string) => {
    setFormData(prev => {
      const current = prev.daysOfWeek || [];
      let updated;
      if (prev.frequency === 'Daily') {
          updated = [day];
      } else {
          updated = current.includes(day) 
            ? current.filter(d => d !== day) 
            : [...current, day];
      }
      return { ...prev, daysOfWeek: updated };
    });
  };

  if (permissionError) return <PermissionDeniedGate message="Insufficient permissions to load course database" />;

  const listToDisplay = isViewTrash ? trashedCourses : courses;
  
  const filtered = listToDisplay.filter(c => {
    const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = yearLevelFilter === 'All' || c.yearLevel === yearLevelFilter;
    const matchesSemester = semesterFilter === 'All' || c.semester === semesterFilter;
    const matchesSchoolYear = schoolYearFilter === 'All' || c.schoolYear === schoolYearFilter;
    const isNotArchived = isViewTrash || c.status !== 'archived'; 
    return matchesSearch && matchesYear && matchesSemester && matchesSchoolYear && isNotArchived;
  });

  const sorted = useMemo(() => {
    let result = [...filtered];
    if (sortOrder !== 'none') {
      result.sort((a, b) => {
        const valA = (a.name || '').toLowerCase();
        const valB = (b.name || '').toLowerCase();
        if (sortOrder === 'asc') return valA.localeCompare(valB);
        return valB.localeCompare(valA);
      });
    }
    return result;
  }, [filtered, sortOrder]);

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginatedItems = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, yearLevelFilter, semesterFilter, schoolYearFilter, isViewTrash]);

  const uniqueSchoolYears = useMemo(() => {
    const years = new Set<string>();
    courses.forEach(c => { if (c.schoolYear) years.add(c.schoolYear); });
    trashedCourses.forEach(c => { if (c.schoolYear) years.add(c.schoolYear); });
    return Array.from(years).sort().reverse();
  }, [courses, trashedCourses]);

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  return (
    <div className="space-y-8 pb-10">
      <Card noPadding>
        <div className="p-3 md:p-4 lg:p-5 flex flex-col md:flex-row gap-3 md:gap-4 border-b border-fb-border items-start">
          {/* Search Box - Proportionally adjusted */}
          <div className="w-full md:w-[25%] relative">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={14} />
            <input 
              type="text" 
              placeholder={isViewTrash ? "Search archived..." : "Search catalog..."}
              className="w-full h-full bg-fb-gray border border-transparent rounded-full pl-9 md:pl-10 pr-9 md:pr-10 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[10px] md:text-xs font-semibold transition-all" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white rounded-full text-fb-textSecondary transition-all"
              >
                <X size={12} />
              </button>
            )}
          </div>
          
          {/* Year Level Filter - Proportionally adjusted */}
          <div className="w-full md:w-[12%] relative">
            <select 
              value={yearLevelFilter} 
              onChange={(e) => setYearLevelFilter(e.target.value as any)}
              className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer"
            >
              <option value="All">All Years</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
            </select>
          </div>

          {/* Semester Filter - New Control Added here */}
          <div className="w-full md:w-[12%] relative">
            <select 
              value={semesterFilter} 
              onChange={(e) => setSemesterFilter(e.target.value as any)}
              className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer"
            >
              <option value="All">All Semesters</option>
              <option value="1st Semester">1st Sem</option>
              <option value="2nd Semester">2nd Sem</option>
              <option value="3rd Semester">3rd Sem</option>
            </select>
          </div>

          {/* School Year Filter */}
          <div className="w-full md:w-[12%] relative">
            <select 
              value={schoolYearFilter} 
              onChange={(e) => setSchoolYearFilter(e.target.value)}
              className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer"
            >
              <option value="All">All SY</option>
              {uniqueSchoolYears.map(sy => (
                <option key={sy} value={sy}>{sy}</option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle - Proportionally adjusted */}
          <div className="w-full md:w-[12%]">
            <div className="flex bg-fb-gray p-1 rounded-full border border-transparent shadow-sm">
              <button 
                onClick={() => setViewMode('list')}
                className={`flex-1 flex justify-center py-1.5 md:py-2 rounded-full transition-all ${viewMode === 'list' ? 'bg-white text-fb-blue shadow-md' : 'text-fb-textSecondary hover:bg-fb-hover'}`}
              >
                <List size={14} />
              </button>
              <button 
                onClick={() => setViewMode('calendar')}
                className={`flex-1 flex justify-center py-1.5 md:py-2 rounded-full transition-all ${viewMode === 'calendar' ? 'bg-white text-fb-blue shadow-md' : 'text-fb-textSecondary hover:bg-fb-hover'}`}
              >
                <CalendarIcon size={14} />
              </button>
            </div>
          </div>

          {/* Registry/Archive Toggle - Proportionally adjusted */}
          <button 
            onClick={() => { setIsViewTrash(!isViewTrash); setSearchTerm(''); setSchoolYearFilter('All'); setSelectedToRestore([]); setSelectedToArchive([]); }} 
            className={`w-full md:w-[12%] py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-sm transition-all flex items-center justify-center gap-2 border ${isViewTrash ? 'bg-fb-textPrimary text-white' : 'bg-white text-fb-textSecondary hover:bg-fb-hover'}`}
          >
            {isViewTrash ? <Database size={14} /> : <Archive size={14} />}
            <span>{isViewTrash ? "Registry" : "Archive"}</span>
          </button>

          {/* Actions Column - Proportionally adjusted */}
          <div className="w-full md:w-[12%] flex flex-col gap-2">
            <button onClick={() => { setFormData(initialFormState); setIsAdding(true); }} className="w-full bg-fb-blue text-white py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-2 active:scale-95">
              <Plus size={14} /><span>New Entry</span>
            </button>
            
            {isViewTrash ? (
              selectedToRestore.length > 0 && (
                <button 
                  onClick={handleBatchRestore}
                  disabled={isProcessing}
                  className="w-full bg-emerald-500 text-white py-1 md:py-1.5 rounded-full font-black text-[8px] md:text-[9px] uppercase shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
                >
                  {isProcessing ? <RefreshCw className="animate-spin" size={12}/> : <RotateCcw size={12}/>}
                  <span>Restore ({selectedToRestore.length})</span>
                </button>
              )
            ) : (
              selectedToArchive.length > 0 && (
                <button 
                  onClick={handleBatchArchive}
                  disabled={isProcessing}
                  className="w-full bg-red-600 text-white py-1 md:py-1.5 rounded-full font-black text-[8px] md:text-[9px] uppercase shadow-md hover:bg-red-700 transition-all flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
                >
                  {isProcessing ? <RefreshCw className="animate-spin" size={12}/> : <Archive size={12}/>}
                  <span>Archive ({selectedToArchive.length})</span>
                </button>
              )
            )}
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="p-4 md:p-10">
            <CourseCalendar 
              courses={filtered} 
              onDayClick={(date, dayCourses) => setDayDetailData({ date, courses: dayCourses })} 
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-fb-gray/50 border-b text-[10px] font-black uppercase tracking-widest text-fb-textSecondary">
                  <tr>
                    <th className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <span>Course</span>
                        <button onClick={toggleSort} className={`p-1 rounded transition-all ${sortOrder !== 'none' ? 'text-fb-blue' : 'hover:bg-fb-gray'}`}>
                          {sortOrder === 'none' ? <ArrowUpDown size={12}/> : sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                        </button>
                      </div>
                    </th>
                    <th className="px-8 py-5">{isViewTrash ? "Archive Date" : "Instructor"}</th>
                    <th className="px-8 py-5">Schedule</th>
                    <th className="px-8 py-5 text-center">Year / Term</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedItems.map(c => (
                    <tr key={c.id} className={`hover:bg-fb-hover transition-all ${isViewTrash ? 'hover:bg-rose-50/30' : ''}`}>
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-fb-textPrimary capitalize italic leading-none">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        {isViewTrash ? (
                          <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">
                            {c.archivedAt ? new Date(c.archivedAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-fb-textSecondary capitalize italic">{c.professor}</span>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-fb-textPrimary font-bold text-xs uppercase">
                            <Clock size={12} className="text-fb-blue" />
                            {c.startTime} - {c.endTime}
                          </div>
                          {c.isRecurring ? (
                            <div className="flex flex-wrap gap-1">
                              {c.daysOfWeek?.map(day => (
                                <span key={day} className="text-[8px] font-black text-fb-blue bg-fb-blue/5 px-1.5 py-0.5 rounded border border-fb-blue/10">{day}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">{c.date}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <span className="px-4 py-1.5 bg-fb-gray rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-sm">{c.yearLevel}</span>
                          <span className="text-[8px] font-black text-fb-textSecondary uppercase opacity-60">{c.semester}</span>
                          {c.schoolYear && <span className="text-[8px] font-black text-fb-blue uppercase opacity-80">SY {c.schoolYear}</span>}
                          {c.units !== undefined && <span className="text-[8px] font-black text-fb-textSecondary uppercase opacity-60">{c.units} {c.units === 1 ? 'unit' : 'units'}</span>}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center justify-end gap-3">
                          {isViewTrash ? (
                            <div className="flex flex-col items-center gap-1 group">
                                <div className="p-2 md:p-2.5">
                                  <input 
                                    type="checkbox" 
                                    checked={selectedToRestore.includes(c.id)}
                                    onChange={() => toggleRestoreSelection(c.id)}
                                    className="w-3.5 h-3.5 md:w-4 md:h-4 rounded border-fb-border text-fb-blue focus:ring-fb-blue cursor-pointer"
                                  />
                                </div>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60">Restore</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-col items-center gap-1 group">
                                <button 
                                  onClick={() => handleDuplicate(c)}
                                  disabled={isProcessing}
                                  className="p-2 md:p-2.5 text-fb-textSecondary hover:bg-emerald-500 hover:text-white rounded-xl transition-all shadow-sm border border-fb-border disabled:opacity-50"
                                >
                                  <Copy size={14} />
                                </button>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60 group-hover:text-emerald-500">Duplicate</span>
                              </div>
                              <div className="flex flex-col items-center gap-1 group">
                                <button 
                                  onClick={() => { setEditingId(c.id); setFormData(c); setIsAdding(true); }}
                                  className="p-2 md:p-2.5 text-fb-textSecondary hover:bg-fb-blue hover:text-white rounded-xl transition-all shadow-sm border border-fb-border"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60 group-hover:text-fb-blue">Edit</span>
                              </div>
                              <div className="flex flex-col items-center gap-1 group">
                                <div className="p-2 md:p-2.5">
                                  <input 
                                    type="checkbox" 
                                    checked={selectedToArchive.includes(c.id)}
                                    onChange={() => toggleArchiveSelection(c.id)}
                                    className="w-3.5 h-3.5 md:w-4 md:h-4 rounded border-fb-border text-fb-blue focus:ring-fb-blue cursor-pointer"
                                  />
                                </div>
                                <span className="text-[8px] font-black uppercase text-fb-textSecondary opacity-60 group-hover:text-fb-blue">Archive</span>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-24 text-center opacity-30">
                        <div className="flex flex-col items-center">
                          <Layers size={48} className="mb-4" />
                          <p className="font-black uppercase text-[10px] tracking-widest italic">{isViewTrash ? 'No Archived Records Found' : 'No Active Records Found'}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile List View */}
            <div className="md:hidden flex flex-col divide-y">
              {paginatedItems.map(c => (
                <div key={c.id} className={`p-4 flex flex-col gap-3 ${isViewTrash ? 'bg-rose-50/10' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="font-black text-sm text-fb-textPrimary capitalize italic leading-tight">{c.name}</span>
                      <span className="text-xs font-bold text-fb-textSecondary capitalize italic mt-1">{c.professor}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-3 py-1 bg-fb-gray rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-sm">{c.yearLevel}</span>
                      <span className="text-[8px] font-black text-fb-textSecondary uppercase opacity-60">{c.semester}</span>
                      {c.schoolYear && <span className="text-[8px] font-black text-fb-blue uppercase opacity-80">SY {c.schoolYear}</span>}
                          {c.units !== undefined && <span className="text-[8px] font-black text-fb-textSecondary uppercase opacity-60">{c.units} {c.units === 1 ? 'unit' : 'units'}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-bold text-fb-textSecondary">
                    <div className="flex items-center gap-1.5">
                      <Clock size={12} className="text-fb-blue" />
                      {c.startTime} - {c.endTime}
                    </div>
                    {c.isRecurring ? (
                      <div className="flex flex-wrap gap-1">
                        {c.daysOfWeek?.map(day => (
                          <span key={day} className="text-[8px] font-black text-fb-blue bg-fb-blue/5 px-1.5 py-0.5 rounded border border-fb-blue/10">{day}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">{c.date}</span>
                    )}
                  </div>

                  {isViewTrash && (
                    <div className="text-[10px] font-bold text-fb-textSecondary uppercase italic">
                      Archived: {c.archivedAt ? new Date(c.archivedAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-dashed border-fb-border/50">
                    {isViewTrash ? (
                      <label className="flex items-center gap-2 px-2.5 py-1 bg-fb-gray rounded-lg cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedToRestore.includes(c.id)}
                          onChange={() => toggleRestoreSelection(c.id)}
                          className="w-3 h-3 rounded border-fb-border text-fb-blue focus:ring-fb-blue"
                        />
                        <span className="text-[9px] md:text-[10px] font-bold text-fb-textSecondary uppercase">Restore</span>
                      </label>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleDuplicate(c)} 
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-fb-gray rounded-lg text-[9px] md:text-[10px] font-bold text-fb-textSecondary uppercase disabled:opacity-50"
                        >
                          <Copy size={10} /> Duplicate
                        </button>
                        <button onClick={() => { setEditingId(c.id!); setFormData(c); setIsAdding(true); }} className="flex items-center gap-1.5 px-2.5 py-1 bg-fb-gray rounded-lg text-[9px] md:text-[10px] font-bold text-fb-textSecondary uppercase">
                          <Edit2 size={10} /> Edit
                        </button>
                        <label className="flex items-center gap-2 px-2.5 py-1 bg-fb-gray rounded-lg cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={selectedToArchive.includes(c.id!)}
                            onChange={() => toggleArchiveSelection(c.id!)}
                            className="w-3 h-3 rounded border-fb-border text-fb-blue focus:ring-fb-blue"
                          />
                          <span className="text-[9px] md:text-[10px] font-bold text-fb-textSecondary uppercase">Archive</span>
                        </label>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {paginatedItems.length === 0 && (
                <div className="py-16 text-center opacity-30">
                  <div className="flex flex-col items-center">
                    <BookOpen size={32} className="mb-3" />
                    <p className="font-black uppercase text-[10px] tracking-widest italic">No courses found</p>
                  </div>
                </div>
              )}
            </div>

            {filtered.length > 0 && (
              <div className="p-6 bg-fb-gray/5 border-t flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-[10px] font-black uppercase text-fb-textSecondary tracking-widest">
                  Showing <span className="text-fb-textPrimary">{Math.min(currentPage * itemsPerPage, sorted.length)}</span> of <span className="text-fb-textPrimary">{sorted.length}</span> entries
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="p-2 bg-white border rounded-xl hover:bg-fb-gray disabled:opacity-30 transition-all text-fb-textPrimary shadow-sm"
                  >
                    <ChevronLeft size={18}/>
                  </button>
                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-9 h-9 rounded-xl font-black text-[10px] transition-all ${currentPage === page ? 'bg-fb-blue text-white shadow-md shadow-fb-blue/20' : 'bg-white border hover:bg-fb-gray text-fb-textSecondary'}`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="p-2 bg-white border rounded-xl hover:bg-fb-gray disabled:opacity-30 transition-all text-fb-textPrimary shadow-sm"
                  >
                    <ChevronRight size={18}/>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
      
      {isAdding && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-fb-textPrimary/20 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] md:rounded-[3rem] shadow-2xl overflow-hidden transform transition-all border border-fb-border">
            <form onSubmit={handleSubmit} className="px-8 md:px-12 pb-[15px] pt-[15px] space-y-[22px] max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-[22px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Course Name" name="name" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Title of course" />
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">Professor</label>
                    <div className="relative group">
                      <select className="w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none shadow-sm cursor-pointer" 
                        value={formData.instructorId || ""} 
                        onChange={(e) => {
                          const teacher = teachers.find(t => t.uid === e.target.value);
                          setFormData(p => ({ ...p, instructorId: e.target.value, professor: teacher ? formatName(teacher) : '' }));
                        }}>
                        <option value="" disabled>Select Instructor</option>
                        {teachers.map(t => (
                          <option key={t.uid} value={t.uid}>{formatName(t)}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-fb-textSecondary opacity-50 group-hover:opacity-100 transition-opacity">
                        <ChevronDown size={16} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">Year Level</label>
                    <div className="relative group">
                      <select className="w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none uppercase shadow-sm cursor-pointer" value={formData.yearLevel} onChange={(e) => setFormData(p => ({ ...p, yearLevel: e.target.value as any }))}>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-fb-textSecondary pointer-events-none" size={16} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">Semester</label>
                    <div className="relative group">
                      <select className="w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all appearance-none uppercase shadow-sm cursor-pointer" value={formData.semester} onChange={(e) => setFormData(p => ({ ...p, semester: e.target.value as any }))}>
                        <option value="1st Semester">1st Term</option>
                        <option value="2nd Semester">2nd Term</option>
                        <option value="3rd Semester">3rd Term</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-fb-textSecondary pointer-events-none" size={16} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="course-units" className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">Units</label>
                    <input
                      id="course-units"
                      name="units"
                      type="number"
                      inputMode="decimal"
                      min={0.5}
                      max={99}
                      step={0.5}
                      required
                      className="w-full bg-white border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all shadow-sm"
                      value={formData.units ?? ''}
                      onChange={(e) => setFormData(p => ({ ...p, units: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fb-textSecondary ml-1 uppercase tracking-widest">School Year</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full bg-white border-2 border-fb-gray rounded-2xl px-3 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all shadow-sm text-center" 
                        placeholder="YYYY"
                        value={formData.schoolYear?.split('-')[0] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const currentEnd = formData.schoolYear?.split('-')[1] || '';
                          setFormData(p => ({ ...p, schoolYear: `${val}-${currentEnd}` }));
                        }}
                      />
                      <span className="font-bold text-fb-textSecondary">-</span>
                      <input 
                        type="text" 
                        maxLength={4} 
                        className="w-full bg-white border-2 border-fb-gray rounded-2xl px-3 py-3.5 text-sm font-bold outline-none focus:border-fb-blue transition-all shadow-sm text-center" 
                        placeholder="YYYY"
                        value={formData.schoolYear?.split('-')[1] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const currentStart = formData.schoolYear?.split('-')[0] || '';
                          setFormData(p => ({ ...p, schoolYear: `${currentStart}-${val}` }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-[22px] pt-[22px] border-t border-fb-gray">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3 self-start">
                    <div className="p-2 bg-fb-blue/10 rounded-xl text-fb-blue">
                      <Repeat size={18} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fb-textPrimary italic">Recurrence</span>
                  </div>
                  <div className="flex bg-fb-gray p-1 rounded-2xl border-2 border-fb-border w-full md:w-auto">
                    <button type="button" onClick={() => setFormData(p => ({ ...p, isRecurring: false }))} className={`flex-1 md:flex-none px-5 md:px-7 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!formData.isRecurring ? 'bg-white text-fb-blue shadow-lg' : 'text-fb-textSecondary opacity-40 hover:opacity-100'}`}>Once</button>
                    <button type="button" onClick={() => setFormData(p => ({ ...p, isRecurring: true }))} className={`flex-1 md:flex-none px-5 md:px-7 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.isRecurring ? 'bg-fb-blue text-white shadow-lg' : 'text-fb-textSecondary opacity-40 hover:opacity-100'}`}>Recurring</button>
                  </div>
                </div>

                <div className="bg-fb-gray/30 p-6 md:p-8 rounded-[2rem] border-2 border-fb-border space-y-[22px]">
                  {!formData.isRecurring ? (
                    <div className="space-y-[22px] animate-in slide-in-from-top-4 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2"><FormField label="Session Date" name="date" type="date" value={formData.date} onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))} /><div className="hidden md:block"></div></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"><FormField label="Start Time" name="startTime" type="time" value={formData.startTime} onChange={(e) => setFormData(p => ({ ...p, startTime: e.target.value }))} /><FormField label="End Time" name="endTime" type="time" value={formData.endTime} onChange={(e) => setFormData(p => ({ ...p, endTime: e.target.value }))} /></div>
                    </div>
                  ) : (
                    <div className="space-y-[22px] animate-in slide-in-from-top-4 duration-300">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest block ml-1 italic opacity-60">Frequency</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {['Daily', 'Weekly', 'Bi-weekly', 'Monthly'].map((freq) => (
                            <button key={freq} type="button" onClick={() => { setFormData(p => { const nextFreq = freq as any; return { ...p, frequency: nextFreq, daysOfWeek: nextFreq === 'Daily' ? (p.daysOfWeek?.slice(0, 1) || []) : p.daysOfWeek }; }); }} className={`py-3 rounded-2xl border-2 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${formData.frequency === freq ? 'bg-fb-textPrimary border-fb-textPrimary text-white shadow-lg' : 'bg-white border-fb-gray text-fb-textSecondary opacity-40 hover:opacity-100'}`}>{freq}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest block ml-1 italic opacity-60">Active Days (Mon-Fri)</label>
                        <div className="grid grid-cols-5 gap-2">
                          {DAYS.map(day => (
                            <button key={day} type="button" onClick={() => toggleDayOfWeek(day)} className={`py-3 rounded-2xl border-2 font-black text-[10px] transition-all active:scale-95 flex-1 ${formData.daysOfWeek?.includes(day) ? 'bg-fb-blue border-fb-blue text-white shadow-lg' : 'bg-white border-fb-gray text-fb-textSecondary opacity-40 hover:opacity-100 hover:border-fb-border'}`}>{day}</button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"><FormField label="Start Time" name="startTime" type="time" value={formData.startTime} onChange={(e) => setFormData(p => ({ ...p, startTime: e.target.value }))} /><FormField label="End Time" name="endTime" type="time" value={formData.endTime} onChange={(e) => setFormData(p => ({ ...p, endTime: e.target.value }))} /></div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-1 flex flex-col md:flex-row justify-end gap-4">
                <button type="button" onClick={() => setIsAdding(false)} className="w-full md:w-auto px-10 py-3 font-black text-[11px] uppercase tracking-[0.2em] text-fb-textSecondary hover:bg-fb-gray rounded-2xl transition-all border border-fb-border">Cancel</button>
                <button type="submit" disabled={isProcessing} className="w-full md:w-auto bg-fb-blue text-white px-16 py-3 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-xl shadow-fb-blue/20 hover:bg-blue-600 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50">{isProcessing ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle size={18} />}<span>Save</span></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Popup Modal */}
      {dayDetailData && (
        <CalendarDayModal 
          data={dayDetailData} 
          onClose={() => setDayDetailData(null)} 
          onEditCourse={(course) => {
            setFormData(course);
            setEditingId(course.id);
            setIsAdding(true);
          }}
        />
      )}
    </div>
  );
};
