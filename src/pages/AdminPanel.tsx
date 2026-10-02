import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  GraduationCap,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Edit2,
  UserPlus,
  KeyRound,
  RotateCcw,
  Archive,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Database,
  Trash2,
} from 'lucide-react';

import { Card } from '../components/Card';
import { CleanUpRecordsModal } from '../components/modals/CleanUpRecordsModal';
import { ConfirmModal } from '../components/modals/ConfirmModal';
import { EditUserModal } from '../components/modals/EditUserModal';
import { EnrollModal } from '../components/modals/EnrollModal';
import { ErrorModal } from '../components/modals/ErrorModal';
import { PasswordResetModal } from '../components/modals/PasswordResetModal';
import { SuccessModal } from '../components/modals/SuccessModal';
import { PermissionDeniedGate } from '../components/PermissionDeniedGate';
import { HIDDEN_ADMIN_EMAILS } from '../constants';
import { ApiError } from '../lib/api';
import { archiveAccounts, createAccount, deleteAccount, enrollStudents, fetchUsers, restoreAccounts, updateAccount } from '../lib/data';
import { live } from '../lib/live';
import { formatName } from '../lib/format';
import type { UserProfile } from '../types';
import { toast } from '../lib/toast';

export const AdminPanel = ({ profile }: { profile: UserProfile }) => {
  const [allUsers, setAllUsers] = useState([] as UserProfile[]);
  const [archivedUsers, setArchivedUsers] = useState([] as UserProfile[]);
  const [isViewArchive, setIsViewArchive] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all' as 'all' | 'admin' | 'student');
  const [permissionError, setPermissionError] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [resettingPasswordUser, setResettingPasswordUser] = useState<UserProfile | null>(null);
  const [selectedToArchiveUsers, setSelectedToArchiveUsers] = useState([] as string[]);
  const [selectedToRestoreUsers, setSelectedToRestoreUsers] = useState([] as string[]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [yearLevelFilter, setYearLevelFilter] = useState('all' as 'all' | '1st Year' | '2nd Year' | 'none');
  const [sortOrder, setSortOrder] = useState('none' as 'none' | 'asc' | 'desc');
  const itemsPerPage = 10;

  const canManageAccounts = profile?.role === 'admin';

  const toggleSort = () => {
    setSortOrder(prev => prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none');
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, yearLevelFilter, isViewArchive]);

  useEffect(() => {
    const keep = (list: UserProfile[]) => list.filter((data) => data && (data.email || formatName(data)));
    const stopActive = live(() => fetchUsers({ status: 'current' }), (usersData) => {
      setAllUsers(keep(usersData));
      setPermissionError(false);
    }, (error) => {
      if (error instanceof ApiError && error.status === 403) {
        console.warn("Permission denied for active user list.");
        setPermissionError(true);
      }
    });
    const stopArchived = live(() => fetchUsers({ status: 'archived' }), (archivedData) => {
      setArchivedUsers(keep(archivedData));
    }, (error) => {
      console.warn("Archived Users collection check:", (error as Error).message);
    });
    return () => { stopActive(); stopArchived(); };
  }, []);

  // Enrollment into matching courses now happens on the server whenever an account changes.

  const handleSaveUser = async (updatedFields: Partial<UserProfile>) => {
    if (!editingUser) return;
    // Send only what changed: unchanged role/email fields would otherwise need admin rights.
    const same = (a: unknown, b: unknown) => (a ?? '') === (b ?? '');
    const changes: Partial<UserProfile> = {};
    for (const [key, value] of Object.entries(updatedFields)) {
      if (['uid', 'fullName', 'grades', 'editHistory', 'archivedAt', 'currentSessionId', 'tempPassword'].includes(key)) continue;
      if (!same(value, editingUser[key as keyof UserProfile])) (changes as Record<string, unknown>)[key] = value;
    }
    if (Object.keys(changes).length === 0) {
      setEditingUser(null);
      return;
    }
    try {
      await updateAccount(editingUser.uid, changes);
      if (changes.email) {
        setSuccessMsg(`Email updated successfully. ${changes.email} now signs in with the same password as before; their records are unchanged.`);
      } else {
        toast.success("Updated successfully.");
      }
      setEditingUser(null);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409 && changes.email) {
        toast.error("Cannot update email: The email address is already in use by another account. Please use a different email address.");
      } else {
        toast.error("Failed to update: " + err.message);
      }
    }
  };

  const handleCreateUser = async (newFields: Partial<UserProfile & { tempPassword?: string }>) => {
    const { email, tempPassword, role, firstName, lastName, ...otherData } = newFields;
    if (!email || !tempPassword || !firstName || !lastName) {
      setErrorMsg("First Name, Last Name, Email, and temporary password are required.");
      return;
    }

    try {
      const { uid: _uid, fullName: _fullName, grades: _grades, ...fields } = otherData as Partial<UserProfile>;
      await createAccount({ ...fields, email, firstName, lastName, role: role || 'student', tempPassword });
      setSuccessMsg(`Account created and registered successfully for ${email}`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setErrorMsg("Cannot create account: The email address is already in use by another account. Please use a different email address.");
      } else {
        setErrorMsg(`Account creation failed: ${err.message}`);
      }
    }
  };

  const handleBatchArchiveUsers = async () => {
    if (selectedToArchiveUsers.length === 0) return;
    setIsProcessing(true);
    try {
      await archiveAccounts(selectedToArchiveUsers);
      setSelectedToArchiveUsers([]);
      toast.success("Selected accounts archived.");
    } catch (err: any) {
      toast.error("Archive failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchRestoreUsers = async () => {
    if (selectedToRestoreUsers.length === 0) return;
    setIsProcessing(true);
    try {
      await restoreAccounts(selectedToRestoreUsers);
      setSelectedToRestoreUsers([]);
      toast.success("Selected accounts restored.");
    } catch (err: any) {
      toast.error("Restore failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Permanently deletes the selected archived accounts, one at a time so one refusal
  // (e.g. a student with issued transcripts) doesn't block the rest.
  const handleBatchDeleteUsers = async () => {
    setConfirmingDelete(false);
    const ids = [...selectedToRestoreUsers];
    if (ids.length === 0) return;
    setIsProcessing(true);
    const failed: { uid: string; reason: string }[] = [];
    for (const uid of ids) {
      try {
        await deleteAccount(uid);
      } catch (err: any) {
        const user = archivedUsers.find((u) => u.uid === uid);
        failed.push({ uid, reason: `${user ? formatName(user) : uid}: ${err.message}` });
      }
    }
    const deleted = ids.length - failed.length;
    // Keep the ones that couldn't be deleted selected, so it's clear which they are.
    setSelectedToRestoreUsers(failed.map((f) => f.uid));
    setIsProcessing(false);
    const summary = `Deleted ${deleted} account${deleted === 1 ? '' : 's'}.`;
    if (failed.length) setErrorMsg(`${summary} ${failed.length} could not be deleted:\n${failed.map((f) => f.reason).join('\n')}`);
    else setSuccessMsg(summary);
  };

  const handleEnroll = async (yearLevel: string, batchName: string, schoolYear: string) => {
    if (selectedToArchiveUsers.length === 0) {
      toast.error("No students selected.");
      return;
    }

    setIsProcessing(true);
    try {
      const studentIds = selectedToArchiveUsers.filter((uid) => allUsers.find(u => u.uid === uid)?.role === 'student');
      if (studentIds.length > 0) await enrollStudents(studentIds, yearLevel, batchName, schoolYear);
      setSelectedToArchiveUsers([]);
      setIsEnrolling(false);
      toast.success("Successfully enrolled selected students.");
    } catch (err: any) {
      toast.error("Enrollment failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleUserSelection = (uid: string) => {
    if (isViewArchive) {
      setSelectedToRestoreUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    } else {
      setSelectedToArchiveUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    }
  };

  const currentUsers = isViewArchive ? archivedUsers : allUsers;
  const filteredUsers = useMemo(() => {
    return currentUsers.filter(u => {
      // Hide specific admin accounts from the interface
      if (HIDDEN_ADMIN_EMAILS.includes(u.email || '')) return false;
      
      const term = search.toLowerCase();
      const matchesSearch = formatName(u).toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term);
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesYear = 
        yearLevelFilter === 'all' ? true : 
        yearLevelFilter === 'none' ? !u.yearLevel : 
        u.yearLevel === yearLevelFilter;
      return matchesSearch && matchesRole && matchesYear;
    }).sort((a, b) => {
      const nameA = formatName(a).toLowerCase();
      const nameB = formatName(b).toLowerCase();
      if (sortOrder === 'asc') return nameA.localeCompare(nameB);
      if (sortOrder === 'desc') return nameB.localeCompare(nameA);
      return nameA.localeCompare(nameB);
    });
  }, [currentUsers, search, roleFilter, yearLevelFilter, sortOrder]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (permissionError) return <PermissionDeniedGate message="Insufficient permissions to load user directory" />;

  const isAnySelected = isViewArchive ? selectedToRestoreUsers.length > 0 : selectedToArchiveUsers.length > 0;

  return (
    <div className="space-y-6 pb-10">
      <Card noPadding>
        {/* Uniform Header Layout matching Course Page - 40/15/15/15/15 grid */}
        <div className="p-3 md:p-4 lg:p-5 flex flex-col md:flex-row gap-3 md:gap-4 border-b border-fb-border items-start">
          {/* Search Box - 30% */}
          <div className="w-full md:w-[30%] relative">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={14} />
            <input 
              type="text" 
              placeholder="Search users..." 
              className="w-full h-full bg-fb-gray border border-transparent rounded-full pl-9 md:pl-10 pr-9 md:pr-10 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[10px] md:text-xs font-semibold transition-all" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white rounded-full text-fb-textSecondary transition-all"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Role Filter - 15% */}
          <div className="w-full md:w-[15%] relative">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)} className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer">
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="president">President</option>
              <option value="vice president">Vice President</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
            </select>
          </div>

          {/* Year Level Filter - 15% */}
          <div className="w-full md:w-[15%] relative">
            <select value={yearLevelFilter} onChange={(e) => setYearLevelFilter(e.target.value as any)} className="w-full h-full bg-fb-gray border border-transparent rounded-full px-3 md:px-4 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-fb-blue text-[9px] md:text-[10px] font-bold transition-all appearance-none cursor-pointer">
              <option value="all">All Years</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
              <option value="none">No Year Level</option>
            </select>
          </div>
          
          {/* Registry/Archive Toggle - 15% */}
          {canManageAccounts ? (
            <button 
              onClick={() => { setIsViewArchive(!isViewArchive); setSearch(''); setSelectedToArchiveUsers([]); setSelectedToRestoreUsers([]); }}
              className={`w-full md:w-[15%] py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-sm transition-all flex items-center justify-center gap-2 border ${isViewArchive ? 'bg-fb-textPrimary text-white' : 'bg-white text-fb-textSecondary hover:bg-fb-hover'}`}
            >
              {isViewArchive ? <Database size={12} /> : <Archive size={12} />}
              <span>{isViewArchive ? "Registry" : "Archive"}</span>
            </button>
          ) : (
            <div className="w-full md:w-[15%]"></div>
          )}

          {/* Action Column - 25% */}
          <div className="w-full md:w-[25%] flex flex-col gap-2">
            {canManageAccounts && (
              <>
                <div className="flex gap-2 w-full">
                  <button onClick={() => setIsCreating(true)} className="flex-1 bg-fb-blue text-white py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-1">
                    <UserPlus size={14} /><span>Add Account</span>
                  </button>
                  <button onClick={() => setIsCleaningUp(true)} className="flex-1 bg-amber-500 text-white py-1.5 md:py-2 rounded-full font-bold text-[9px] md:text-[10px] shadow-md hover:bg-amber-600 transition-all flex items-center justify-center gap-1">
                    <RefreshCw size={14} /><span>Clean Up</span>
                  </button>
                </div>
                
                {isAnySelected && (
                  <div className="flex flex-col gap-2 w-full animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 w-full">
                      {!isViewArchive && (
                        <button 
                          onClick={() => setIsEnrolling(true)}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-1 py-1 md:py-1.5 rounded-full text-[9px] md:text-[9px] font-black uppercase transition-all shadow-md bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          <GraduationCap size={10} />
                          <span>Enroll</span>
                        </button>
                      )}
                      <button 
                        onClick={isViewArchive ? handleBatchRestoreUsers : handleBatchArchiveUsers}
                        disabled={isProcessing}
                        className={`flex-1 flex items-center justify-center gap-1 py-1 md:py-1.5 rounded-full text-[9px] md:text-[9px] font-black uppercase transition-all shadow-md ${isViewArchive ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-red-600 text-white hover:bg-red-700'}`}
                      >
                        {isProcessing ? <RefreshCw className="animate-spin" size={10}/> : (isViewArchive ? <RotateCcw size={10}/> : <Archive size={10}/>)}
                        <span>{isViewArchive ? `Restore` : `Archive`}</span>
                      </button>
                      {isViewArchive && (
                        <button
                          onClick={() => setConfirmingDelete(true)}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-1 py-1 md:py-1.5 rounded-full text-[9px] md:text-[9px] font-black uppercase transition-all shadow-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          <Trash2 size={10} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <span className="text-fb-textSecondary text-[9px] font-black uppercase whitespace-nowrap tracking-tighter">
                        {isViewArchive ? selectedToRestoreUsers.length : selectedToArchiveUsers.length} Selected
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead className="bg-fb-gray/50 border-b">
              <tr className="text-left font-black uppercase text-fb-textSecondary tracking-widest">
                <th className="py-4 px-6">
                  <div className="flex items-center gap-2">
                    <span>User</span>
                    <button onClick={toggleSort} className={`p-1 rounded transition-all ${sortOrder !== 'none' ? 'text-fb-blue' : 'hover:bg-fb-gray'}`}>
                      {sortOrder === 'none' ? <ArrowUpDown size={12}/> : sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                    </button>
                  </div>
                </th>
                <th className="py-4 px-6">Role</th>
                {isViewArchive && <th className="py-4 px-6 text-center">Archived Date</th>}
                {canManageAccounts && <th className="py-4 px-6 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedUsers.map(u => {
                const isSelected = isViewArchive ? selectedToRestoreUsers.includes(u.uid) : selectedToArchiveUsers.includes(u.uid);
                return (
                  <tr key={u.uid} className={`hover:bg-fb-hover transition-all ${isSelected ? 'bg-fb-blue/5' : ''}`}>
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <p className="font-bold text-fb-textPrimary capitalize italic">{formatName(u)}</p>
                        <p className="text-[10px] text-fb-textSecondary opacity-60 font-medium">{u.email}</p>
                        {u.studentId && <p className="text-[9px] font-black uppercase text-fb-blue mt-0.5 tracking-tighter">ID: {u.studentId}</p>}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${u.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-fb-blue/5 text-fb-blue'}`}>{u.role}</span>
                        {u.role === 'admin' && u.adminCategory && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100/50 px-2 py-0.5 rounded border border-amber-200">{u.adminCategory}</span>
                        )}
                      </div>
                    </td>
                    {isViewArchive && (
                      <td className="py-4 px-6 text-center">
                        <span className="text-[10px] font-bold text-fb-textSecondary uppercase italic">
                          {u.archivedAt ? new Date(u.archivedAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                        </span>
                      </td>
                    )}
                    {canManageAccounts && (
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-6">
                          {!isViewArchive && canManageAccounts && (
                            <>
                              <div className="flex flex-col items-center gap-1 group">
                                <button onClick={() => setEditingUser(u)} className="p-2 hover:bg-fb-gray rounded-lg transition-colors">
                                  <Edit2 size={16} className="text-fb-textSecondary group-hover:text-fb-blue" />
                                </button>
                                <span className="text-[9px] font-black uppercase text-fb-textSecondary opacity-60">Edit</span>
                              </div>
                              <div className="flex flex-col items-center gap-1 group">
                                <button onClick={() => setResettingPasswordUser(u)} className="p-2 hover:bg-fb-gray rounded-lg transition-colors">
                                  <KeyRound size={16} className="text-fb-textSecondary group-hover:text-fb-blue" />
                                </button>
                                <span className="text-[9px] font-black uppercase text-fb-textSecondary opacity-60 text-center w-16 leading-tight">Password Reset</span>
                              </div>
                            </>
                          )}
                          {canManageAccounts && (
                            <div className="flex flex-col items-center gap-1">
                              <div className="p-2">
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => toggleUserSelection(u.uid)}
                                  className="w-4 h-4 rounded border-fb-border text-fb-blue focus:ring-fb-blue cursor-pointer"
                                />
                              </div>
                              <span className="text-[9px] font-black uppercase text-fb-textSecondary opacity-60">
                                {isViewArchive ? "Restore" : "Select"}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={2 + (isViewArchive ? 1 : 0) + (canManageAccounts ? 1 : 0)} className="py-20 text-center opacity-30">
                    <div className="flex flex-col items-center">
                      <Users size={48} className="mb-4" />
                      <p className="font-black uppercase text-[10px] tracking-widest italic">No accounts found in {isViewArchive ? 'Archive' : 'Registry'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden flex flex-col divide-y">
          {paginatedUsers.map(u => {
            const isSelected = isViewArchive ? selectedToRestoreUsers.includes(u.uid) : selectedToArchiveUsers.includes(u.uid);
            return (
              <div key={u.uid} className={`p-4 flex flex-col gap-3 ${isSelected ? 'bg-fb-blue/5' : ''}`}>
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <p className="font-bold text-fb-textPrimary text-sm capitalize italic">{formatName(u)}</p>
                    <p className="text-xs text-fb-textSecondary opacity-60 font-medium">{u.email}</p>
                    {u.studentId && <p className="text-[10px] font-black uppercase text-fb-blue mt-1 tracking-tighter">ID: {u.studentId}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${u.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-fb-blue/5 text-fb-blue'}`}>{u.role}</span>
                    {u.role === 'admin' && u.adminCategory && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100/50 px-2 py-0.5 rounded border border-amber-200">{u.adminCategory}</span>
                    )}
                  </div>
                </div>
                
                {isViewArchive && (
                  <div className="text-[10px] font-bold text-fb-textSecondary uppercase italic">
                    Archived: {u.archivedAt ? new Date(u.archivedAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                  </div>
                )}

                {canManageAccounts && (
                  <div className="flex items-center justify-end gap-4 pt-2 border-t border-dashed border-fb-border/50">
                    {!isViewArchive && canManageAccounts && (
                      <>
                        <button onClick={() => setEditingUser(u)} className="flex items-center gap-1.5 px-3 py-1.5 bg-fb-gray rounded-lg text-[10px] font-bold text-fb-textSecondary uppercase">
                          <Edit2 size={12} /> Edit
                        </button>
                        <button onClick={() => setResettingPasswordUser(u)} className="flex items-center gap-1.5 px-3 py-1.5 bg-fb-gray rounded-lg text-[10px] font-bold text-fb-textSecondary uppercase">
                          <KeyRound size={12} /> Password Reset
                        </button>
                      </>
                    )}
                    {canManageAccounts && (
                      <label className="flex items-center gap-2 px-3 py-1.5 bg-fb-gray rounded-lg cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleUserSelection(u.uid)}
                          className="w-3 h-3 rounded border-fb-border text-fb-blue focus:ring-fb-blue"
                        />
                        <span className="text-[10px] font-bold text-fb-textSecondary uppercase">
                          {isViewArchive ? "Restore" : "Select"}
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div className="py-16 text-center opacity-30">
              <div className="flex flex-col items-center">
                <Users size={32} className="mb-3" />
                <p className="font-black uppercase text-[10px] tracking-widest italic">No accounts found</p>
              </div>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-fb-border flex items-center justify-between bg-white">
            <p className="text-[10px] font-black uppercase text-fb-textSecondary opacity-60">
              Showing {Math.min(filteredUsers.length, (currentPage - 1) * itemsPerPage + 1)} to {Math.min(filteredUsers.length, currentPage * itemsPerPage)} of {filteredUsers.length} accounts
            </p>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`p-2 rounded-lg transition-all ${currentPage === 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-fb-gray text-fb-blue'}`}
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-fb-blue text-white shadow-md' : 'hover:bg-fb-gray text-fb-textSecondary'}`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`p-2 rounded-lg transition-all ${currentPage === totalPages ? 'opacity-30 cursor-not-allowed' : 'hover:bg-fb-gray text-fb-blue'}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={handleSaveUser} />}
      {isCreating && <EditUserModal isNew={true} user={{ role: 'student' }} onClose={() => setIsCreating(false)} onSave={handleCreateUser} />}
      {isCleaningUp && <CleanUpRecordsModal students={allUsers} onClose={() => setIsCleaningUp(false)} onSuccess={(msg) => setSuccessMsg(msg)} onError={(msg) => setErrorMsg(msg)} />}
      {isEnrolling && (
        <EnrollModal 
          selectedUsers={allUsers.filter(u => selectedToArchiveUsers.includes(u.uid))}
          onClose={() => setIsEnrolling(false)} 
          onEnroll={handleEnroll} 
        />
      )}
      {resettingPasswordUser && <PasswordResetModal user={resettingPasswordUser} onClose={() => setResettingPasswordUser(null)} />}
      <ConfirmModal
        isOpen={confirmingDelete}
        title="Delete permanently?"
        message={`This permanently deletes ${selectedToRestoreUsers.length} archived account${selectedToRestoreUsers.length === 1 ? '' : 's'}: their logins, profiles, grades and attendance. This can't be undone. Students with issued transcripts and teachers who uploaded course files are kept.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={handleBatchDeleteUsers}
        onCancel={() => setConfirmingDelete(false)}
      />
      {successMsg && <SuccessModal message={successMsg} onClose={() => setSuccessMsg(null)} />}
      {errorMsg && <ErrorModal message={errorMsg} onClose={() => setErrorMsg(null)} />}
    </div>
  );
};
